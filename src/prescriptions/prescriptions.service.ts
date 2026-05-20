import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreatePrescriptionDto, CreatePrescriptionFromTemplateDto } from './dto/create-prescription.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { PrescriptionAction, PrescriptionStatus, RenewalStatus, UserRole } from '@prisma/client';
import { TimeUtils } from 'src/common/utils/time.utils';
import { MedicationDto } from './dto/medication.dto';
import { DrugInteraction, PrescriptionCacheService } from 'src/common/cache/prescription-cache.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { UserCacheService } from 'src/common/cache/user-cache.service';

@Injectable()
export class PrescriptionsService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private prescriptionCache: PrescriptionCacheService,
    private userCache: UserCacheService,
    private configService: ConfigService,
    private httpService: HttpService,
  ) { }
  private readonly logger = new Logger(PrescriptionsService.name);

  async createPrescription(
    doctorId: string,
    connectionId: string,
    dto: CreatePrescriptionDto,
  ) {
    const connection = await this.validateConnection(connectionId, doctorId);

    if (connection.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'You can only prescribe for active connections',
      );
    }
    // Validate prescription data
    this.validatePrescriptionDates(dto.expiresAt);
    // Validate medications
    this.validateMedications(dto.medications);

    // 4. Check drug interactions
    const drugNames = dto.medications.map((m) => m.drugName);
    const interactions = await this.checkDrugInteractions(drugNames);

    // If contraindicated, reject
    const contraindicated = interactions.flatMap((i) =>
      i.interactions.filter((int) => int.severity === 'CONTRAINDICATED'),
    );

    if (contraindicated.length > 0) {
      throw new BadRequestException({
        message: 'Prescription rejected due to contraindicated drug interactions',
        contraindicated,
      });
    }

    // 5. Create prescription in transaction
    const prescription = await this.prisma.$transaction(async (tx) => {
      // Create prescription
      const p = await tx.prescription.create({
        data: {
          doctorId,
          connectionId,
          patientId: connection.patientId,
          medications: JSON.stringify(dto.medications),
          notes: dto.notes,
          prescribedAt: new Date(),
          updateAt: new Date(),
        },
        select: {
          id: true,
          doctor: {
            select: {
              user: {
                select: { firstName: true, lastName: true },
              },
            },
          },
        },
      });

      // Create history entry
      await tx.prescriptionHistory.create({
        data: {
          prescriptionId: p.id,
          newStatus: PrescriptionStatus.ACTIVE,
          changedBy: doctorId,
          action: PrescriptionAction.CREATE,
          metadata: { interactions } as any,
        },
      });

      return p;
    });

    // 6. Invalidate cache
    await this.userCache.invalidateUser(connection.patientId);
    await this.prescriptionCache.invalidatePatientPrescriptions(connection.patientId);

    // 7. Notify patient
    this.eventEmitter.emit('notification.trigger', {
      userId: connection.patientId,
      type: 'NEW_PRESCRIPTION',
      data: {
        prescriptionId: prescription.id,
        doctorName: `${prescription.doctor.user.firstName} ${prescription.doctor.user.lastName}`,
        actionUrl: `/prescriptions/${prescription.id}`,
      },
    });

    return {
      message: 'Prescription created successfully',
      prescription,
    };
  }

  /**
  * Create prescription from template
  */
  async createPrescriptionFromTemplate(
    doctorId: string,
    createDto: CreatePrescriptionFromTemplateDto,
  ) {
    // 1. Get template
    const template = await this.prisma.prescriptionTemplate.findUnique({
      where: { id: createDto.templateId },
      include: { medications: true },
    });

    if (!template || template.doctorId !== doctorId) {
      throw new NotFoundException('Template not found');
    }

    if (!template.isActive) {
      throw new BadRequestException('Template is inactive');
    }

    // 2. Combine template medications with additional ones
    const allMedications: MedicationDto[] = [
      ...template.medications.map((m) => ({
        drugName: m.drugName,
        dosage: m.dosage,
        frequency: m.frequency,
        duration: m.duration,
        instructions: m.instructions || undefined,
        sideEffects: m.sideEffects || undefined,
        warnings: m.warnings || undefined,
      })),
      ...(createDto.additionalMedications || []),
    ];

    // 3. Reuse createPrescription logic
    return this.createPrescription(doctorId, createDto.connectionId, {
      connectionId: createDto.connectionId,
      medications: allMedications,
      notes: createDto.notes || template.notes || undefined,
      expiresAt: createDto.expiresAt,
    });
  }



  // Get all prescriptions for a connection
  async getConnectionPrescriptions(
    connectionId: string,
    userId: string,
    userRole: UserRole,
  ) {
    const connection =
      await this.prisma.doctorPatientConnection.findUniqueOrThrow({
        where: { id: connectionId },
        include: {
          doctor: { include: { user: true } },
          patient: { include: { user: true } },
        },
      });

    // Check access permission
    const hasAccess =
      (userRole === 'DOCTOR' && connection.doctor.userId === userId) ||
      (userRole === 'PATIENT' && connection.patient.userId === userId);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this connection');
    }

    const prescriptions = await this.prisma.prescription.findMany({
      where: { connectionId },
      include: {
        ...this.doctorInclude,
      },
      orderBy: {
        prescribedAt: 'desc',
      },
    });
    return prescriptions;
  }
  // Get all patient prescriptions (Patient view)
  async getMyPrescriptions(patientId: string, isActive?: boolean) {
    const where: any = { patientId };

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const prescriptions = await this.prisma.prescription.findMany({
      where,
      include: {
        ...this.doctorInclude,
        connection: {
          select: { id: true, status: true },
        },
      },
      orderBy: {
        prescribedAt: 'desc',
      },
    });
    return prescriptions;
  }
  // Get all patient prescriptions (Doctor view)
  async getPatientPrescriptions(doctorId: string, patientId: string) {
    // 1. Check domain cache first
    let prescriptions = await this.prescriptionCache.getPatientPrescriptions(patientId);

    if (!prescriptions) {
      // 2. Verify connection exists
      const connection = await this.prisma.doctorPatientConnection.findUnique({
        where: {
          doctorId_patientId: {
            doctorId,
            patientId,
          },
        },
      });

      if (!connection) {
        throw new NotFoundException('No active connection found with this patient');
      }

      // 3. Fetch from DB
      prescriptions = await this.prisma.prescription.findMany({
        where: { patientId },
        include: {
          doctor: { select: { user: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: {
          prescribedAt: 'desc',
        },
      });

      // 4. Store in domain cache
      await this.prescriptionCache.cachePatientPrescriptions(patientId, prescriptions);
    }

    // 5. Return structured and filtered results
    return {
      all: prescriptions,
      active: prescriptions.filter((p) => p.status === PrescriptionStatus.ACTIVE),
      expired: prescriptions.filter((p) => p.status === PrescriptionStatus.EXPIRED),
      cancelled: prescriptions.filter((p) => p.status === PrescriptionStatus.CANCELLED),
      stats: {
        total: prescriptions.length,
        activeCount: prescriptions.filter((p) => p.status === PrescriptionStatus.ACTIVE).length,
      },
    };
  }
  //Get doctor's prescriptions with statistics
  async getDoctorPrescriptions(doctorId: string, stats: PrescriptionStatus) {
    const prescriptions = await this.prisma.prescription.findMany({
      where: { doctorId },
      include: {
        patient: { select: { user: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { prescribedAt: 'desc' },
    });
    return {
      all: prescriptions,
      active: prescriptions.filter((p) => p.status === PrescriptionStatus.ACTIVE),
      expired: prescriptions.filter((p) => p.status === PrescriptionStatus.EXPIRED),
      pendingRenewals: await this.prisma.prescriptionRenewal.count({
        where: { status: 'PENDING' },
      }),
      stats: {
        total: prescriptions.length,
        activeCount: prescriptions.filter((p) => p.status === PrescriptionStatus.ACTIVE).length,
      },
    };
  }
  // GET SINGLE PRESCRIPTION
  async getPrescription(
    prescriptionId: string,
    userId: string,
  ) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        doctor: { select: { user: { select: { firstName: true, lastName: true } } } },
        patient: { select: { user: { select: { firstName: true, lastName: true } } } },
        renewals: true,
        history: { orderBy: { changedAt: 'desc' } },
      },
    });
    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }
    // Authorization
    if (prescription.doctorId !== userId && prescription.patientId !== userId) {
      throw new BadRequestException('Unauthorized to view this prescription');
    }
    await this.prisma.prescriptionHistory.create({
      data: {
        prescriptionId,
        previousStatus: prescription.status,
        newStatus: prescription.status,
        changedBy: userId,
        action: PrescriptionAction.VIEW,
        metadata: { userRole: prescription.doctorId === userId ? 'DOCTOR' : 'PATIENT' },
      },
    });
    return prescription;
  }

  // CANCEL PRESCRIPTION (Doctor only)
  async cancelPrescription(prescriptionId: string, doctorId: string, reason?: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        doctor: { select: { user: { select: { firstName: true, lastName: true } } } },
        patient: { select: { userId: true } }
      }
    });

    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }

    if (prescription.doctorId !== doctorId) {
      throw new ForbiddenException(
        'You can only deactivate your own prescriptions',
      );
    }
    if (prescription.status === PrescriptionStatus.CANCELLED) {
      throw new BadRequestException('Prescription is already cancelled');
    }
    if (prescription.status === PrescriptionStatus.EXPIRED) {
      throw new BadRequestException('Cannot cancel an expired prescription');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.prescription.update({
        where: { id: prescriptionId },
        data: {
          status: PrescriptionStatus.CANCELLED,
          isActive: false,
        },
      });

      await tx.prescriptionHistory.create({
        data: {
          prescriptionId,
          previousStatus: prescription.status,
          newStatus: PrescriptionStatus.CANCELLED,
          changedBy: doctorId,
          action: PrescriptionAction.CANCEL,
          reason,
        },
      });

      await tx.prescriptionRenewal.updateMany({
        where: { prescriptionId, status: RenewalStatus.PENDING },
        data: { status: RenewalStatus.REJECTED, rejectionReason: reason || 'Doctor cancelled the prescription' },
      });
      return result;
    });

    // Invalidate cache
    await this.prescriptionCache.invalidatePatientPrescriptions(prescription.patientId);

    // Notify patient
    this.eventEmitter.emit('notification.trigger', {
      userId: prescription.patient.userId,
      type: 'PRESCRIPTION_CANCELLED',
      data: {
        prescriptionId: prescription.id,
        doctorName: `${prescription.doctor.user.firstName} ${prescription.doctor.user.lastName}`,
        reason: reason || 'No reason provided',
        actionUrl: `/prescriptions/${prescription.id}`,
      },
    });

    return updated;
  }

  // ===============================================
  // GET ACTIVE PRESCRIPTIONS COUNT
  // ===============================================
  async getActivePrescriptionsCount(patientId: string): Promise<number> {
    return this.prisma.prescription.count({
      where: {
        patientId,
        isActive: true,
      },
    });
  }

  private readonly patientInclude = {
    patient: {
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    },
  };

  private readonly doctorInclude = {
    doctor: {
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        specialization: true,
      },
    },
  };

  async checkDrugInteractions(
    drugNames: string[],
  ): Promise<
    Array<{
      drugName: string;
      interactions: Array<{
        drugName: string;
        severity: 'LOW' | 'MODERATE' | 'HIGH' | 'CONTRAINDICATED';
        description: string;
        recommendation: string;
      }>;
    }>
  > {
    const results: DrugInteraction[] = [];

    for (const drugName of drugNames) {
      // 1. Check domain cache first
      const cached = await this.prescriptionCache.getDrugInteraction(drugName);
      if (cached) {
        results.push(cached);
        continue;
      }

      // 2. Fetch from OpenFDA
      const interactions = await this.fetchInteractionsFromOpenFDA(drugName);

      const interactionData = {
        drugName,
        interactions,
      };

      // 3. Store in domain cache for future requests
      await this.prescriptionCache.cacheDrugInteraction(interactionData);
      results.push(interactionData);
    }

    return results;
  }

  /**
   * Fetches drug interaction information from OpenFDA API
   */
  private async fetchInteractionsFromOpenFDA(drugName: string) {
    const apiKey = this.configService.get<string>('OPENFDA_API_KEY');
    const baseUrl = this.configService.get<string>('OPENFDA_BASE_URL', 'https://api.fda.gov/drug/label.json');

    try {
      this.logger.log(`Fetching interactions for ${drugName} from OpenFDA...`);

      const response = await firstValueFrom(
        this.httpService.get(baseUrl, {
          params: {
            search: `openfda.brand_name:"${drugName}" OR openfda.generic_name:"${drugName}"`,
            limit: 1,
            api_key: apiKey,
          },
        }),
      );

      const labelData = response.data.results?.[0];
      if (!labelData || !labelData.drug_interactions) {
        return [];
      }

      // OpenFDA returns an array of strings for drug_interactions
      // We'll map this to our structured format
      return labelData.drug_interactions.map((desc: string) => ({
        drugName: 'General/Specified in text',
        severity: this.detectSeverity(desc),
        description: desc.substring(0, 500), // Limit length
        recommendation: 'Consult with a pharmacist or physician for specific details.',
      }));
    } catch (error) {
      this.logger.error(`OpenFDA error for ${drugName}: ${error.message}`);
      return [];
    }
  }

  /**
   * Basic severity detection based on keywords in the description
   */
  private detectSeverity(description: string): 'LOW' | 'MODERATE' | 'HIGH' | 'CONTRAINDICATED' {
    const desc = description.toUpperCase();
    if (desc.includes('CONTRAINDICATED') || desc.includes('FATAL') || desc.includes('DEATH')) {
      return 'CONTRAINDICATED';
    }
    if (desc.includes('SEVERE') || desc.includes('SERIOUS') || desc.includes('HIGH RISK')) {
      return 'HIGH';
    }
    if (desc.includes('MODERATE') || desc.includes('MONITOR')) {
      return 'MODERATE';
    }
    return 'LOW';
  }

  // ==================== PRIVATE HELPERS ====================
  private async validateConnection(connectionId: string, doctorId: string) {
    const connection = await this.prisma.doctorPatientConnection.findUnique({
      where: { id: connectionId },
      include: {
        patient: { include: { user: true } },
        doctor: { include: { user: true } },
      },
    });

    if (!connection) {
      throw new NotFoundException('Connection not found');
    }
    if (connection.doctorId !== doctorId) {
      throw new ForbiddenException(
        'You can only prescribe for your own patients',
      );
    }
    return connection;
  }

  private validatePrescriptionDates(expiresAt: string) {
    const now = new Date();
    const expiryDate = new Date(expiresAt);
    const maxExpiryDate = TimeUtils.addDays(now, 365); // Max 1 year validity
    if (expiryDate <= now) {
      throw new ForbiddenException('Expiry date must be in the future');
    }
    if (expiryDate > maxExpiryDate) {
      throw new ForbiddenException('Expiry date cannot be more than 1 year in the future');
    }

    return true;
  }
  private validateMedications(medications: MedicationDto[]) {
    if (!medications || medications.length === 0) {
      throw new ForbiddenException('At least one medication is required');
    }
    for (const med of medications) {
      if (!med.drugName || !med.dosage || !med.frequency || !med.duration) {
        throw new ForbiddenException('All medication fields are required');
      }
    }
    return true;
  }
  private async validateRenewalEligibility(prescription: any) {
    if (prescription.status === PrescriptionStatus.EXPIRED) {
      // Allow renewal within 7 days of expiry
      const sevenDaysAfterExpiry = TimeUtils.addDays(
        prescription.expiresAt,
        7,
      );
      if (new Date() > sevenDaysAfterExpiry) {
        throw new BadRequestException(
          'Cannot renew prescription more than 7 days after expiry',
        );
      }
    } else if (
      prescription.status === PrescriptionStatus.CANCELLED) {
      throw new BadRequestException(
        `Cannot renew a cancelled prescription`,
      );
    }

    // Check renewal count
    if (prescription.renewalCount >= prescription.maxRenewals) {
      throw new BadRequestException(
        `Maximum renewals (${prescription.maxRenewals}) reached`,
      );
    }

    // Prescription must be at least 7 days old
    const minAge = TimeUtils.addDays(prescription.prescribedAt, 7);
    if (new Date() < minAge) {
      throw new BadRequestException(
        'Cannot renew prescription within 7 days of creation',
      );
    }
  }
}
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CreatePrescriptionDto,
  CreatePrescriptionFromTemplateDto,
} from '../dto/create-prescription.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  PrescriptionAction,
  PrescriptionStatus,
  RenewalStatus,
  UserRole,
} from '@prisma/client';
import { TimeUtils } from 'src/common/utils/time.utils';
import { MedicationDto } from '../dto/medication.dto';
import {
  DrugInteraction,
  PrescriptionCacheService,
} from 'src/common/cache/prescription-cache.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { UserCacheService } from 'src/common/cache/user-cache.service';

@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly prescriptionCache: PrescriptionCacheService,
    private readonly userCache: UserCacheService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}
  private readonly logger = new Logger(PrescriptionsService.name);

  async createPrescription(userId: string, dto: CreatePrescriptionDto) {
    const connection = await this.validateConnection(dto.connectionId, userId);

    if (connection.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'You can only prescribe for active connections',
      );
    }
    this.validatePrescriptionDates(dto.expiresAt);
    this.validateMedications(dto.medications);

    //  Check drug interactions
    const drugNames = dto.medications.map((m) => m.drugName);
    const interactions = await this.checkDrugInteractions(drugNames);

    const contraindicated = interactions.flatMap((i) =>
      i.interactions.filter((int) => int.severity === 'CONTRAINDICATED'),
    );

    if (contraindicated.length > 0) {
      throw new BadRequestException({
        message:
          'Prescription rejected due to contraindicated drug interactions',
        contraindicated,
      });
    }

    //  Create prescription in transaction
    const prescription = await this.prisma.$transaction(async (tx) => {
      const p = await tx.prescription.create({
        data: {
          doctorId: connection.doctorId,
          connectionId: connection.id,
          patientId: connection.patientId,
          expireAt: dto.expiresAt,
          notes: dto.notes,
          prescribedAt: new Date(),
          updateAt: new Date(),
          status: 'ACTIVE',
          prescriptionMedications: {
            create: dto.medications.map((m) => ({
              drugName: m.drugName,
              dosage: m.dosage,
              frequency: m.frequency,
              duration: m.duration,
              instructions: m.instructions,
            })),
          },
        },
        select: {
          id: true,
          patientId: true,
          doctor: {
            select: {
              user: {
                select: { firstName: true, lastName: true },
              },
            },
          },
        },
      });
      if (dto.templateId) {
        await tx.prescriptionTemplate.update({
          where: { id: dto.templateId },
          data: {
            usageCount: { increment: 1 },
          },
        });
      }

      // Create history entry
      await tx.prescriptionHistory.create({
        data: {
          prescriptionId: p.id,
          newStatus: PrescriptionStatus.ACTIVE,
          changedBy: connection.doctorId,
          action: PrescriptionAction.CREATE,
          metadata: { interactions } as any,
        },
      });

      return p;
    });

    // Invalidate cache
    await this.userCache.invalidateUser(prescription.patientId);
    await this.prescriptionCache.invalidatePatientPrescriptions(
      prescription.patientId,
    );

    //  Notify patient
    this.eventEmitter.emit('notification.trigger', {
      userId: prescription.patientId,
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
    userId: string,
    createDto: CreatePrescriptionFromTemplateDto,
  ) {
    // 1. Get template
    const template = await this.prisma.prescriptionTemplate.findUnique({
      where: { id: createDto.templateId },
      include: {
        medications: true,
        doctor: { select: { userId: true } },
      },
    });

    if (!template || template.doctor.userId !== userId) {
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

    //  Reuse createPrescription logic
    return this.createPrescription(userId, {
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
      select: {
        id: true,
        status: true,
        doctor: {
          select: {
            user: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: {
        prescribedAt: 'desc',
      },
    });
    return prescriptions;
  }
  // Get all patient prescriptions (Patient view)
  async getMyPrescriptions(patientId: string) {
    const cachedData =
      await this.prescriptionCache.getPatientPrescriptions(patientId);
    if (cachedData) return cachedData;

    const prescriptions = await this.prisma.prescription.findMany({
      where: { patientId },
      include: {
        doctor: {
          select: { user: { select: { firstName: true, lastName: true } } },
        },
        connection: {
          select: { id: true, status: true },
        },

        prescriptionMedications: {
          select: { drugName: true, dosage: true },
        },
      },
      orderBy: {
        prescribedAt: 'desc',
      },
    });

    await this.prescriptionCache.setPatientPrescriptions(
      patientId,
      prescriptions,
    );

    return prescriptions;
  }

  // Get all patient prescriptions (Doctor view)
  async getPatientPrescriptions(doctorId: string, patientId: string) {
    const connection = await this.prisma.doctorPatientConnection.findUnique({
      where: {
        doctorId_patientId: {
          doctorId,
          patientId,
        },
      },
    });

    if (!connection)
      throw new NotFoundException(
        'No active connection found with this patient',
      );

    let prescriptions =
      await this.prescriptionCache.getPatientPrescriptions(patientId);
    if (!prescriptions) {
      prescriptions = await this.prisma.prescription.findMany({
        where: { patientId },
        include: {
          doctor: {
            select: { user: { select: { firstName: true, lastName: true } } },
          },
        },
        orderBy: {
          prescribedAt: 'desc',
        },
      });
    }
    await this.prescriptionCache.cachePatientPrescriptions(
      patientId,
      prescriptions,
    );

    return {
      all: prescriptions,
      active: prescriptions.filter(
        (p) => p.status === PrescriptionStatus.ACTIVE,
      ),
      expired: prescriptions.filter(
        (p) => p.status === PrescriptionStatus.EXPIRED,
      ),
      cancelled: prescriptions.filter(
        (p) => p.status === PrescriptionStatus.CANCELLED,
      ),
      stats: {
        total: prescriptions.length,
        activeCount: prescriptions.filter(
          (p) => p.status === PrescriptionStatus.ACTIVE,
        ).length,
      },
    };
  }

  //Get doctor's prescriptions with statistics
  async getDoctorPrescriptions(userId: string, stats?: PrescriptionStatus) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const doctorId = doctor?.id;
    const prescriptions = await this.prisma.prescription.findMany({
      where: { doctorId, status: stats },
      include: {
        patient: {
          select: { user: { select: { firstName: true, lastName: true } } },
        },
      },

      orderBy: { prescribedAt: 'desc' },
    });

    const [activeCount, expiredCount, totalCount] = await Promise.all([
      this.prisma.prescription.count({
        where: { doctorId, status: PrescriptionStatus.ACTIVE },
      }),
      this.prisma.prescription.count({
        where: { doctorId, status: PrescriptionStatus.EXPIRED },
      }),
      this.prisma.prescription.count({ where: { doctorId } }),
    ]);

    return {
      data: prescriptions,
      stats: {
        total: totalCount,
        active: activeCount,
        expired: expiredCount,
      },
    };
  }
  // GET SINGLE PRESCRIPTION
  async getPrescription(
    prescriptionId: string,
    userId: string,
    userRole: UserRole,
  ) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        doctor: {
          select: {
            userId: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
        patient: {
          select: {
            userId: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
        prescriptionMedications: true,
        renewals: true,
        history: { orderBy: { changedAt: 'desc' } },
      },
    });
    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }
    // Authorization
    const isOwner =
      prescription.patient.userId === userId ||
      prescription.doctor.userId === userId;

    if (!isOwner) {
      throw new ForbiddenException(
        'You do not have permission to view this prescription',
      );
    }
    await this.prisma.prescriptionHistory.create({
      data: {
        prescriptionId,
        previousStatus: prescription.status,
        newStatus: prescription.status,
        changedBy: userId,
        action: PrescriptionAction.VIEW,
        metadata: userRole,
      },
    });
    return prescription;
  }

  // CANCEL PRESCRIPTION (Doctor only)
  async cancelPrescription(
    prescriptionId: string,
    userId: string,
    reason?: string,
  ) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!doctor) throw new UnauthorizedException('Doctor profile not found');

    const doctorId = doctor.id;

    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      select: {
        doctorId: true,
        status: true,
        patientId: true,
        doctor: {
          select: { user: { select: { firstName: true, lastName: true } } },
        },
      },
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
          status: 'CANCELLED',
        },
      });

      await tx.prescriptionHistory.create({
        data: {
          prescriptionId,
          previousStatus: prescription.status,
          newStatus: 'CANCELLED',
          changedBy: doctorId,
          action: PrescriptionAction.CANCEL,
          reason,
        },
      });

      await tx.prescriptionRenewal.updateMany({
        where: { prescriptionId, status: RenewalStatus.PENDING },
        data: {
          status: RenewalStatus.REJECTED,
          rejectionReason: reason || 'Doctor cancelled the prescription',
        },
      });
      return result;
    });

    // Invalidate cache
    await this.prescriptionCache.invalidatePatientPrescriptions(
      prescription.patientId,
    );

    // Notify patient
    this.eventEmitter.emit('notification.trigger', {
      userId: userId,
      type: 'PRESCRIPTION_CANCELLED',
      data: {
        prescriptionId,
        doctorName: `${prescription.doctor.user.firstName} ${prescription.doctor.user.lastName}`,
        reason: reason || 'No reason provided',
        actionUrl: `/prescriptions/${prescriptionId}`,
      },
    });

    return updated;
  }

  // GET ACTIVE PRESCRIPTIONS COUNT
  async getActivePrescriptionsCount(patientId: string): Promise<number> {
    return this.prisma.prescription.count({
      where: {
        patientId,
        status: 'ACTIVE',
      },
    });
  }

  async checkDrugInteractions(drugNames: string[]): Promise<
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

    const labels: { [drugName: string]: string[] } = {};

    for (const drugName of drugNames) {
      // 1. Check domain cache first
      const cachedInteraction =
        await this.prescriptionCache.getDrugInteraction(drugName);
      if (cachedInteraction) {
        labels[drugName] = cachedInteraction.interactions.map(
          (i) => i.description,
        );
        continue;
      }

      // 2. Fetch from OpenFDA
      const interactions = await this.fetchInteractionsFromOpenFDA(drugName);

      // 3. Create proper DrugInteraction object for caching
      const interactionData: DrugInteraction = {
        drugName,
        interactions,
      };

      // 4. Store in domain cache for future requests
      await this.prescriptionCache.cacheDrugInteraction(interactionData);
      labels[drugName] = interactions.map((i) => i.description);
    }

    for (const currentDrug of drugNames) {
      const currentDrugInteractions: Array<{
        drugName: string;
        severity: 'LOW' | 'MODERATE' | 'HIGH' | 'CONTRAINDICATED';
        description: string;
        recommendation: string;
      }> = [];

      const currentDrugLabels = labels[currentDrug] || [];

      for (const otherDrug of drugNames) {
        if (currentDrug === otherDrug) continue;
        for (const textParagraph of currentDrugLabels) {
          if (textParagraph.toUpperCase().includes(otherDrug.toUpperCase())) {
            currentDrugInteractions.push({
              drugName: otherDrug,
              severity: this.detectSeverity(textParagraph),
              description: `Interaction detected between ${currentDrug} and ${otherDrug} based on FDA medical labels.`,
              recommendation:
                'Review dosage or consider alternative medications.',
            });
            break;
          }
        }
      }
      if (currentDrugInteractions.length > 0) {
        results.push({
          drugName: currentDrug,
          interactions: currentDrugInteractions,
        });
      }
    }
    return results;
  }

  /**
   * Fetches drug interaction information from OpenFDA API
   */
  private async fetchInteractionsFromOpenFDA(drugName: string) {
    const apiKey = this.configService.get<string>('OPENFDA_API_KEY');
    const baseUrl = this.configService.get<string>(
      'OPENFDA_BASE_URL',
      'https://api.fda.gov/drug/label.json',
    );

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
        recommendation:
          'Consult with a pharmacist or physician for specific details.',
      }));
    } catch (error) {
      this.logger.error(`OpenFDA error for ${drugName}: ${error}`);
      return [];
    }
  }

  /**
   * Basic severity detection based on keywords in the description
   */
  private detectSeverity(
    description: string,
  ): 'LOW' | 'MODERATE' | 'HIGH' | 'CONTRAINDICATED' {
    const desc = description.toUpperCase();
    if (
      desc.includes('CONTRAINDICATED') ||
      desc.includes('FATAL') ||
      desc.includes('DEATH')
    ) {
      return 'CONTRAINDICATED';
    }
    if (
      desc.includes('SEVERE') ||
      desc.includes('SERIOUS') ||
      desc.includes('HIGH RISK')
    ) {
      return 'HIGH';
    }
    if (desc.includes('MODERATE') || desc.includes('MONITOR')) {
      return 'MODERATE';
    }
    return 'LOW';
  }

  // ==================== PRIVATE HELPERS ====================
  private async validateConnection(connectionId: string, userId: string) {
    const connection = await this.prisma.doctorPatientConnection.findFirst({
      where: {
        id: connectionId,
        doctor: { userId },
      },
      include: {
        patient: { select: { id: true, userId: true } },
      },
    });

    if (!connection) {
      throw new ForbiddenException('Invalid or unauthorized connection');
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
      throw new ForbiddenException(
        'Expiry date cannot be more than 1 year in the future',
      );
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

  //===================== CRON JOBS ======================

  async processExpiredPrescriptions() {
    await this.prisma.prescription.updateMany({
      where: { status: 'ACTIVE', expireAt: { lte: new Date() } },
      data: { status: 'EXPIRED' },
    });
  }
  async sendRenewalReminders() {
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const expiring = await this.prisma.prescription.findMany({
      where: {
        status: 'ACTIVE',
        expireAt: { gte: new Date(), lte: threeDaysFromNow },
      },
      include: { prescriptionMedications: { take: 1 } },
    });

    for (const rx of expiring) {
      this.eventEmitter.emit('notification.trigger', {
        userId: rx.patientId,
        type: 'PRESCRIPTION_EXPIRY_REMINDER',
        data: {
          prescriptionId: rx.id,
          medicationName:
            rx.prescriptionMedications[0]?.drugName || 'medication',
        },
      });
    }
  }

  async cleanupOldPendingRequests() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    await this.prisma.prescriptionRenewal.updateMany({
      where: { status: 'PENDING', requestedAt: { lte: sevenDaysAgo } },
      data: {
        status: 'REJECTED',
        rejectionReason:
          'Auto-rejected due to no response from the doctor within 7 days.',
        respondedAt: new Date(),
      },
    });
  }
}

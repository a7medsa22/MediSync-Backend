import { BadRequestException, ConflictException, HttpException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { ApprovePrescriptionRenewalDto, ReasonPrescriptionRenewalDto, } from "../dto/renewal.dto";
import { PrescriptionAction, PrescriptionStatus, RenewalStatus } from "@prisma/client";
import { TimeUtils } from "src/common/utils/time.utils";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PrescriptionCacheService } from "src/common/cache/prescription-cache.service";

@Injectable()
export class PrescriptionRenewalService {
    private readonly logger = new Logger(PrescriptionRenewalService.name);
    constructor(
        private readonly prisma: PrismaService,
        private readonly eventEmitter: EventEmitter2,
        private readonly prescriptionCache: PrescriptionCacheService,
    ) { }
    /**
     * Request prescription renewal with full validation
     */
    async requestRenewal(
        userId: string,
        prescriptionId: string,
    ) {
        const patient = await this.prisma.patient.findUnique({
            where: { userId },
            select: { id: true },
        });
        if (!patient) throw new NotFoundException('Patient not found');

        const patientId = patient.id;

        const prescription = await this.prisma.prescription.findUnique({
            where: { id: prescriptionId, },
            include: {
                doctor: { select: { userId: true } },
                prescriptionMedications: { take: 1 }
            }
        });
        if (!prescription) throw new NotFoundException('Prescription not found');

        if (!prescription || prescription.patientId !== patientId) {
            throw new NotFoundException('Prescription not found or unauthorized');
        }
        if (prescription.renewalCount >= prescription.maxRenewals) {
            throw new BadRequestException('Maximum number of renewals reached for this prescription');
        }
        const pendingRenewal = await this.prisma.prescriptionRenewal.findFirst({
            where: { prescriptionId, status: RenewalStatus.PENDING },
        });
        if (pendingRenewal) throw new ConflictException('Renewal request already pending');

        const renewal = await this.prisma.$transaction(async (tx) => {
            const created = await tx.prescriptionRenewal.create({
                data: {
                    prescriptionId,
                    patientId,
                    status: RenewalStatus.PENDING,
                    requestedAt: new Date(),
                    renewalCount: (prescription.renewalCount || 0) + 1,
                    maxRenewals: prescription.maxRenewals,
                },
            });

            // Create history
            await tx.prescriptionHistory.create({
                data: {
                    prescriptionId,
                    previousStatus: prescription.status,
                    newStatus: prescription.status,
                    changedBy: patientId,
                    action: PrescriptionAction.RENEW,
                    reason: `Renewal requested for prescription ${prescriptionId}`,
                },
            });
            return created;
        });

        // 5. Notify doctor
        this.eventEmitter.emit('notification.trigger', {
            userId: prescription.doctor.userId,
            type: 'PRESCRIPTION_RENEWAL_REQUEST',
            data: {
                prescriptionId,
                patientId,
                medicationName: prescription.prescriptionMedications[0]?.drugName || 'medication',
            },
        });

        // 6. Invalidate cache
        await this.prescriptionCache.invalidatePatientPrescriptions(patientId);

        this.logger.log(`Renewal requested for prescription ${prescriptionId}`);

        return {
            id: renewal.id,
            prescriptionId,
            status: renewal.status,
            requestedAt: renewal.requestedAt,
            renewalCount: renewal.renewalCount,
            maxRenewals: renewal.maxRenewals,
            message: 'Renewal request submitted to doctor',
        };
    }

    /**
     * Doctor approves renewal and creates new prescription
     */
    async approveRenewal(
        renewalId: string,
        userId: string,
        approveDto: ApprovePrescriptionRenewalDto,
    ) {
        const doctor = await this.prisma.doctor.findUnique({
            where: { userId },
            select: { id: true },
        });
        if (!doctor) throw new NotFoundException('Doctor not found');
        const doctorId = doctor.id;

        const renewal = await this.prisma.prescriptionRenewal.findUnique({
            where: { id: renewalId, prescription: { doctorId } },
            include: {
                prescription: {
                    include: {
                        prescriptionMedications: true,
                        doctor: { select: { user: { select: { firstName: true, lastName: true } } } }
                    }
                }
            }
        });
        if (!renewal) {
            throw new NotFoundException('Renewal request not found');
        }
        const originalPrescription = renewal.prescription


        if (!originalPrescription || originalPrescription.doctorId !== doctorId) {
            throw new BadRequestException('Unauthorized to approve this renewal');
        }

        if (renewal.status !== RenewalStatus.PENDING) {
            throw new ConflictException(`Renewal already ${renewal.status}`);
        }

        const newPrescription = await this.prisma.$transaction(async (tx) => {
            // Update renewal status
            await tx.prescriptionRenewal.update({
                where: { id: renewalId },
                data: {
                    status: RenewalStatus.APPROVED,
                    respondedAt: new Date(),
                    respondedBy: doctorId,
                },
            });
            await tx.prescription.update({
                where: { id: originalPrescription.id },
                data: {
                    status: PrescriptionStatus.EXPIRED,
                    expireAt: new Date(),
                },
            });

            // Calculate new expiry
            const newExpiryDate = approveDto.newExpiryDate
                ? new Date(approveDto.newExpiryDate)
                : TimeUtils.addDays(
                    new Date(),
                    parseInt(process.env.PRESCRIPTION_DEFAULT_VALIDITY_DAYS || '90', 10),
                );

            // Create new prescription
            const created = await tx.prescription.create({
                data: {
                    connectionId: originalPrescription.connectionId,
                    doctorId: originalPrescription.doctorId,
                    patientId: originalPrescription.patientId,
                    status: PrescriptionStatus.ACTIVE,
                    prescribedAt: new Date(),
                    expireAt: newExpiryDate,
                    parentPrescriptionId: originalPrescription.id,
                    renewalCount: originalPrescription.renewalCount + 1,
                    maxRenewals: originalPrescription.maxRenewals,
                    notes: approveDto.notes,
                    prescriptionMedications: {
                        create: (originalPrescription.prescriptionMedications).map((m) => ({
                            drugName: m.drugName,
                            dosage: m.dosage,
                            frequency: m.frequency,
                            duration: m.duration,
                            instructions: m.instructions,
                            sideEffects: m.sideEffects,
                            warnings: m.warnings,
                        })),
                    },
                },
                include: {
                    patient: { select: { user: { select: { firstName: true, id: true, email: true } } } },
                    doctor: { select: { user: { select: { firstName: true, lastName: true } } } },
                },
            });

            // Create history for new prescription
            await tx.prescriptionHistory.create({
                data: {
                    prescriptionId: created.id,
                    previousStatus: null,
                    newStatus: PrescriptionStatus.ACTIVE,
                    changedBy: doctorId,
                    action: PrescriptionAction.RENEW,
                    reason: `Renewal approved for prescription ${originalPrescription.id}`,
                },
            });

            return created;
        });
        const doctorUser = renewal.prescription.doctor?.user;
        const doctorName = doctorUser ? `${doctorUser.firstName} ${doctorUser.lastName}` : 'Doctor';
        // 4. Notify patient
        this.eventEmitter.emit('notification.trigger', {
            userId: newPrescription.patientId,
            type: 'PRESCRIPTION_RENEWAL_APPROVED',
            data: {
                prescriptionId: newPrescription.id,
                doctorName: doctorName,
                medicationName: originalPrescription.prescriptionMedications[0]?.drugName || 'medication',
            },
        });

        // 5. Invalidate cache
        await this.prescriptionCache.invalidatePatientPrescriptions(originalPrescription.patientId);

        this.logger.log(`Renewal ${renewalId} approved by doctor ${doctorId}`);

        return {
            id: newPrescription.id,
            status: newPrescription.status,
            expiresAt: newPrescription.expireAt,
            message: 'Prescription renewed successfully',
        };
    }

    /**
     * Doctor rejects renewal
     */
  async rejectRenewal(
    renewalId: string,
    userId: string,
    rejectDto: ReasonPrescriptionRenewalDto,
  ) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');
    const doctorId = doctor.id;

    const renewal = await this.prisma.prescriptionRenewal.findUnique({
      where: { id: renewalId },
      include: {
        prescription: {
          include: {
            prescriptionMedications: true,
            doctor: { select: { user: { select: { firstName: true, lastName: true } } } }
          }
        }
      }
    });
    if (!renewal) {
      throw new NotFoundException('Renewal request not found');
    }
    const originalPrescription = renewal.prescription


    if (!originalPrescription || originalPrescription.doctorId !== doctorId) {
      throw new BadRequestException('Unauthorized to approve this renewal');
    }

        if (renewal.status !== RenewalStatus.PENDING) {
            throw new ConflictException(`Renewal already ${renewal.status}`);
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            const result = await tx.prescriptionRenewal.update({
                where: { id: renewalId },
                data: {
                    status: RenewalStatus.REJECTED,
                    respondedAt: new Date(),
                    respondedBy: doctorId,
                    rejectionReason: rejectDto.reason,
                },
            });

            // Create history
            await tx.prescriptionHistory.create({
                data: {
                    prescriptionId: renewal.prescriptionId,
                    previousStatus: originalPrescription.status,
                    newStatus: originalPrescription.status,
                    changedBy: doctorId,
                    action: PrescriptionAction.EXPIRE,
                    reason: rejectDto.reason,
                },
            });
            return result;
        });

        // Notify patient
        const doctorUser = renewal.prescription.doctor?.user;
        const doctorName = doctorUser ? `${doctorUser.firstName} ${doctorUser.lastName}` : 'Doctor';
        this.eventEmitter.emit('notification.trigger', {
            userId: renewal.patientId,
            type: 'PRESCRIPTION_RENEWAL_REJECTED',
            data: {
                prescriptionId: originalPrescription.id,
                doctorName: doctorName,
                reason: rejectDto.reason,
            },
        });

        // Invalidate cache
        await this.prescriptionCache.invalidatePatientPrescriptions(originalPrescription.patientId);

        return { id: updated.id, status: updated.status };
    }

}

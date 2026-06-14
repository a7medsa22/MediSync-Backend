import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/common/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CreateClinicDto,
  UpdateClinicDto,
  VerifyClinicDto,
  SearchClinicsDto,
} from './dto/clinics.dto';
import { VerificationStatus, NotificationType } from '@prisma/client';

@Injectable()
export class ClinicsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private eventEmitter: EventEmitter2,
  ) {}

  async createClinic(userId: string, dto: CreateClinicDto) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId},
    });
    if (!doctor) throw new NotFoundException('Doctor not found');
    const doctorId = doctor.id;

    const existing = await this.prisma.clinic.findFirst({
      where: { name: dto.name, doctorId },
    });
    if (existing)
      throw new BadRequestException(
        'Clinic with this name already registered by you.',
      );

    const clinic = await this.prisma.clinic.create({
      data: {
        ...dto,
        doctorId,
        verificationStatus: VerificationStatus.PENDING,
      },
    });

    // Invalidate search cache
    await this.redis.delPattern('clinics:search:*');

    // Notify admins for verification
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN' },
    });
    for (const admin of admins) {
      this.eventEmitter.emit('notification.trigger', {
        userId: admin.id,
        type: NotificationType.CONNECTION_REQUEST,
        data: {
          clinicId: clinic.id,
          message: 'New Clinic verification requested',
        },
      });
    }
    return clinic;
  }

  async getClinic(id: string) {
    const cacheKey = `clinic:details:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const clinic = await this.prisma.clinic.findUnique({
      where: { id },
      include: { insurances: { include: { insurance: true } }, doctor: true },
    });
    if (!clinic) throw new NotFoundException('Clinic not found');

    await this.redis.set(cacheKey, clinic, 3600);
    return clinic;
  }

  async updateClinic(
    id: string,
    userId: string,
    isAdmin: boolean,
    dto: UpdateClinicDto,
  ) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id} });
    if (!clinic) throw new NotFoundException('Clinic not found');

    const doctor  = await this.prisma.doctor.findUnique({
      where: { userId },
    });
    const doctorId = doctor?.id;

    if (!isAdmin && clinic.doctorId !== doctorId)
      throw new ForbiddenException('Access denied');
    if (!isAdmin && clinic.verificationStatus !== VerificationStatus.VERIFIED) {
      throw new BadRequestException(
        'Updates permitted only for verified clinics.',
      );
    }

    const updated = await this.prisma.clinic.update({
      where: { id },
      data: dto,
    });
    await this.invalidateClinicCache(id);
    return updated;
  }

  async verifyClinic(id: string, adminId: string, dto: VerifyClinicDto) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id } });
    if (!clinic) throw new NotFoundException('Clinic not found');
    if (clinic.verificationStatus !== VerificationStatus.PENDING)
      throw new BadRequestException('Clinic is already processed');

    const updated = await this.prisma.clinic.update({
      where: { id },
      data: {
        verificationStatus: dto.status,
        verifiedBy: adminId,
        verifiedAt: new Date(),
        rejectionReason:
          dto.status === VerificationStatus.REJECTED
            ? dto.rejectionReason
            : null,
      },
    });

    await this.invalidateClinicCache(id);
    this.eventEmitter.emit('notification.trigger', {
      userId: clinic.doctorId,
      type:
        dto.status === VerificationStatus.VERIFIED
          ? NotificationType.CLINIC_VERIFIED
          : NotificationType.CLINIC_REJECTED,
      data: {
        clinicId: clinic.id,
        rejectionReason: dto.rejectionReason,
      },
    });
    return updated;
  }

  async searchClinics(query: SearchClinicsDto) {
    const cacheKey = `clinics:search:${JSON.stringify(query)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const whereClause: Record<string, unknown> = {
      verificationStatus: VerificationStatus.VERIFIED,
    };
    if (query.city) whereClause.city = query.city;
    if (query.governorate) whereClause.governorate = query.governorate;
    if (query.insuranceId) {
      whereClause.insurances = { some: { insuranceId: query.insuranceId } };
    }

    const clinics = await this.prisma.clinic.findMany({
      where: whereClause as never,
      include: { doctor: true, insurances: { include: { insurance: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const result = { total: clinics.length, clinics };
    await this.redis.set(cacheKey, result, 3600);
    return result;
  }

  async addInsurance(clinicId: string, insuranceId: string) {
    const relation = await this.prisma.clinicInsurance.create({
      data: { clinicId, insuranceId, isVerified: true },
    });
    await this.invalidateClinicCache(clinicId);
    return relation;
  }

  async removeInsurance(clinicId: string, insuranceId: string) {
    await this.prisma.clinicInsurance.delete({
      where: { clinicId_insuranceId: { clinicId, insuranceId } },
    });
    await this.invalidateClinicCache(clinicId);
  }

  private async invalidateClinicCache(id: string) {
    await this.redis.del(`clinic:details:${id}`);
    await this.redis.delPattern('clinics:search:*');
  }
}

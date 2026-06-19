import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { DoctorCacheService } from 'src/common/cache/doctor-cache.service';
import { UpdateDoctorProfileDto, CreateReviewDto } from './dto/clinics.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class DoctorProfileService {
  constructor(
    private prisma: PrismaService,
    private doctorCache: DoctorCacheService,
    private eventEmitter: EventEmitter2,
  ) {}

  async getProfile(doctorId: string) {
    const cached = await this.doctorCache.getDoctorProfile(doctorId);
    if (cached) return cached;

    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      include: { insurances: { include: { insurance: true } } },
    });
    if (!doctor) throw new NotFoundException('Profile not found');

    await this.doctorCache.cacheDoctorProfile(doctorId, doctor);
    return doctor;
  }

  async updateProfile(doctorId: string, dto: UpdateDoctorProfileDto) {
    const updated = await this.prisma.doctor.update({
      where: { id: doctorId },
      data: dto,
    });
    await this.doctorCache.invalidateDoctorProfile(doctorId);
    return updated;
  }

  async createReview(
    doctorId: string,
    patientId: string,
    dto: CreateReviewDto,
  ) {
    // التحقق من وجود موعد مكتمل بناءً على الـ Schema بتاعتك
    const completedAppointment = await this.prisma.appointment.findFirst({
      where: {
        doctorId,
        patientId,
        status: 'COMPLETED', // متوافق مع الـ AppointmentStatus Enum بتاعك
      },
    });

    if (!completedAppointment) {
      throw new BadRequestException(
        'Cannot review without a completed appointment.',
      );
    }

    const existingReview = await this.prisma.doctorReview.findUnique({
      where: { doctorId_patientId: { doctorId, patientId } },
    });
    if (existingReview)
      throw new ConflictException('You have already evaluated this provider.');

    const review = await this.prisma.doctorReview.create({
      data: { doctorId, patientId, ...dto },
    });

    await this.updateDoctorRating(doctorId);
    await this.doctorCache.invalidateDoctorProfile(doctorId);
    await this.doctorCache.invalidateDoctorReviews(doctorId);

    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      select: { userId: true },
    });
    const doctorUserId = doctor?.userId || doctorId;

    this.eventEmitter.emit('notification.trigger', {
      userId: doctorUserId,
      type: 'NEW_DOCTOR_REVIEW',
      data: {
        rating: dto.rating,
        comment: dto.comment,
        actionUrl: `/dashboard/doctor/reviews`,
      },
    });

    return review;
  }

  private async updateDoctorRating(doctorId: string) {
    const aggregations = await this.prisma.doctorReview.aggregate({
      where: { doctorId, isFlagged: false },
      _avg: { rating: true },
      _count: { rating: true },
    });

    // التعديل هنا: الـ rating بيستقبل Float مباشرة بناءً على الـ schema بتاعتك
    await this.prisma.doctor.update({
      where: { id: doctorId },
      data: {
        rating: aggregations._avg.rating || 0,
        reviewCount: aggregations._count.rating || 0,
      },
    });
  }

  async getDoctorReviews(doctorId: string) {
    const cached = await this.doctorCache.getDoctorReviews(doctorId);
    if (cached) return cached;

    const reviews = await this.prisma.doctorReview.findMany({
      where: { doctorId, isFlagged: false },
      orderBy: { createdAt: 'desc' },
    });

    const rawStats = await this.prisma.doctorReview.groupBy({
      by: ['rating'],
      where: { doctorId, isFlagged: false },
      _count: true,
    });

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    rawStats.forEach((item) => {
      distribution[item.rating as 1 | 2 | 3 | 4 | 5] = item._count;
    });

    const results = { reviews, distribution };
    await this.doctorCache.cacheDoctorReviews(doctorId, results);
    return results;
  }


  async flagReview(id: string, reason: string) {
    return this.prisma.doctorReview.update({
      where: { id },
      data: { isFlagged: true, flagReason: reason },
    });
  }
}

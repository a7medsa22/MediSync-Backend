import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DayOfWeek } from '@prisma/client';
import { TimeUtils } from '../../common/utils/time.utils';

@Injectable()
export class AvailabilityValidationHelpers {
  constructor(private prisma: PrismaService) {}

  /**
   * Validate that the doctor owns the resource
   */
  async validateDoctorOwnership(
    resourceId: string,
    doctorId: string,
    resourceType: 'availability' | 'break' | 'dayOff',
  ): Promise<void> {
    let resource;

    switch (resourceType) {
      case 'availability':
        resource = await this.prisma.doctorAvailability.findUnique({
          where: { id: resourceId },
          select: { doctorId: true },
        });
        break;
      case 'break':
        resource = await this.prisma.doctorBreak.findUnique({
          where: { id: resourceId },
          select: { doctorId: true },
        });
        break;
      case 'dayOff':
        resource = await this.prisma.doctorDayOff.findUnique({
          where: { id: resourceId },
          select: { doctorId: true },
        });
        break;
    }

    if (!resource || resource.doctorId !== doctorId) {
      throw new NotFoundException(`${resourceType} not found`);
    }
  }

  /**
   * Validate time range
   */
  static validateTimeRange(startTime: number, endTime: number): void {
    if (!TimeUtils.isValidTimeRange(startTime, endTime)) {
      throw new BadRequestException(
        'Invalid time range: start time must be before end time and within 24 hours',
      );
    }
  }

  /**
   * Validate slot duration
   */
  static validateSlotDuration(duration: number): void {
    if (!TimeUtils.isValidSlotDuration(duration)) {
      throw new BadRequestException(
        'Invalid slot duration: must be between 1 and 480 minutes (8 hours)',
      );
    }
  }

  /**
   * Validate max appointments per day
   */
  static validateMaxAppointments(max: number): void {
    if (!TimeUtils.isValidMaxAppointments(max)) {
      throw new BadRequestException(
        'Invalid max appointments: must be between 1 and 100',
      );
    }
  }

  /**
   * Check for overlapping availability windows for the same doctor/day
   */
  async validateNoAvailabilityOverlap(
    doctorId: string,
    dayOfWeek: DayOfWeek,
    startTime: number,
    endTime: number,
    excludeId?: string,
  ): Promise<void> {
    const existingAvailabilities =
      await this.prisma.doctorAvailability.findMany({
        where: {
          doctorId,
          dayOfWeek,
          isActive: true,
          ...(excludeId && { id: { not: excludeId } }),
        },
        select: { startTime: true, endTime: true },
      });

    const hasOverlap = existingAvailabilities.some((availability) =>
      TimeUtils.timeRangesOverlap(
        startTime,
        endTime,
        availability.startTime,
        availability.endTime,
      ),
    );

    if (hasOverlap) {
      throw new ConflictException(
        'Availability window overlaps with existing availability for this day',
      );
    }
  }

  /**
   * Check for overlapping breaks for the same doctor/day
   */
  async validateNoBreakOverlap(
    doctorId: string,
    dayOfWeek: DayOfWeek,
    startTime: number,
    endTime: number,
    excludeId?: string,
  ): Promise<void> {
    const existingBreaks = await this.prisma.doctorBreak.findMany({
      where: {
        doctorId,
        dayOfWeek,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { startTime: true, endTime: true },
    });

    const hasOverlap = existingBreaks.some((breakRecord) =>
      TimeUtils.timeRangesOverlap(
        startTime,
        endTime,
        breakRecord.startTime,
        breakRecord.endTime,
      ),
    );

    if (hasOverlap) {
      throw new ConflictException(
        'Break overlaps with existing break for this day',
      );
    }
  }

  /**
   * Ensure break fits entirely inside a matching availability window
   */
  async validateBreakWithinAvailability(
    doctorId: string,
    dayOfWeek: DayOfWeek,
    startTime: number,
    endTime: number,
  ): Promise<void> {
    const availabilities = await this.prisma.doctorAvailability.findMany({
      where: {
        doctorId,
        dayOfWeek,
        isActive: true,
      },
      select: { startTime: true, endTime: true },
    });

    const isWithinAvailability = availabilities.some(
      (availability) =>
        startTime >= availability.startTime && endTime <= availability.endTime,
    );

    if (!isWithinAvailability) {
      throw new BadRequestException(
        'Break must be within an existing availability window',
      );
    }
  }

  /**
   * Validate day-off date (not in past)
   */
  static validateDayOffDate(date: Date): void {
    if (TimeUtils.isPastDate(date)) {
      throw new BadRequestException('Cannot set day-off in the past');
    }
  }

  /**
   * Check for duplicate day-off
   */
  async validateNoDuplicateDayOff(
    doctorId: string,
    date: Date,
    excludeId?: string,
  ): Promise<void> {
    const normalizedDate = TimeUtils.normalizeDate(date);

    const existing = await this.prisma.doctorDayOff.findFirst({
      where: {
        doctorId,
        date: normalizedDate,
        ...(excludeId && { id: { not: excludeId } }),
      },
    });

    if (existing) {
      throw new ConflictException('Day-off already exists for this date');
    }
  }

  /**
   * Check for duplicate availability
   */
  async validateNoDuplicateAvailability(
    doctorId: string,
    dayOfWeek: DayOfWeek,
    startTime: number,
    endTime: number,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.doctorAvailability.findFirst({
      where: {
        doctorId,
        dayOfWeek,
        startTime,
        endTime,
        isActive: true,
        ...(excludeId && { id: { not: excludeId } }),
      },
    });

    if (existing) {
      throw new ConflictException(
        'Availability already exists for this day and time range',
      );
    }
  }
}

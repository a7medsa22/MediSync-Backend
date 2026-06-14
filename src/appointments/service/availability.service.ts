import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { SlotGeneratorService } from './slot-generator.service';
import { AvailabilityValidationHelpers } from './availability-validation.helpers';
import { TimeUtils } from '../../common/utils/time.utils';
import { DayOfWeek } from '@prisma/client';
import {
  CreateAvailabilityDto,
  CreateMultipleAvailabilitiesDto,
  UpdateAvailabilityDto,
  CreateBreakDto,
  UpdateBreakDto,
  CreateDayOffDto,
  CreateMultipleDaysOffDto,
} from '../dto/availability.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validationHelpers: AvailabilityValidationHelpers,
  ) {}

  /**
   * Create doctor's availability for a specific day and time
   */
  async createAvailability(doctorId: string, createDto: CreateAvailabilityDto) {
    const {
      dayOfWeek,
      startTime,
      endTime,
      slotDuration = 30,
      maxAppointmentsPerDay = 10,
    } = createDto;

    // Validate time range
    AvailabilityValidationHelpers.validateTimeRange(startTime, endTime);

    // Validate slot duration and max appointments
    AvailabilityValidationHelpers.validateSlotDuration(slotDuration);
    AvailabilityValidationHelpers.validateMaxAppointments(
      maxAppointmentsPerDay,
    );

    // Check for overlapping availability windows
    await this.validationHelpers.validateNoAvailabilityOverlap(
      doctorId,
      dayOfWeek,
      startTime,
      endTime,
    );

    // Check for duplicate availability
    await this.validationHelpers.validateNoDuplicateAvailability(
      doctorId,
      dayOfWeek,
      startTime,
      endTime,
    );

    const availability = await this.prisma.doctorAvailability.create({
      data: {
        doctorId,
        dayOfWeek,
        startTime,
        endTime,
        slotDuration,
        maxAppointmentsPerDay,
        isActive: true,
      },
    });

    return {
      id: availability.id,
      dayOfWeek: availability.dayOfWeek,
      startTime: TimeUtils.minutesToTimeString(availability.startTime),
      endTime: TimeUtils.minutesToTimeString(availability.endTime),
      slotDuration: availability.slotDuration,
      maxAppointmentsPerDay: availability.maxAppointmentsPerDay,
      message: 'Availability created successfully',
    };
  }

  /**
   * Create multiple availabilities at once
   */
  async createMultipleAvailabilities(
    doctorId: string,
    createDto: CreateMultipleAvailabilitiesDto,
  ) {
    const { availabilities } = createDto;

    type CreateAvailabilityResult = Awaited<
      ReturnType<AvailabilityService['createAvailability']>
    >;
    type CreateAvailabilityError = { dayOfWeek: DayOfWeek; error: string };

    const results: CreateAvailabilityResult[] = [];
    const errors: CreateAvailabilityError[] = [];

    // Use transaction for better consistency, but keep partial success behavior
    for (const avail of availabilities) {
      try {
        const result = await this.createAvailability(doctorId, avail);
        results.push(result);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          dayOfWeek: avail.dayOfWeek,
          error: message,
        });
      }
    }

    return {
      created: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Get doctor's availabilities
   */
  async getAvailabilities(doctorId: string) {
    const availabilities = await this.prisma.doctorAvailability.findMany({
      where: { doctorId, isActive: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    if (availabilities.length === 0) {
      throw new NotFoundException('Doctor has no availabilities set');
    }

    return availabilities.map((a) => ({
      id: a.id,
      dayOfWeek: a.dayOfWeek,
      startTime: TimeUtils.minutesToTimeString(a.startTime),
      endTime: TimeUtils.minutesToTimeString(a.endTime),
      slotDuration: a.slotDuration,
      maxAppointmentsPerDay: a.maxAppointmentsPerDay,
      isActive: a.isActive,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }));
  }

  /**
   * Update availability
   */
  async updateAvailability(
    doctorId: string,
    availabilityId: string,
    updateDto: UpdateAvailabilityDto,
  ) {
    // Validate ownership
    await this.validationHelpers.validateDoctorOwnership(
      availabilityId,
      doctorId,
      'availability',
    );

    // Get current availability for validation
    const currentAvailability = await this.prisma.doctorAvailability.findUnique(
      {
        where: { id: availabilityId },
        select: {
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          slotDuration: true,
          maxAppointmentsPerDay: true,
        },
      },
    );

    if (!currentAvailability) {
      throw new NotFoundException('Availability not found');
    }

    // Prepare update data
    const updateData: any = {};

    // Validate and set time range if updating
    if (updateDto.startTime !== undefined || updateDto.endTime !== undefined) {
      const newStartTime = updateDto.startTime ?? currentAvailability.startTime;
      const newEndTime = updateDto.endTime ?? currentAvailability.endTime;
      AvailabilityValidationHelpers.validateTimeRange(newStartTime, newEndTime);

      // Check for overlaps (exclude current availability)
      await this.validationHelpers.validateNoAvailabilityOverlap(
        doctorId,
        updateDto.dayOfWeek ?? currentAvailability.dayOfWeek,
        newStartTime,
        newEndTime,
        availabilityId,
      );

      updateData.startTime = newStartTime;
      updateData.endTime = newEndTime;
    }

    // Validate slot duration
    if (updateDto.slotDuration !== undefined) {
      AvailabilityValidationHelpers.validateSlotDuration(
        updateDto.slotDuration,
      );
      updateData.slotDuration = updateDto.slotDuration;
    }

    // Validate max appointments
    if (updateDto.maxAppointmentsPerDay !== undefined) {
      AvailabilityValidationHelpers.validateMaxAppointments(
        updateDto.maxAppointmentsPerDay,
      );
      updateData.maxAppointmentsPerDay = updateDto.maxAppointmentsPerDay;
    }

    // Set day of week if updating
    if (updateDto.dayOfWeek !== undefined) {
      updateData.dayOfWeek = updateDto.dayOfWeek;
    }

    const updated = await this.prisma.doctorAvailability.update({
      where: { id: availabilityId },
      data: updateData,
    });

    return {
      id: updated.id,
      dayOfWeek: updated.dayOfWeek,
      startTime: TimeUtils.minutesToTimeString(updated.startTime),
      endTime: TimeUtils.minutesToTimeString(updated.endTime),
      slotDuration: updated.slotDuration,
      maxAppointmentsPerDay: updated.maxAppointmentsPerDay,
      message: 'Availability updated successfully',
    };
  }

  /**
   * Delete availability
   */
  async deleteAvailability(doctorId: string, availabilityId: string) {
    // Validate ownership
    await this.validationHelpers.validateDoctorOwnership(
      availabilityId,
      doctorId,
      'availability',
    );

    await this.prisma.doctorAvailability.update({
      where: { id: availabilityId },
      data: { isActive: false },
    });

    return { message: 'Availability deleted successfully' };
  }

  /**
   * Create a break (lunch, prayer, etc.)
   */
  async createBreak(doctorId: string, createDto: CreateBreakDto) {
    const { dayOfWeek, startTime, endTime, reason } = createDto;

    // Validate time range
    AvailabilityValidationHelpers.validateTimeRange(startTime, endTime);

    // Check for overlapping breaks
    await this.validationHelpers.validateNoBreakOverlap(
      doctorId,
      dayOfWeek,
      startTime,
      endTime,
    );

    // Ensure break fits entirely inside a matching availability window
    await this.validationHelpers.validateBreakWithinAvailability(
      doctorId,
      dayOfWeek,
      startTime,
      endTime,
    );

    const breakRecord = await this.prisma.doctorBreak.create({
      data: {
        doctorId,
        dayOfWeek,
        startTime,
        endTime,
        reason,
      },
    });

    return {
      id: breakRecord.id,
      dayOfWeek: breakRecord.dayOfWeek,
      startTime: TimeUtils.minutesToTimeString(breakRecord.startTime),
      endTime: TimeUtils.minutesToTimeString(breakRecord.endTime),
      reason: breakRecord.reason,
      message: 'Break created successfully',
    };
  }

  /**
   * Get doctor's breaks
   */
  async getBreaks(doctorId: string) {
    const breaks = await this.prisma.doctorBreak.findMany({
      where: { doctorId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    return breaks.map((b) => ({
      id: b.id,
      dayOfWeek: b.dayOfWeek,
      startTime: TimeUtils.minutesToTimeString(b.startTime),
      endTime: TimeUtils.minutesToTimeString(b.endTime),
      reason: b.reason,
      createdAt: b.createdAt,
    }));
  }

  /**
   * Update break
   */
  async updateBreak(
    doctorId: string,
    breakId: string,
    updateDto: UpdateBreakDto,
  ) {
    // Validate ownership
    await this.validationHelpers.validateDoctorOwnership(
      breakId,
      doctorId,
      'break',
    );

    // Get current break for validation
    const currentBreak = await this.prisma.doctorBreak.findUnique({
      where: { id: breakId },
      select: { dayOfWeek: true, startTime: true, endTime: true },
    });

    if (!currentBreak) {
      throw new NotFoundException('Break not found');
    }

    // Prepare update data
    const updateData: any = {};

    // Validate and set time range if updating
    if (updateDto.startTime !== undefined || updateDto.endTime !== undefined) {
      const newStartTime = updateDto.startTime ?? currentBreak.startTime;
      const newEndTime = updateDto.endTime ?? currentBreak.endTime;
      const newDayOfWeek = updateDto.dayOfWeek ?? currentBreak.dayOfWeek;

      AvailabilityValidationHelpers.validateTimeRange(newStartTime, newEndTime);

      // Check for overlaps (exclude current break)
      await this.validationHelpers.validateNoBreakOverlap(
        doctorId,
        newDayOfWeek,
        newStartTime,
        newEndTime,
        breakId,
      );

      // Ensure break fits within availability
      await this.validationHelpers.validateBreakWithinAvailability(
        doctorId,
        newDayOfWeek,
        newStartTime,
        newEndTime,
      );

      updateData.startTime = newStartTime;
      updateData.endTime = newEndTime;
    }

    // Set other fields
    if (updateDto.dayOfWeek !== undefined) {
      updateData.dayOfWeek = updateDto.dayOfWeek;
    }
    if (updateDto.reason !== undefined) {
      updateData.reason = updateDto.reason;
    }

    const updated = await this.prisma.doctorBreak.update({
      where: { id: breakId },
      data: updateData,
    });

    return {
      id: updated.id,
      dayOfWeek: updated.dayOfWeek,
      startTime: TimeUtils.minutesToTimeString(updated.startTime),
      endTime: TimeUtils.minutesToTimeString(updated.endTime),
      reason: updated.reason,
      message: 'Break updated successfully',
    };
  }

  /**
   * Delete break
   */
  async deleteBreak(doctorId: string, breakId: string) {
    // Validate ownership
    await this.validationHelpers.validateDoctorOwnership(
      breakId,
      doctorId,
      'break',
    );

    await this.prisma.doctorBreak.delete({
      where: { id: breakId },
    });

    return { message: 'Break deleted successfully' };
  }

  /**
   * Create a day-off (vacation, conference, etc.)
   */
  async createDayOff(doctorId: string, createDto: CreateDayOffDto) {
    const { date, reason } = createDto;

    const dayOffDate = new Date(date);
    AvailabilityValidationHelpers.validateDayOffDate(dayOffDate);

    // Normalize date for comparison
    const normalizedDate = TimeUtils.normalizeDate(dayOffDate);

    // Check for duplicate day-off
    await this.validationHelpers.validateNoDuplicateDayOff(
      doctorId,
      normalizedDate,
    );

    const dayOff = await this.prisma.doctorDayOff.create({
      data: {
        doctorId,
        date: normalizedDate,
        reason,
      },
    });

    return {
      id: dayOff.id,
      date: dayOff.date.toISOString().split('T')[0],
      reason: dayOff.reason,
      message: 'Day-off created successfully',
    };
  }

  /**
   * Create multiple days-off
   */
  async createMultipleDaysOff(
    doctorId: string,
    createDto: CreateMultipleDaysOffDto,
  ) {
    const { daysOff } = createDto;

    type CreateDayOffResult = Awaited<
      ReturnType<AvailabilityService['createDayOff']>
    >;
    type CreateDayOffError = { date: string; error: string };

    const results: CreateDayOffResult[] = [];
    const errors: CreateDayOffError[] = [];

    for (const dayOff of daysOff) {
      try {
        const result = await this.createDayOff(doctorId, dayOff);
        results.push(result);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          date: dayOff.date,
          error: message,
        });
      }
    }

    return {
      created: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Get doctor's days-off
   */
  async getDaysOff(doctorId: string, startDate?: Date, endDate?: Date) {
    const where: any = { doctorId };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = startDate;
      if (endDate) where.date.lte = endDate;
    }

    const daysOff = await this.prisma.doctorDayOff.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    return daysOff.map((d) => ({
      id: d.id,
      date: d.date.toISOString().split('T')[0],
      reason: d.reason,
      createdAt: d.createdAt,
    }));
  }

  /**
   * Delete day-off
   */
  async deleteDayOff(doctorId: string, dayOffId: string) {
    // Validate ownership
    await this.validationHelpers.validateDoctorOwnership(
      dayOffId,
      doctorId,
      'dayOff',
    );

    await this.prisma.doctorDayOff.delete({
      where: { id: dayOffId },
    });

    return { message: 'Day-off deleted successfully' };
  }

  /**
   * Get complete availability summary for doctor
   */
  async getAvailabilitySummary(doctorId: string) {
    const availabilities = await this.getAvailabilities(doctorId);
    const breaks = await this.getBreaks(doctorId);
    const daysOff = await this.getDaysOff(doctorId);

    return {
      doctorId,
      summary: {
        availabilityWindows: availabilities.length,
        breaksConfigured: breaks.length,
        daysOffScheduled: daysOff.length,
      },
      details: {
        availabilities,
        breaks,
        daysOff,
      },
    };
  }
}

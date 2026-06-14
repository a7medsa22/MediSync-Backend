import { Injectable } from '@nestjs/common';
import {
  Appointment,
  DayOfWeek,
  DoctorAvailability,
  DoctorBreak,
  DoctorDayOff,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { AppointmentStatusPolicy } from '../policies/appointment-status.policy';
import { TimeUtils } from '../../common/utils/time.utils';

export interface TimeSlot {
  start: Date;
  end: Date;
}

interface SlotGeneratorParams {
  doctorId: string;
  startDate: Date;
  endDate: Date;
  timezone?: string;
}

type AvailabilityRecord = Pick<
  DoctorAvailability,
  'dayOfWeek' | 'startTime' | 'endTime' | 'slotDuration'
>;
type BreakRecord = Pick<DoctorBreak, 'dayOfWeek' | 'startTime' | 'endTime'>;
type AppointmentRecord = Pick<Appointment, 'startTime' | 'endTime'>;

interface AppointmentRange {
  startMinutes: number;
  endMinutes: number;
}

@Injectable()
export class SlotGeneratorService {
  private readonly MINUTES_PER_DAY = 24 * 60;

  constructor(private prisma: PrismaService) {}

  async generateSlots(params: SlotGeneratorParams) {
    const { doctorId, startDate, endDate, timezone = 'Africa/Cairo' } = params;
    void timezone;

    const normalizedRange = TimeUtils.normalizeDateRange(startDate, endDate);
    if (!normalizedRange) return [];

    const availabilities = await this.prisma.doctorAvailability.findMany({
      where: { doctorId, isActive: true },
    });

    const validAvailabilities = availabilities.filter((availability) =>
      this.isValidAvailability(availability),
    );
    if (validAvailabilities.length === 0) return [];

    const breakRecords = await this.prisma.doctorBreak.findMany({
      where: { doctorId },
    });
    const dayOffRecords = await this.prisma.doctorDayOff.findMany({
      where: {
        doctorId,
        date: {
          gte: normalizedRange.start,
          lte: normalizedRange.end,
        },
      },
    });

    const dayOffKeys = new Set(
      dayOffRecords.map((dayOff) =>
        TimeUtils.getDateKey(TimeUtils.normalizeDate(dayOff.date)),
      ),
    );

    const appointments = await this.prisma.appointment.findMany({
      where: {
        doctorId,
        status: { in: AppointmentStatusPolicy.activeStatuses() },
        startTime: { lt: this.addDays(normalizedRange.end, 1) },
        endTime: { gt: normalizedRange.start },
      },
      select: { startTime: true, endTime: true },
    });

    const availabilitiesByDay =
      this.groupAvailabilityByDay(validAvailabilities);
    const breaksByDay = this.groupBreaksByDay(breakRecords);

    const slots: TimeSlot[] = [];
    const currentDate = new Date(normalizedRange.start);
    const finishDate = new Date(normalizedRange.end);

    while (currentDate.getTime() <= finishDate.getTime()) {
      const dayKey = this.getDateKey(currentDate);
      if (dayOffKeys.has(dayKey)) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      const dayOfWeek = TimeUtils.getDayOfWeek(currentDate);
      const dayAvailabilities = availabilitiesByDay.get(dayOfWeek) ?? [];
      if (dayAvailabilities.length === 0) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      const dayBreaks = breaksByDay.get(dayOfWeek) ?? [];
      const dayAppointments = this.getAppointmentsForDate(
        appointments,
        currentDate,
      );

      for (const availability of dayAvailabilities) {
        slots.push(
          ...this.generateDaySlots(
            currentDate,
            availability,
            dayBreaks,
            dayAppointments,
          ),
        );
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return slots;
  }

  private generateDaySlots(
    date: Date,
    availability: AvailabilityRecord,
    breaks: BreakRecord[],
    bookedAppointments: AppointmentRange[],
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];
    if (!this.isValidAvailability(availability)) return slots;

    const { startTime, endTime, slotDuration } = availability;
    if (slotDuration <= 0 || startTime >= endTime) return slots;

    for (
      let current = startTime;
      current + slotDuration <= endTime;
      current += slotDuration
    ) {
      const slotStart = current;
      const slotEnd = current + slotDuration;

      const isInBreak = breaks.some((dayBreak) =>
        TimeUtils.timeRangesOverlap(
          slotStart,
          slotEnd,
          dayBreak.startTime,
          dayBreak.endTime,
        ),
      );
      if (isInBreak) continue;

      const isBooked = bookedAppointments.some((appointment) =>
        TimeUtils.timeRangesOverlap(
          slotStart,
          slotEnd,
          appointment.startMinutes,
          appointment.endMinutes,
        ),
      );
      if (isBooked) continue;

      slots.push({
        start: TimeUtils.minutesToDate(date, slotStart),
        end: TimeUtils.minutesToDate(date, slotEnd),
      });
    }

    return slots;
  }

  isOverlapping(
    start1: number,
    end1: number,
    start2: number,
    end2: number,
  ): boolean {
    return TimeUtils.timeRangesOverlap(start1, end1, start2, end2);
  }

  private normalizeDate(date: Date): Date {
    return TimeUtils.normalizeDate(date);
  }

  normalizeDateRange(
    startDate: Date,
    endDate: Date,
  ): { start: Date; end: Date } | null {
    return TimeUtils.normalizeDateRange(startDate, endDate);
  }

  private getDateKey(date: Date): string {
    return TimeUtils.getDateKey(date);
  }

  private getDayOfWeek(date: Date): DayOfWeek {
    return TimeUtils.getDayOfWeek(date);
  }

  minutesToDate(date: Date, minutes: number): Date {
    return TimeUtils.minutesToDate(date, minutes);
  }

  dateToMinutes(date: Date): number {
    return TimeUtils.dateToMinutes(date);
  }

  private addDays(date: Date, days: number): Date {
    return TimeUtils.addDays(date, days);
  }

  private isValidAvailability(
    availability: Partial<AvailabilityRecord>,
  ): availability is AvailabilityRecord {
    return (
      typeof availability.startTime === 'number' &&
      typeof availability.endTime === 'number' &&
      typeof availability.slotDuration === 'number' &&
      availability.startTime >= 0 &&
      availability.endTime > availability.startTime &&
      availability.slotDuration > 0 &&
      availability.slotDuration <= this.MINUTES_PER_DAY
    );
  }

  private groupAvailabilityByDay(
    availabilities: AvailabilityRecord[],
  ): Map<DayOfWeek, AvailabilityRecord[]> {
    return availabilities.reduce((map, item) => {
      const collection = map.get(item.dayOfWeek) ?? [];
      collection.push(item);
      map.set(item.dayOfWeek, collection);
      return map;
    }, new Map<DayOfWeek, AvailabilityRecord[]>());
  }

  private groupBreaksByDay(
    breaks: BreakRecord[],
  ): Map<DayOfWeek, BreakRecord[]> {
    return breaks.reduce((map, item) => {
      const collection = map.get(item.dayOfWeek) ?? [];
      if (this.isValidTimeRange(item.startTime, item.endTime)) {
        collection.push(item);
        map.set(item.dayOfWeek, collection);
      }
      return map;
    }, new Map<DayOfWeek, BreakRecord[]>());
  }

  private isValidTimeRange(start: number, end: number): boolean {
    return (
      typeof start === 'number' &&
      typeof end === 'number' &&
      start >= 0 &&
      end > start &&
      end <= this.MINUTES_PER_DAY
    );
  }

  private getAppointmentsForDate(
    appointments: AppointmentRecord[],
    date: Date,
  ): AppointmentRange[] {
    const dailyKey = TimeUtils.getDateKey(TimeUtils.normalizeDate(date));

    return appointments
      .map((appointment) => {
        const appointmentStartKey = TimeUtils.getDateKey(
          TimeUtils.normalizeDate(appointment.startTime),
        );
        const appointmentEndKey = TimeUtils.getDateKey(
          TimeUtils.normalizeDate(appointment.endTime),
        );

        const startMinutes =
          appointmentStartKey === dailyKey
            ? TimeUtils.dateToMinutes(appointment.startTime)
            : 0;
        const endMinutes =
          appointmentEndKey === dailyKey
            ? TimeUtils.dateToMinutes(appointment.endTime)
            : this.MINUTES_PER_DAY;

        const overlapsDate =
          appointmentStartKey === dailyKey ||
          appointmentEndKey === dailyKey ||
          (appointmentStartKey < dailyKey && appointmentEndKey > dailyKey);

        return overlapsDate ? { startMinutes, endMinutes } : null;
      })
      .filter(
        (range): range is AppointmentRange =>
          range !== null &&
          this.isValidTimeRange(range.startMinutes, range.endMinutes),
      );
  }
}

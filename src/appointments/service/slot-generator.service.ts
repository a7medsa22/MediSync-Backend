import { Injectable } from "@nestjs/common";
import { Appointment, DayOfWeek, DoctorAvailability, DoctorBreak, DoctorDayOff } from "@prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { AppointmentStatusPolicy } from "../policies/appointment-status.policy";

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

type AvailabilityRecord = Pick<DoctorAvailability, 'dayOfWeek' | 'startTime' | 'endTime' | 'slotDuration'>;
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

        const normalizedRange = this.normalizeDateRange(startDate, endDate);
        if (!normalizedRange) return [];

        const availabilities = await this.prisma.doctorAvailability.findMany({
            where: { doctorId, isActive: true },
        });

        const validAvailabilities = availabilities.filter((availability) => this.isValidAvailability(availability));
        if (validAvailabilities.length === 0) return [];

        const breakRecords = await this.prisma.doctorBreak.findMany({ where: { doctorId } });
        const dayOffRecords = await this.prisma.doctorDayOff.findMany({
            where: {
                doctorId,
                date: {
                    gte: normalizedRange.start,
                    lte: normalizedRange.end,
                },
            },
        });

        const dayOffKeys = new Set(dayOffRecords.map((dayOff) => this.getDateKey(this.normalizeDate(dayOff.date))));

        const appointments = await this.prisma.appointment.findMany({
            where: {
                doctorId,
                status: { in: AppointmentStatusPolicy.activeStatuses() },
                startTime: { lt: this.addDays(normalizedRange.end, 1) },
                endTime: { gt: normalizedRange.start },
            },
            select: { startTime: true, endTime: true },
        });

        const availabilitiesByDay = this.groupAvailabilityByDay(validAvailabilities);
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

            const dayOfWeek = this.getDayOfWeek(currentDate);
            const dayAvailabilities = availabilitiesByDay.get(dayOfWeek) ?? [];
            if (dayAvailabilities.length === 0) {
                currentDate.setDate(currentDate.getDate() + 1);
                continue;
            }

            const dayBreaks = breaksByDay.get(dayOfWeek) ?? [];
            const dayAppointments = this.getAppointmentsForDate(appointments, currentDate);

            for (const availability of dayAvailabilities) {
                slots.push(...this.generateDaySlots(currentDate, availability, dayBreaks, dayAppointments));
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

        for (let current = startTime; current + slotDuration <= endTime; current += slotDuration) {
            const slotStart = current;
            const slotEnd = current + slotDuration;

            const isInBreak = breaks.some((dayBreak) =>
                this.isOverlapping(slotStart, slotEnd, dayBreak.startTime, dayBreak.endTime),
            );
            if (isInBreak) continue;

            const isBooked = bookedAppointments.some((appointment) =>
                this.isOverlapping(slotStart, slotEnd, appointment.startMinutes, appointment.endMinutes),
            );
            if (isBooked) continue;

            slots.push({
                start: this.minutesToDate(date, slotStart),
                end: this.minutesToDate(date, slotEnd),
            });
        }

        return slots;
    }

     isOverlapping(start1: number, end1: number, start2: number, end2: number): boolean {
        return start1 < end2 && end1 > start2;
    }

    private normalizeDate(date: Date): Date {
        const normalized = new Date(date);
        normalized.setHours(0, 0, 0, 0);
        return normalized;
    }

        normalizeDateRange(startDate: Date, endDate: Date): { start: Date; end: Date } | null {
        if (!(startDate instanceof Date) || !(endDate instanceof Date)) return null;

        const start = this.normalizeDate(startDate);
        const end = this.normalizeDate(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || start.getTime() > end.getTime()) {
            return null;
        }

        return { start, end };
    }

    private getDateKey(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private getDayOfWeek(date: Date): DayOfWeek {
        const dayNumber = date.getDay();
        const dayMap: Record<number, DayOfWeek> = {
            0: DayOfWeek.SUNDAY,
            1: DayOfWeek.MONDAY,
            2: DayOfWeek.TUESDAY,
            3: DayOfWeek.WEDNESDAY,
            4: DayOfWeek.THURSDAY,
            5: DayOfWeek.FRIDAY,
            6: DayOfWeek.SATURDAY,
        };
        return dayMap[dayNumber];
    }

        minutesToDate(date: Date, minutes: number): Date {
        const result = new Date(date);
        result.setHours(0, 0, 0, 0);
        result.setMinutes(minutes);
        result.setSeconds(0);
        result.setMilliseconds(0);
        return result;
    }

     dateToMinutes(date: Date): number {
        return date.getHours() * 60 + date.getMinutes();
    }

    private addDays(date: Date, days: number): Date {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }

    private isValidAvailability(availability: Partial<AvailabilityRecord>): availability is AvailabilityRecord {
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

    private groupAvailabilityByDay(availabilities: AvailabilityRecord[]): Map<DayOfWeek, AvailabilityRecord[]> {
        return availabilities.reduce((map, item) => {
            const collection = map.get(item.dayOfWeek) ?? [];
            collection.push(item);
            map.set(item.dayOfWeek, collection);
            return map;
        }, new Map<DayOfWeek, AvailabilityRecord[]>());
    }

    private groupBreaksByDay(breaks: BreakRecord[]): Map<DayOfWeek, BreakRecord[]> {
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
        return typeof start === 'number' && typeof end === 'number' && start >= 0 && end > start && end <= this.MINUTES_PER_DAY;
    }

    private getAppointmentsForDate(appointments: AppointmentRecord[], date: Date): AppointmentRange[] {
        const dailyKey = this.getDateKey(this.normalizeDate(date));

        return appointments
            .map((appointment) => {
                const appointmentStartKey = this.getDateKey(this.normalizeDate(appointment.startTime));
                const appointmentEndKey = this.getDateKey(this.normalizeDate(appointment.endTime));

                const startMinutes =
                    appointmentStartKey === dailyKey ? this.dateToMinutes(appointment.startTime) : 0;
                const endMinutes =
                    appointmentEndKey === dailyKey ? this.dateToMinutes(appointment.endTime) : this.MINUTES_PER_DAY;

                const overlapsDate =
                    appointmentStartKey === dailyKey ||
                    appointmentEndKey === dailyKey ||
                    (appointmentStartKey < dailyKey && appointmentEndKey > dailyKey);

                return overlapsDate ? { startMinutes, endMinutes } : null;
            })
            .filter(
                (range): range is AppointmentRange =>
                    range !== null && this.isValidTimeRange(range.startMinutes, range.endMinutes),
            );
    }
}

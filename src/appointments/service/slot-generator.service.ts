import { ForbiddenException, Injectable } from "@nestjs/common";
import { min } from "class-validator";
import { PrismaService } from "src/prisma/prisma.service";
interface TimeSlot {
    start: Date,
    end: Date
}

interface SlotGeneratorParams {
    doctorId: string;
    startDate: Date;
    endDate: Date;
    timezone?: string;
}

@Injectable()
export class SlotGeneratorService {
    private readonly MINUTES_PER_DAY = 24 * 60;

    constructor(
        private prisma: PrismaService
    ) { }

    async generateSlots(Param: SlotGeneratorParams) {
        const { doctorId, startDate, endDate, timezone = 'Africa/Cairo' } = Param
        const slots: TimeSlot[] = [];

        // 1. Get doctor's availability settings
        const availabilities = await this.prisma.doctorAvailability.findMany({
            where: { doctorId, isActive: true },
        });
        if (availabilities.length == 0) return []

        // 2. Get doctor's breaks
        const breaks = await this.prisma.doctorBreak.findMany({ where: { doctorId } })
        // 3. Get doctor's days off
        const dayOff = await this.prisma.doctorDayOff.findMany({
            where: {
                doctorId,
                date: {
                    gte: startDate,
                    lte: endDate
                }
            }
        });
        const doctorDayDates = new Set(
            dayOff.map(d=>d.date.toISOString().split('T')[0])
        );
        // 4. Get already booked appointments
        const appointments = await this.prisma.appointment.findMany({
            where: {
                doctorId,
                status: { notIn: ['CANCELLED'] },
                startTime: { gte: startDate },
                endTime: { lte: endDate }
            },
            select: { startTime: true, endTime: true }
        });
        // 5. Generate slots for each day in range




    }
    isValidTimeFormat(timeStr: string): boolean {
        const regex = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;
        return regex.test(timeStr);
    }
    private formatMinutes(minutes: number) {
        const hours = Math.floor(minutes / 60);
        const mins = hours % 60;
        return `${hours}h ${mins}m`
    }
};
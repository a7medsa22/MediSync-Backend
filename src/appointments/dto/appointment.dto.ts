import { IsDateString, IsEnum, IsOptional, IsString, max, MaxLength, maxLength, MinLength } from "class-validator";
import { TimeSlot } from "../service/slot-generator.service";
import { AppointmentType } from "@prisma/client";
import { CancelAppointmentReason } from "../enums/appointment.enum";


export class CreateAppointmentDto {
    @IsString()
    doctorId!: string;

    @IsString()
    connectionId!: string;

    @IsDateString()
    startTime!: string; // ISO datetime string

    @IsEnum(AppointmentType)
    type!: AppointmentType;

    @IsOptional()
    @IsString()
    reason?: string;

    @IsOptional()
    @IsString()
    clinicId?: string;

    @IsOptional()
    @IsString()
    roomNumber?: string;

    @IsOptional()
    @IsString()
    meetingLink?: string;
}

export class AvailableSlotsResponse {
    doctorId!: string;
    availableCount!: number
    slots!: TimeSlot[]
}
export class GetAvailableSlots {
    doctorId!: string;
    startDate!: Date
    endDate!: Date
}

export class CancelAppointmentDto {
    @IsString()
    @MaxLength(255)
    @MinLength(5)
    @IsEnum(CancelAppointmentReason)
    reason!: CancelAppointmentReason;
}

export class RescheduleAppointmentDto {
    @IsDateString()
    newStartTime!: string;


    @IsOptional()
    @IsString()
    reason?: string;
}

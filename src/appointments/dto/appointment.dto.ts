import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TimeSlot } from '../service/slot-generator.service';
import { AppointmentType } from '@prisma/client';
import { CancelAppointmentReason } from '../enums/appointment.enum';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateAppointmentDto {
  @ApiProperty({ example: 'uuid-doctor-id' })
  @IsString()
  doctorId!: string;

  @ApiProperty({ example: 'uuid-connection-id' })
  @IsString()
  connectionId!: string;

  @ApiProperty({ example: '2025-05-20T10:00:00Z' })
  @IsDateString()
  startTime!: string; // ISO datetime string

  @ApiProperty({ enum: AppointmentType, example: AppointmentType.IN_CLINIC })
  @IsEnum(AppointmentType)
  type!: AppointmentType;

  @ApiProperty({ required: false, example: 'Regular checkup' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ required: false, example: 'clinic-id' })
  @IsOptional()
  @IsString()
  clinicId?: string;

  @ApiProperty({ required: false, example: '101' })
  @IsOptional()
  @IsString()
  roomNumber?: string;

  @ApiProperty({
    required: false,
    example: 'https://meet.google.com/abc-defg-hij',
  })
  @IsOptional()
  @IsString()
  meetingLink?: string;
}

export class AvailableSlotsResponse {
  @ApiProperty()
  doctorId!: string;
  @ApiProperty()
  availableCount!: number;
  @ApiProperty({ isArray: true })
  slots!: TimeSlot[];
}
export class GetAvailableSlots {
  @ApiProperty()
  @IsString()
  doctorId!: string;
  @ApiProperty()
  @IsDateString()
  startDate!: Date;
  @ApiProperty()
  @IsDateString()
  endDate!: Date;
}

export class CancelAppointmentDto {
  @ApiProperty({ enum: CancelAppointmentReason })
  @IsString()
  @MaxLength(255)
  @MinLength(5)
  @IsEnum(CancelAppointmentReason)
  reason!: CancelAppointmentReason;
}

export class RescheduleAppointmentDto {
  @ApiProperty({ example: '2025-05-20T11:00:00Z' })
  @IsDateString()
  newStartTime!: string;

  @ApiProperty({ required: false, example: 'Changed my mind' })
  @IsOptional()
  @IsString()
  reason?: string;
}

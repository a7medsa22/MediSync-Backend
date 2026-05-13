import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, IsArray, ValidateNested } from 'class-validator';
import { DayOfWeek } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateAvailabilityDto {
  @ApiProperty({ enum: DayOfWeek })
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @ApiProperty({ example: 480, description: 'Start time in minutes from midnight' })
  @IsInt()
  @Min(0)
  @Max(1440)
  startTime!: number; // minutes from midnight

  @ApiProperty({ example: 1020, description: 'End time in minutes from midnight' })
  @IsInt()
  @Min(0)
  @Max(1440)
  endTime!: number; // minutes from midnight

  @ApiProperty({ required: false, example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(480) // max 8 hours
  slotDuration?: number;

  @ApiProperty({ required: false, example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxAppointmentsPerDay?: number;
}

export class CreateMultipleAvailabilitiesDto {
  @ApiProperty({ type: [CreateAvailabilityDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAvailabilityDto)
  availabilities!: CreateAvailabilityDto[];
}

export class UpdateAvailabilityDto {
  @ApiProperty({ enum: DayOfWeek, required: false })
  @IsOptional()
  @IsEnum(DayOfWeek)
  dayOfWeek?: DayOfWeek;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  startTime?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  endTime?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(480)
  slotDuration?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxAppointmentsPerDay?: number;
}

export class CreateBreakDto {
  @ApiProperty({ enum: DayOfWeek })
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @ApiProperty({ example: 720 })
  @IsInt()
  @Min(0)
  @Max(1440)
  startTime!: number;

  @ApiProperty({ example: 780 })
  @IsInt()
  @Min(0)
  @Max(1440)
  endTime!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  reason?: string;
}

export class UpdateBreakDto {
  @ApiProperty({ enum: DayOfWeek, required: false })
  @IsOptional()
  @IsEnum(DayOfWeek)
  dayOfWeek?: DayOfWeek;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  startTime?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  endTime?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  reason?: string;
}

export class CreateDayOffDto {
  @IsString()
  date!: string; // ISO date string (YYYY-MM-DD)

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  reason?: string;
}

export class CreateMultipleDaysOffDto {
  daysOff!: CreateDayOffDto[];
}

// Request DTOs for endpoints (include doctorId)
export class CreateAvailabilityRequestDto extends CreateAvailabilityDto {
  @IsString()
  doctorId!: string;
}

export class CreateMultipleAvailabilitiesRequestDto extends CreateMultipleAvailabilitiesDto {
  @IsString()
  doctorId!: string;
}

export class UpdateAvailabilityRequestDto extends UpdateAvailabilityDto {
  @IsString()
  doctorId!: string;
}

export class CreateBreakRequestDto extends CreateBreakDto {
  @IsString()
  doctorId!: string;
}

export class UpdateBreakRequestDto extends UpdateBreakDto {
  @IsString()
  doctorId!: string;
}

export class CreateDayOffRequestDto extends CreateDayOffDto {
  @IsString()
  doctorId!: string;
}

export class CreateMultipleDaysOffRequestDto extends CreateMultipleDaysOffDto {
  @IsString()
  doctorId!: string;
}
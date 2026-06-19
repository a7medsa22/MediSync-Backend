import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsDateString,
  IsInt,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateMedicalRecordDto {
  @ApiProperty({ description: 'Record title' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ description: 'Record description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description:
      'Type of record (LAB_RESULT, XRAY, SCAN, MEDICAL_REPORT, VACCINATION, OTHER)',
  })
  @IsString()
  @IsNotEmpty()
  recordType!: string;

  @ApiProperty({ description: 'Patient UUID the record belongs to' })
  @IsUUID()
  @IsNotEmpty()
  patientId!: string;

  @ApiPropertyOptional({ description: 'Clinic UUID where this was created' })
  @IsUUID()
  @IsOptional()
  clinicId?: string;

  @ApiPropertyOptional({ description: 'Doctor-patient connection UUID' })
  @IsUUID()
  @IsOptional()
  connectionId?: string;

  @ApiPropertyOptional({ description: 'Doctor UUID who created/uploaded this' })
  @IsUUID()
  @IsOptional()
  doctorId?: string;

  @ApiPropertyOptional({
    description: 'ISO date string for when the record was taken',
  })
  @IsDateString()
  @IsOptional()
  recordDate?: string;
}

export class UpdateMedicalRecordDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  recordType?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  verifyNotes?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isVerified?: boolean;
}

export class ShareRecordDto {
  @ApiProperty({ description: 'User UUID to share with' })
  @IsUUID()
  @IsNotEmpty()
  sharedWithUserId!: string;

  @ApiPropertyOptional({
    description: 'Allow the recipient to download the file',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  canDownload?: boolean;

  @ApiPropertyOptional({
    description: 'Allow the recipient to re-share',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  canShare?: boolean;

  @ApiProperty({ description: 'ISO date string when the share expires' })
  @IsDateString()
  @IsNotEmpty()
  expiresAt!: string;
}

export class QueryRecordsDto {
  @ApiPropertyOptional({ description: 'Filter by patient UUID' })
  @IsUUID()
  @IsOptional()
  patientId?: string;

  @ApiPropertyOptional({ description: 'Filter by record type' })
  @IsString()
  @IsOptional()
  recordType?: string;

  @ApiPropertyOptional({ description: 'Filter by clinic UUID' })
  @IsUUID()
  @IsOptional()
  clinicId?: string;

  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;
}

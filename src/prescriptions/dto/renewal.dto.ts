import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import e from 'express';

export class ApprovePrescriptionRenewalDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Additional notes for the renewal approval' })
  notes?: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({ description: 'New expiry date for the prescription' })
  newExpiryDate?: string;
}

export class ReasonPrescriptionRenewalDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Reason for rejecting or requesting the renewal request',
    example: 'The medication is not suitable for your condition',
  })
  reason!: string;
}

export class PrescriptionRenewalResponseDto {
  @ApiProperty({
    description: 'Unique identifier for the prescription renewal',
  })
  id!: string;
  @ApiProperty({ description: 'ID of the prescription being renewed' })
  prescriptionId!: string;
  @ApiProperty({ description: 'ID of the patient who requested the renewal' })
  patientId!: string;
  @ApiProperty({ description: 'Status of the prescription renewal request' })
  status!: 'PENDING' | 'APPROVED' | 'REJECTED';
  @ApiProperty({ description: 'Date when the renewal request was made' })
  requestedAt!: Date;
  @ApiProperty({
    description: 'Date when the renewal request was responded to',
  })
  respondedAt?: Date;
  @ApiProperty({
    description: 'ID of the user who responded to the renewal request',
  })
  respondedBy?: string;
  @ApiProperty({ description: 'Reason for rejecting the renewal request' })
  rejectionReason?: string;
}

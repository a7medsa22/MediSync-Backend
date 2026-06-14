import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { MedicationDto } from './medication.dto';

export class CreatePrescriptionDto {
  @IsString()
  @IsNotEmpty()
  connectionId!: string;

  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MedicationDto)
  medications!: MedicationDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsDateString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Date and time when the prescription expires',
    example: '2024-12-31T23:59:59Z',
  })
  expiresAt!: string; // ISO datetime

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'ID of the template to use as base',
    example: 'template_1234567890',
  })
  templateId?: string; // Use template as base
}

export class CreatePrescriptionFromTemplateDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description:
      'ID of the connection for which the prescription is being created',
    example: 'conn_1234567890',
  })
  connectionId!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'ID of the template to use as base',
    example: 'template_1234567890',
  })
  templateId!: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'General notes for the prescription',
    example:
      'Patient has a history of hypertension, monitor blood pressure closely.',
  })
  notes?: string;

  @IsDateString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Date and time when the prescription expires',
    example: '2024-12-31T23:59:59Z',
  })
  expiresAt!: string;

  @IsOptional()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MedicationDto)
  @ApiProperty({
    description: 'Additional medications to add on top of the template',
    type: [MedicationDto],
  })
  additionalMedications?: MedicationDto[];
}

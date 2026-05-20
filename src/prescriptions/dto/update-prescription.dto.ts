import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { MedicationDto } from './medication.dto';

export class UpdatePrescriptionDto {
  @ApiProperty({
    type: [MedicationDto],
    description: 'Array of medications in the prescription',
  })
  @IsArray()
  @IsOptional()
  @ArrayMinSize(1, { message: 'At least one medication is required' })
  @ValidateNested({ each: true })
  @Type(() => MedicationDto)
  medications?: MedicationDto[];

  @ApiProperty({
    example: 'Continue current treatment and monitor blood pressure daily',
    required: false,
    description: 'General prescription notes',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    example: false,
    required: false,
    description: 'Set prescription as active or inactive',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
  @ApiProperty({
    example: '2024-12-31T23:59:59Z',
    required: false,
    description: 'Date and time when the prescription expires',
  })
  @IsOptional()
  @IsString()
  expiresAt?: string; // ISO datetime
}

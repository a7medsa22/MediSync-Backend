import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class MedicationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  @ApiProperty({ description: 'Name of the medication', example: 'Amoxicillin' })
  drugName!: string;

  @IsString()
  @ApiProperty({ description: 'Dosage of the medication', example: '500mg' })
  dosage!: string; // e.g., "500mg"

  @IsString()
  @MinLength(1)
  @MaxLength(24)
  @ApiProperty({ description: 'Frequency of intake', example: '3 times daily' })
  frequency!: string; // e.g., "3 times daily"

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  @ApiProperty({ description: 'Duration of the medication course', example: '7 days' })
  duration!: string; // e.g., "7 days"

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Additional instructions for the medication', example: 'Take after meals' })
  instructions?: string; // e.g., "After meals"

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Side effects of the medication', example: 'Nausea' })
  sideEffects?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Warnings for the medication', example: 'Avoid if allergic to penicillin' })
  warnings?: string;
}

export class MedicationResponseDto extends MedicationDto {
  id!: string;
}

// ==================== TEMPLATE DTOs ====================
export class CreatePrescriptionTemplateDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Name of the prescription template', example: 'Standard Template' })
  name: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Notes of the prescription template', example: 'Standard prescription template for common conditions' })
  notes?: string;

  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MedicationDto)
  medications: MedicationDto[];
}

export class UpdatePrescriptionTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MedicationDto)
  @ApiProperty({
    description: 'Medications in the prescription template', example: [
      {
        drugName: 'Amoxicillin',
        dosage: '500mg',
        frequency: '3 times daily',
        duration: '7 days',
        instructions: 'Take after meals',
        sideEffects: 'Nausea',
        warnings: 'Avoid if allergic to penicillin',
      },
    ]
  })
  medications?: MedicationDto[];

}
// ============= drug interactions DTOs =============
export class CheckInteractionsDto {
  @ApiProperty({
    description: 'List of drug names to check against each other',
    example: ['Panadol', 'Warfarin', 'Aspirin'],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(2, { message: 'You must provide at least two drugs to check interactions.' })
  @IsNotEmpty({ each: true })
  drugNames: string[];
}
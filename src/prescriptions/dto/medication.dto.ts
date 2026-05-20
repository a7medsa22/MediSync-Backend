import { ApiProperty } from '@nestjs/swagger';

import {
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class MedicationDto {
  @IsString()
  @MaxLength(255)
  @Min(2)
  @ApiProperty({ description: 'Name of the medication', example: 'Amoxicillin' })
  drugName!: string;
 
  @IsString()
  @ApiProperty({ description: 'Dosage of the medication', example: '500mg' })
  dosage!: string; // e.g., "500mg"
 
  @IsString()
  @Min(1)
  @Max(24)
  @ApiProperty({ description: 'Frequency of intake', example: '3 times daily' })
  frequency!: string; // e.g., "3 times daily"
 
  @IsString()
  @Min(1)
  @Max(30)
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
 

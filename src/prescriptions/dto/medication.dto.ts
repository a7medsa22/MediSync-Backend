import { ApiProperty } from '@nestjs/swagger';

import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class MedicationDto {
  @ApiProperty({
    example: 'Ibuprofen',
    required: true,
    description: 'Name of the medication',
  })
  @IsString()
  name: string;

  @ApiProperty({
    example: '500mg',
    required: true,
    description: 'Dosage (e.g., 500mg, 10ml, 1 tablet)',
  })
  @IsString()
  dosage: string;

  @ApiProperty({
    example: 3,
    type: Number,
    description: 'Number of times to take medication',
  })
  @IsNumber()
  @Min(1)
  @Max(24)
  frequency: number;

  @ApiProperty({
    example: 'daily',
    enum: ['daily', 'weekly'],
    description: 'Frequency type',
  })
  @IsEnum(['daily', 'weekly'])
  frequencyType: 'daily' | 'weekly';

  @ApiProperty({
    example: '7 days',
    description: 'Duration of treatment',
  })
  @IsString()
  duration: string;

  @ApiProperty({
    example: 'Take after meals with plenty of water',
    required: false,
    description: 'Additional notes about this medication',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

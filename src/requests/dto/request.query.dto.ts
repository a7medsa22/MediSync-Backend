import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional } from 'class-validator';

export class RequestQueryDto {
  @ApiProperty({
    description: 'Page number',
    type: Number,
    example: 1,
    required: false,
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    type: Number,
    example: 10,
    required: false,
    default: 10,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 10;

  @ApiProperty({
    description: 'Filter by request status',
    type: String,
    example: 'PENDING',
    required: false,
    enum: ['PENDING', 'ACCEPTED', 'REJECTED'],
  })
  @IsOptional()
  @IsEnum(['PENDING', 'ACCEPTED', 'REJECTED'])
  status?: 'PENDING' | 'ACCEPTED' | 'REJECTED';
}

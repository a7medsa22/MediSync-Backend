import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export enum QrTokenType {
  CONNECTION = 'CONNECTION',
  PRESCRIPTION_VIEW = 'PRESCRIPTION_VIEW',
  EMERGENCY_ACCESS = 'EMERGENCY_ACCESS',
}
export class GenerateQrDto {
  @ApiPropertyOptional({
    enum: QrTokenType,
    default: QrTokenType.CONNECTION,
    description: 'type of the QR token',
  })
  @IsOptional()
  @IsEnum(QrTokenType)
  type?: QrTokenType = QrTokenType.CONNECTION;

  @ApiPropertyOptional({
    description: 'expiry time in minutes (default 5)',
    minimum: 1,
    maximum: 60,
    default: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(60)
  expiryMinutes?: number = 5;

  @ApiPropertyOptional({
    description: 'metadata to include in the QR token (optional)',
    example: { clinicRoom: '3A', notes: 'Emergency patient' },
  })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class ScanQrAndValidateDto {
  @ApiProperty({
    description: 'scanned QR token and validate it',
    example: 'MDS_a1b2c3d4-e5f6-7890-abcd-ef1234567890_x7k9m2p4q8r1t5w3y6z0',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^MDS_[a-f0-9-]{36}_[a-zA-Z0-9_-]{32}$/, {
    message: 'Invalid QR token format',
  })
  token: string;
}

export class ValidateQrDto {
  @ApiProperty({
    description: 'Token للتحقق من صلاحيته',
    example: 'MDS_a1b2c3d4-e5f6-7890-abcd-ef1234567890_x7k9m2p4q8r1t5w3y6z0',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class InvalidateQrResponseDto {
  @ApiProperty({
    description: 'Success message',
  })
  message: string;

  @ApiProperty({
    description: 'Token ID that was invalidated',
  })
  tokenId: string;
}

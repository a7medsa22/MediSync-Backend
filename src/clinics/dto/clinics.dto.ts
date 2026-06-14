import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsNumber,
  Min,
  Max,
  IsEnum,
  IsBoolean,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VerificationStatus } from '@prisma/client';

export class CreateClinicDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty() @IsString() @IsNotEmpty() address: string;
  @ApiProperty() @IsString() @IsNotEmpty() city: string;
  @ApiProperty() @IsString() @IsNotEmpty() governorate: string;
  @ApiPropertyOptional() @IsString() @IsOptional() zipCode?: string;
  @ApiProperty() @IsString() @IsNotEmpty() phone: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiPropertyOptional() @IsString() @IsOptional() website?: string;
  @ApiProperty() @IsString() @IsNotEmpty() licenseNumber: string;
  @ApiProperty() @IsString() @IsNotEmpty() licenseDoc: string;
  @ApiProperty() @IsNumber() @Min(0) @Max(10000) consultationFee: number;
}

export class UpdateClinicDto {
  @ApiPropertyOptional() @IsString() @IsOptional() name?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() address?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() city?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() governorate?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() phone?: string;
  @ApiPropertyOptional() @IsEmail() @IsOptional() email?: string;
  @ApiPropertyOptional()
  @IsNumber()
  @Min(0)
  @Max(10000)
  @IsOptional()
  consultationFee?: number;
}

export class VerifyClinicDto {
  @ApiProperty({ enum: VerificationStatus })
  @IsEnum(VerificationStatus)
  status: VerificationStatus;
  @ApiPropertyOptional() @IsString() @IsOptional() rejectionReason?: string;
}

export class CreateReviewDto {
  @ApiProperty() @IsNumber() @Min(1) @Max(5) rating: number;
  @ApiPropertyOptional() @IsString() @IsOptional() comment?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isAnonymous?: boolean;
}

export class FlagReviewDto {
  @ApiProperty() @IsString() @IsNotEmpty() reason: string;
}

export class UpdateDoctorProfileDto {
  @ApiPropertyOptional()
  @IsNumber()
  @Min(0)
  @IsOptional()
  yearsOfExperience?: number;
  @ApiPropertyOptional() @IsString() @IsOptional() education?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() bio?: string;
}

export class SearchClinicsDto {
  @ApiPropertyOptional() @IsString() @IsOptional() city?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() governorate?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() insuranceId?: string;
}

export class AddInsuranceDto {
  @ApiProperty() @IsUUID() insuranceId: string;
}

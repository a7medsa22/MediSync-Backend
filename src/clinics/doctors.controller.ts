import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DoctorProfileService } from './doctor-profile.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { CreateReviewDto } from './dto/clinics.dto';

@ApiTags('Doctors')
@Controller({
  path:'doctors',
  version: '2'
})
export class DoctorsController {
  constructor(private readonly doctorProfileService: DoctorProfileService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PATIENT)
  @ApiOperation({ summary: 'Create a review for a doctor' })
  @Post(':id/reviews')
  async createReview(
    @Param('id') doctorId: string,
    @CurrentUser('patientId') patientId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.doctorProfileService.createReview(doctorId, patientId, dto);
  }

  @Get(':id/reviews')
  @ApiOperation({ summary: 'Get reviews for a specific doctor' })
  async getDoctorReviews(@Param('id') doctorId: string) {
    const result = await this.doctorProfileService.getDoctorReviews(doctorId);
    return result.reviews;
  }
}

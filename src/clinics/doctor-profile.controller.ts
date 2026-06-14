import {
  Controller,
  Get,
  Put,
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
import { UpdateDoctorProfileDto } from './dto/clinics.dto';

@ApiTags('Doctor Profile')
@Controller('doctor-profile')
export class DoctorProfileController {
  constructor(private readonly doctorProfileService: DoctorProfileService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR)
  @ApiOperation({ summary: 'Update my profile' })
  @Put('me')
  async updateMyProfile(
    @CurrentUser('doctorId') doctorId: string,
    @Body() dto: UpdateDoctorProfileDto,
  ) {
    return this.doctorProfileService.updateProfile(doctorId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get doctor profile' })
  async getProfile(@Param('id') id: string) {
    return this.doctorProfileService.getProfile(id);
  }
}
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import {
  CreateClinicDto,
  UpdateClinicDto,
  VerifyClinicDto,
  SearchClinicsDto,
} from './dto/clinics.dto';
import { ClinicsService } from './clinics.service';

@ApiTags('Clinics Engine')
@Controller({
  path: 'clinics',
  version: '2',
})
export class ClinicsController {
  constructor(private readonly clinicsService: ClinicsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post()
  @Roles(UserRole.DOCTOR)
  @ApiOperation({ summary: 'Register a new Clinic (Doctor Entity)' })

  async createClinic(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateClinicDto,
  ) {
    return this.clinicsService.createClinic(userId, dto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Query clinics globally with system constraints' })
  async searchClinics(@Query() query: SearchClinicsDto) {
    return this.clinicsService.searchClinics(query);
  }

  @Get(':id')
  async getClinic(@Param('id') id: string) {
    return this.clinicsService.getClinic(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch(':id')
  @Roles(UserRole.DOCTOR)
  async updateClinic(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: UserRole,
    @Body() dto: UpdateClinicDto,
  ) {
    return this.clinicsService.updateClinic(
      id,
      userId,
      role === UserRole.ADMIN,
      dto,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/verify')
  @Roles(UserRole.ADMIN)
  async verifyClinic(
    @Param('id') id: string,
    @CurrentUser('sub') adminId: string,
    @Body() dto: VerifyClinicDto,
  ) {
    return this.clinicsService.verifyClinic(id, adminId, dto);
  }

  @Post(':id/insurances')
  async addInsurance(
    @Param('id') id: string,
    @Body('insuranceId') insuranceId: string,
  ) {
    return this.clinicsService.addInsurance(id, insuranceId);
  }

  @Delete(':id/insurances/:insId')
  async removeInsurance(
    @Param('id') id: string,
    @Param('insId') insuranceId: string,
  ) {
    return this.clinicsService.removeInsurance(id, insuranceId);
  }
}

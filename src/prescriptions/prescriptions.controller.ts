import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  Query,
  Put,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { PrescriptionsService } from './services/prescriptions.service';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiAuth } from 'src/common/decorators/api-auth.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { PrescriptionStatus, UserRole } from '@prisma/client';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import {
  CreatePrescriptionDto,
  CreatePrescriptionFromTemplateDto,
} from './dto/create-prescription.dto';
import {
  CheckInteractionsDto,
  CreatePrescriptionTemplateDto,
  UpdatePrescriptionTemplateDto,
} from './dto/medication.dto';
import { InjectPatientIdGuard } from 'src/auth/guards/inject-patientId.guard';
import { PrescriptionRenewalService } from './services/prescription-renewal.service';
import {
  ApprovePrescriptionRenewalDto,
  ReasonPrescriptionRenewalDto,
} from './dto/renewal.dto';
import { InjectDoctorIdGuard } from 'src/auth/guards/inject-doctorId.guard';
import { PrescriptionPdfService } from './services/prescription-pdf.service';
import { PrescriptionTemplateService } from './services/prescriptions.tempalet.service';
import express from 'express';

@ApiTags('Prescriptions')
@ApiAuth()
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(
    private readonly prescriptionsService: PrescriptionsService,
    private readonly prescriptionRenewalService: PrescriptionRenewalService,
    private readonly prescriptionTemplateService: PrescriptionTemplateService,
    private readonly prescriptionPdfService: PrescriptionPdfService,
  ) {}

  // ===============================================
  // CREATE PRESCRIPTION (Doctor only)
  // ===============================================

  @Post('/')
  @Roles(UserRole.DOCTOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create Prescription (Doctor)',
    description: 'Doctor creates a new prescription for a connected patient',
  })
  @ApiResponse({
    status: 201,
    description: 'Prescription created successfully',
  })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  @ApiResponse({ status: 403, description: 'Not your patient' })
  @ApiResponse({
    status: 400,
    description: 'Connection not active or invalid data',
  })
  async createPrescription(
    @CurrentUser('sub') userId: string,
    @Body() body: CreatePrescriptionDto,
  ) {
    return this.prescriptionsService.createPrescription(userId, body);
  }
  @Post('/from-template')
  @Roles(UserRole.DOCTOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create prescription from template',
    description: 'Doctor creates prescription using existing template as base',
  })
  async createFromTemplate(
    @CurrentUser('sub') userId: string,
    @Body() body: CreatePrescriptionFromTemplateDto,
  ) {
    return this.prescriptionsService.createPrescriptionFromTemplate(
      userId,
      body,
    );
  }

  // ==================== TEMPLATE ENDPOINTS ====================
  // NOTE: Keep template routes BEFORE :id routes to avoid
  // /templates being caught by the ParseUUIDPipe on /:id

  @Post('templates')
  @Roles(UserRole.DOCTOR)
  @UseGuards(InjectDoctorIdGuard)
  @ApiOperation({
    summary: 'Create Prescription Template',
    description: 'Doctor creates a reusable prescription template.',
  })
  async createTemplate(
    @CurrentUser('doctorId') doctorId: string,
    @Body() createDto: CreatePrescriptionTemplateDto,
  ) {
    return this.prescriptionTemplateService.createTemplate(doctorId, createDto);
  }

  @Get('templates/stats')
  @Roles(UserRole.DOCTOR)
  @UseGuards(InjectDoctorIdGuard)
  @ApiOperation({
    summary: 'Get Template Statistics',
    description:
      'Doctor retrieves usage statistics for a prescription template.',
  })
  async getTemplateStats(@CurrentUser('doctorId') doctorId: string) {
    return this.prescriptionTemplateService.getTemplateStats(doctorId);
  }

  @Get('templates')
  @Roles(UserRole.DOCTOR)
  @UseGuards(InjectDoctorIdGuard)
  @ApiOperation({
    summary: 'Get Prescription Templates',
    description: 'Doctor retrieves all active or all templates.',
  })
  async getTemplates(
    @CurrentUser('doctorId') doctorId: string,
    @Query('includeInactive') includeInactive?: boolean,
  ) {
    return this.prescriptionTemplateService.getTemplates(
      doctorId,
      includeInactive ?? false,
    );
  }

  @Get('templates/:id')
  @Roles(UserRole.DOCTOR)
  @ApiOperation({
    summary: 'Get Prescription Template by ID',
    description: 'Doctor retrieves a single prescription template.',
  })
  @ApiParam({ name: 'id', description: 'Template ID' })
  async getTemplate(
    @Param('id', ParseUUIDPipe) templateId: string,
    @CurrentUser('doctorId') doctorId: string,
  ) {
    return this.prescriptionTemplateService.getTemplate(templateId, doctorId);
  }

  @Patch('templates/:id')
  @Roles(UserRole.DOCTOR)
  @UseGuards(InjectDoctorIdGuard)
  @ApiOperation({
    summary: 'Update Prescription Template',
    description: 'Doctor updates an existing prescription template.',
  })
  @ApiParam({ name: 'id', description: 'Template ID' })
  async updateTemplate(
    @Param('id', ParseUUIDPipe) templateId: string,
    @CurrentUser('doctorId') doctorId: string,
    @Body() updateDto: UpdatePrescriptionTemplateDto,
  ) {
    return this.prescriptionTemplateService.updateTemplate(
      templateId,
      doctorId,
      updateDto,
    );
  }

  @Put('templates/:id/deactivate')
  @Roles(UserRole.DOCTOR)
  @UseGuards(InjectDoctorIdGuard)
  @ApiOperation({
    summary: 'Deactivate Prescription Template',
    description:
      'Doctor deactivates a prescription template so it is no longer available for use.',
  })
  @ApiParam({ name: 'id', description: 'Template ID' })
  async deactivateTemplate(
    @Param('id', ParseUUIDPipe) templateId: string,
    @CurrentUser('doctorId') doctorId: string,
  ) {
    return this.prescriptionTemplateService.deactivateTemplate(
      templateId,
      doctorId,
    );
  }

  @Delete('templates/:id')
  @Roles(UserRole.DOCTOR)
  @UseGuards(InjectDoctorIdGuard)
  @ApiOperation({
    summary: 'Delete Prescription Template',
    description: 'Doctor deletes a prescription template permanently.',
  })
  @ApiParam({ name: 'id', description: 'Template ID' })
  async deleteTemplate(
    @Param('id', ParseUUIDPipe) templateId: string,
    @CurrentUser('doctorId') doctorId: string,
  ) {
    return this.prescriptionTemplateService.deleteTemplate(
      templateId,
      doctorId,
    );
  }

  @Post('templates/:id/clone')
  @Roles(UserRole.DOCTOR)
  @ApiOperation({
    summary: 'Clone Prescription Template',
    description: 'Doctor clones an existing template under a new name.',
  })
  @ApiParam({ name: 'id', description: 'Template ID' })
  async cloneTemplate(
    @Param('id', ParseUUIDPipe) templateId: string,
    @CurrentUser('doctorId') doctorId: string,
    @Body('newName') newName: string,
  ) {
    return this.prescriptionTemplateService.cloneTemplate(
      templateId,
      doctorId,
      newName,
    );
  }

  // ===============================================
  // GET PRESCRIPTIONS
  // ===============================================

  @Get('connections/:connectionId')
  @Roles(UserRole.DOCTOR, UserRole.PATIENT)
  @ApiOperation({
    summary: 'Get prescription details',
    description: 'Get full prescription with medications and history',
  })
  @ApiResponse({
    status: 200,
    description: 'Prescriptions retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async getConnectionPrescriptions(
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.prescriptionsService.getConnectionPrescriptions(
      connectionId,
      userId,
      userRole,
    );
  }

  @Get('my-prescriptions')
  @Roles(UserRole.PATIENT)
  @UseGuards(InjectPatientIdGuard)
  @ApiOperation({
    summary: 'Get My Prescriptions (Patient)',
    description: 'Patient gets all their prescriptions from all doctors',
  })
  @ApiResponse({
    status: 200,
    description: 'Prescriptions retrieved successfully',
  })
  async getMyPrescriptions(@CurrentUser('patientId') patientId: string) {
    return this.prescriptionsService.getMyPrescriptions(patientId);
  }

  @Get('patient/list/:patientId')
  @Roles(UserRole.DOCTOR)
  @ApiOperation({
    summary: 'Get Patient Prescriptions (Doctor)',
    description: 'Doctor gets all prescriptions for a specific patient',
  })
  @ApiParam({ name: 'patientId', description: 'Patient ID' })
  @ApiResponse({
    status: 200,
    description: 'Prescriptions retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'No connection with this patient' })
  async getPatientPrescriptions(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.prescriptionsService.getPatientPrescriptions(userId, patientId);
  }

  @Get('doctor/prescriptions')
  @Roles(UserRole.DOCTOR)
  @ApiOperation({
    summary: 'Get Doctor Prescriptions',
    description: 'Doctor gets all prescriptions for a specific doctor',
  })
  async getDoctorPrescriptions(
    @CurrentUser('sub') userId: string,
    @Query('stats') stats?: PrescriptionStatus,
  ) {
    return this.prescriptionsService.getDoctorPrescriptions(userId, stats);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get Prescription by ID',
    description: 'Get detailed information about a specific prescription',
  })
  @ApiResponse({
    status: 200,
    description: 'Prescription retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Prescription not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async getPrescription(
    @Param('id', ParseUUIDPipe) prescriptionId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.prescriptionsService.getPrescription(
      prescriptionId,
      userId,
      userRole,
    );
  }

  // cancel  prescription (doctor only)
  @Put(':id/deactivate')
  @Roles(UserRole.DOCTOR)
  @ApiOperation({
    summary: 'Deactivate Prescription (Doctor)',
    description: 'Doctor marks a prescription as inactive (stopped)',
  })
  @ApiResponse({ status: 200, description: 'Prescription deactivated' })
  @ApiResponse({ status: 404, description: 'Prescription not found' })
  @ApiResponse({ status: 403, description: 'Not your prescription' })
  async deactivatePrescription(
    @Param('id', ParseUUIDPipe) prescriptionId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.prescriptionsService.cancelPrescription(prescriptionId, userId);
  }

  // ==================== RENEWALS ====================

  @Post(':id/request-renewal')
  @Roles(UserRole.PATIENT)
  @ApiOperation({
    summary: 'Request Prescription Renewal (Patient)',
    description: 'Patient requests to renew a prescription',
  })
  @ApiParam({ name: 'id', description: 'Prescription ID' })
  @ApiResponse({ status: 200, description: 'Renewal requested successfully' })
  @ApiResponse({ status: 404, description: 'Prescription not found' })
  @ApiResponse({ status: 403, description: 'Not your prescription' })
  async requestRenewal(
    @Param('id', ParseUUIDPipe) prescriptionId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.prescriptionRenewalService.requestRenewal(
      userId,
      prescriptionId,
    );
  }

  @Patch(':id/approve-renewal')
  @Roles(UserRole.DOCTOR)
  @ApiOperation({
    summary: 'Approve Prescription Renewal (Doctor)',
    description: 'Doctor approves a prescription renewal request',
  })
  @ApiParam({ name: 'id', description: 'Renewal ID' })
  @ApiResponse({ status: 200, description: 'Renewal approved successfully' })
  @ApiResponse({ status: 404, description: 'Renewal request not found' })
  async approveRenewal(
    @Param('id', ParseUUIDPipe) renewalId: string,
    @CurrentUser('sub') userId: string,
    @Body() approveDto: ApprovePrescriptionRenewalDto,
  ) {
    return this.prescriptionRenewalService.approveRenewal(
      renewalId,
      userId,
      approveDto,
    );
  }

  @Patch(':id/reject-renewal')
  @Roles(UserRole.DOCTOR)
  @ApiOperation({
    summary: 'Reject Prescription Renewal (Doctor)',
    description: 'Doctor rejects a prescription renewal request',
  })
  @ApiParam({ name: 'id', description: 'Renewal ID' })
  @ApiResponse({ status: 200, description: 'Renewal rejected successfully' })
  @ApiResponse({ status: 404, description: 'Renewal request not found' })
  async rejectRenewal(
    @Param('id', ParseUUIDPipe) renewalId: string,
    @CurrentUser('sub') userId: string,
    @Body() rejectDto: ReasonPrescriptionRenewalDto,
  ) {
    return this.prescriptionRenewalService.rejectRenewal(
      renewalId,
      userId,
      rejectDto,
    );
  }

  // ==================== DRUG INTERACTIONS ====================

  @Post('check-interactions')
  @Roles(UserRole.DOCTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check drug-to-drug interactions in real-time',
    description:
      'Takes an array of drug names, checks the local Redis cache, or fetches from OpenFDA to detect severe/fatal interactions before creating the prescription.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Interactions checked successfully. Returns an array of detected interactions and their severity levels.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid drug names list provided.',
  })
  async checkInteractions(@Body() dto: CheckInteractionsDto) {
    return this.prescriptionsService.checkDrugInteractions(dto.drugNames);
  }

  // ==================== PDF GENERATION ====================

  @Get(':id/pdf')
  @ApiOperation({
    summary: 'Generate and stream prescription PDF on the fly',
    description: 'Generate pharmacy-ready prescription PDF',
  })
  @ApiParam({ name: 'id', description: 'Prescription ID' })
  async downloadPrescriptionPdf(
    @Param('id') id: string,
    @Res() res: express.Response,
  ) {
    return this.prescriptionPdfService.generatePrescriptionPdf(id, res);
  }
}

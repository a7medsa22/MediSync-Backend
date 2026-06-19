import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import express from 'express';
import { MedicalRecordsService } from './medical-records.service';
import {
  CreateMedicalRecordDto,
  UpdateMedicalRecordDto,
  ShareRecordDto,
  QueryRecordsDto,
} from './dto/medical-records.dto';
import { ApiAuth } from 'src/common/decorators/api-auth.decorator';

@ApiTags('Medical Records')
@ApiAuth()
@Controller({
  path: 'medical-records',
  version: '2'
})
export class MedicalRecordsController {
  constructor(private readonly medicalRecordsService: MedicalRecordsService) { }

  /* ───── Upload / Create ─────────────────────────────────── */

  @Post()
  @Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a medical record file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File to upload (PDF, JPEG, PNG, DOC, TIFF, DICOM)',
        },
        title: { type: 'string', description: 'Record title' },
        description: { type: 'string', description: 'Optional description' },
        recordType: {
          type: 'string',
          description:
            'LAB_RESULT | XRAY | SCAN | MEDICAL_REPORT | VACCINATION | OTHER',
        },
        patientId: {
          type: 'string',
          format: 'uuid',
          description: 'Patient UUID',
        },
        clinicId: {
          type: 'string',
          format: 'uuid',
          description: 'Optional clinic UUID',
        },
        connectionId: {
          type: 'string',
          format: 'uuid',
          description: 'Optional connection UUID',
        },
        doctorId: {
          type: 'string',
          format: 'uuid',
          description: 'Optional doctor UUID',
        },
        recordDate: {
          type: 'string',
          format: 'date-time',
          description: 'ISO date of record',
        },
      },
      required: ['file', 'title', 'recordType', 'patientId'],
    },
  })
  @ApiResponse({ status: 201, description: 'Record created successfully' })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or unsupported file type',
  })
  async create(
    @Body() dto: CreateMedicalRecordDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') userId: string,
  ) {
    return this.medicalRecordsService.createRecord(dto, file, userId);
  }

  /* ───── List / Query ───────────────────────────────────── */

  @Get()
  @Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'List medical records with optional filters' })
  @ApiQuery({
    name: 'patientId',
    required: false,
    description: 'Filter by patient UUID',
  })
  @ApiQuery({
    name: 'recordType',
    required: false,
    description: 'Filter by record type',
  })
  @ApiQuery({
    name: 'clinicId',
    required: false,
    description: 'Filter by clinic UUID',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (1-based)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page',
  })
  async list(@Query() query: QueryRecordsDto) {
    return this.medicalRecordsService.listRecords(query);
  }

  /* ───── Get Single Record ───────────────────────────────── */

  @Get(':id')
  @Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get a single record by ID' })
  @ApiResponse({ status: 200, description: 'Record found' })
  @ApiResponse({ status: 404, description: 'Record not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async get(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Req() req: express.Request,
  ) {
    return this.medicalRecordsService.getRecord(id, userId, req);
  }

  /* ───── Download ────────────────────────────────────────── */

  @Get(':id/download')
  @Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Download a decrypted record file' })
  @ApiResponse({ status: 200, description: 'File data returned' })
  @ApiResponse({ status: 403, description: 'Download permission denied' })
  async download(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Req() req: express.Request,
  ) {
    return this.medicalRecordsService.downloadRecord(id, userId, req);
  }

  /* ───── Update ──────────────────────────────────────────── */

  @Patch(':id')
  @Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update record metadata' })
  @ApiResponse({ status: 200, description: 'Record updated' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMedicalRecordDto,
    @CurrentUser('sub') userId: string,
    @Req() req: express.Request,
  ) {
    return this.medicalRecordsService.updateRecord(id, dto, userId, req);
  }

  /* ───── Delete ──────────────────────────────────────────── */

  @Delete(':id')
  @Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a record (S3 + DB)' })
  @ApiResponse({ status: 204, description: 'Record deleted' })
  async delete(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Req() req: express.Request,
  ) {
    await this.medicalRecordsService.deleteRecord(id, userId, req);
  }

  /* ───── Share ───────────────────────────────────────────── */

  @Post(':id/share')
  @Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Share a record with another user' })
  @ApiResponse({ status: 201, description: 'Record shared' })
  async share(
    @Param('id') id: string,
    @Body() dto: ShareRecordDto,
    @CurrentUser('sub') userId: string,
    @Req() req: express.Request,
  ) {
    return this.medicalRecordsService.shareRecord(id, dto, userId, req);
  }

  /* ───── Revoke Share ────────────────────────────────────── */

  @Delete('shares/:shareId')
  @Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a share link' })
  async revokeShare(
    @Param('shareId') shareId: string,
    @CurrentUser('sub') userId: string,
    @Req() req: express.Request,
  ) {
    await this.medicalRecordsService.revokeShare(shareId, userId, req);
  }

  /* ───── Audit Trail ─────────────────────────────────────── */

  @Get(':id/audit')
  @Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get access audit trail for a record' })
  @ApiResponse({ status: 200, description: 'Audit log entries' })
  async auditTrail(@Param('id') id: string) {
    return this.medicalRecordsService.getAuditTrail(id);
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { EncryptionService } from 'src/common/encryption/encryption.service';
import { AuditAction, AuditService } from 'src/common/audit/audit.service';
import { STORAGE_SERVICE } from 'src/common/storage/storage.module';
import type { IStorageService } from 'src/common/storage/storage.interface';
import {
  CreateMedicalRecordDto,
  UpdateMedicalRecordDto,
  ShareRecordDto,
  QueryRecordsDto,
} from './dto/medical-records.dto';
import type { EncryptionMetadata } from './types/encryption-metadata.type';

/** Minimal file interface decoupled from Express.Multer (multer v2 compat). */
interface UploadedFile {
  /** Original file name */
  originalname: string;
  /** MIME type */
  mimetype: string;
  /** File size in bytes */
  size: number;
  /** Raw file data */
  buffer: Buffer;
}

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/tiff',
  'image/dicom',
] as const;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class MedicalRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly auditService: AuditService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: IStorageService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createRecord(
    dto: CreateMedicalRecordDto,
    file: UploadedFile,
    userId: string,
  ) {
    MedicalRecordsService.validateFile(file);

    // 1. Encrypt the file buffer before persisting
    const { encryptedData, iv, authTag, keyId } =
      await this.encryptionService.encryptFile(file.buffer);

    const cryptoMeta: EncryptionMetadata = {
      algorithm: 'aes-256-gcm',
      iv,
      authTag,
      keyId,
    };

    // 2. Upload encrypted data to S3 (or local fallback)
    const uploadResult = await this.storageService.upload(
      {
        buffer: encryptedData,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: encryptedData.length,
      },
      `records/${dto.patientId}`,
    );

    try {
      // 3. Persist metadata in a transaction — if this fails, S3 rollback happens in catch
      return await this.prisma.$transaction(async (tx) => {
        const record = await tx.medicalRecord.create({
          data: {
            patientId: dto.patientId,
            doctorId: dto.doctorId ?? null,
            connectionId: dto.connectionId ?? null,
            clinicId: dto.clinicId ?? null,
            title: dto.title,
            description: dto.description ?? null,
            recordType: dto.recordType as any,
            fileName: file.originalname,
            fileUrl: uploadResult.url,
            fileSize: BigInt(encryptedData.length),
            mimeType: file.mimetype,
            uploadedBy: userId,
            recordDate: dto.recordDate ? new Date(dto.recordDate) : new Date(),
            version: 1,
            isEncrypted: true,
            encryptionMetadata: cryptoMeta as unknown as Prisma.InputJsonValue,
            isVerified: false,
          },
        });

        await tx.fileAuditLog.create({
          data: {
            recordId: record.id,
            userId,
            action: AuditAction.UPLOAD,
            ipAddress: '',
            userAgent: '',
          },
        });

        // 4. Notify other modules (notifications, index updates, etc.)
        this.eventEmitter.emit('medical-record.created', {
          recordId: record.id,
          patientId: dto.patientId,
          uploadedBy: userId,
        });

        return record;
      });
    } catch (error) {
      // DB failed → remove orphan from S3
      await this.storageService.delete(uploadResult.key).catch(() => {});
      throw error;
    }
  }

  async listRecords(dto: QueryRecordsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.MedicalRecordWhereInput = {};

    if (dto.patientId) where.patientId = dto.patientId;
    if (dto.recordType) where.recordType = dto.recordType as any;
    if (dto.clinicId) where.clinicId = dto.clinicId;

    const [records, total] = await Promise.all([
      this.prisma.medicalRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { recordDate: 'desc' },
        include: {
          patient: { select: { userId: true } },
          doctor: {
            select: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
      this.prisma.medicalRecord.count({ where }),
    ]);

    return {
      data: records,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getRecord(id: string, userId: string, req: Request) {
    const record = await this.prisma.medicalRecord.findUnique({
      where: { id },
      include: {
        shares: {
          where: { sharedWithUserId: userId },
          select: { expiresAt: true, canDownload: true, canShare: true },
        },
      },
    });

    if (!record) {
      throw new NotFoundException('Record not found');
    }

    this.assertAccess(record, userId);

    await this.auditService.logAccess(id, userId, AuditAction.VIEW, req);

    // Strip sensitive crypto fields from response
    const meta = record.encryptionMetadata as unknown as EncryptionMetadata;

    return {
      ...record,
      encryptionMetadata: {
        algorithm: meta.algorithm,
        keyId: meta.keyId,
        // IV and authTag are NOT exposed to the client
      },
    };
  }

  async downloadRecord(id: string, userId: string, req: Request) {
    const record = await this.prisma.medicalRecord.findUnique({
      where: { id },
      include: {
        shares: {
          where: { sharedWithUserId: userId },
          select: { expiresAt: true, canDownload: true },
        },
      },
    });

    if (!record) {
      throw new NotFoundException('Record not found');
    }

    this.assertAccess(record, userId);

    // For shared records, verify download permission
    if (
      !this.isOwner(record, userId) &&
      record.shares.length > 0 &&
      !record.shares[0].canDownload
    ) {
      throw new ForbiddenException(
        'Download permission restricted for this share',
      );
    }

    const meta = record.encryptionMetadata as unknown as EncryptionMetadata;

    // Fetch encrypted blob from S3
    const encryptedBuffer = await this.storageService.download(
      this.extractKeyFromUrl(record.fileUrl),
    );

    const decryptedBuffer = await this.encryptionService.decryptFile(
      encryptedBuffer,
      meta.iv,
      meta.authTag,
      meta.keyId,
    );

    await this.auditService.logAccess(id, userId, AuditAction.DOWNLOAD, req);

    return {
      fileName: record.fileName,
      mimeType: record.mimeType,
      fileBuffer: decryptedBuffer,
    };
  }

  async updateRecord(
    id: string,
    dto: UpdateMedicalRecordDto,
    userId: string,
    req: Request,
  ) {
    const record = await this.prisma.medicalRecord.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException('Record not found');
    }

    if (record.uploadedBy !== userId) {
      throw new ForbiddenException('Only the uploader can edit this record');
    }

    const updateData: Prisma.MedicalRecordUpdateInput = {};

    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.recordType !== undefined)
      updateData.recordType = dto.recordType as any;
    if (dto.isVerified !== undefined) updateData.isVerified = dto.isVerified;
    if (dto.verifyNotes !== undefined) updateData.verifyNotes = dto.verifyNotes;

    const updated = await this.prisma.medicalRecord.update({
      where: { id },
      data: updateData,
    });

    await this.auditService.logAccess(id, userId, AuditAction.VIEW, req);

    return updated;
  }

  async deleteRecord(id: string, userId: string, req: Request) {
    const record = await this.prisma.medicalRecord.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException('Record not found');
    }

    if (record.uploadedBy !== userId) {
      throw new ForbiddenException('Only the uploader can delete this record');
    }

    // Delete from S3 first, then DB
    await this.storageService
      .delete(this.extractKeyFromUrl(record.fileUrl))
      .catch(() => {});

    await this.prisma.$transaction(async (tx) => {
      await tx.fileAuditLog.deleteMany({ where: { recordId: id } });
      await tx.recordShare.deleteMany({ where: { recordId: id } });
      await tx.medicalRecord.delete({ where: { id } });

      // Log the deletion
      await tx.fileAuditLog.create({
        data: {
          recordId: id,
          userId,
          action: AuditAction.DELETE,
          ipAddress: this.auditService.extractIpAddress(req),
          userAgent: req.headers['user-agent'] || 'Unknown',
        },
      });
    });

    this.eventEmitter.emit('medical-record.deleted', {
      recordId: id,
      patientId: record.patientId,
    });
  }

  async shareRecord(
    id: string,
    dto: ShareRecordDto,
    userId: string,
    req: Request,
  ) {
    const record = await this.prisma.medicalRecord.findUnique({
      where: { id },
      select: { id: true, patientId: true, uploadedBy: true },
    });

    if (!record) {
      throw new NotFoundException('Record not found');
    }

    const canShare =
      record.patientId === userId || record.uploadedBy === userId;

    if (!canShare) {
      throw new ForbiddenException(
        'Only the patient or uploader can share this record',
      );
    }

    // Duplicate-check: extend existing active share if one exists
    const existing = await this.prisma.recordShare.findFirst({
      where: {
        recordId: id,
        sharedWithUserId: dto.sharedWithUserId,
        expiresAt: { gt: new Date() },
      },
    });

    if (existing) {
      const updated = await this.prisma.recordShare.update({
        where: { id: existing.id },
        data: {
          canDownload: dto.canDownload ?? existing.canDownload,
          canShare: dto.canShare ?? existing.canShare,
          expiresAt: new Date(dto.expiresAt),
          sharedBy: userId,
        },
      });

      await this.auditService.logAccess(id, userId, AuditAction.SHARE, req);
      return updated;
    }

    const share = await this.prisma.recordShare.create({
      data: {
        recordId: id,
        sharedWithUserId: dto.sharedWithUserId,
        sharedBy: userId,
        canDownload: dto.canDownload ?? true,
        canShare: dto.canShare ?? false,
        expiresAt: new Date(dto.expiresAt),
      },
    });

    await this.auditService.logAccess(id, userId, AuditAction.SHARE, req);

    this.eventEmitter.emit('medical-record.shared', {
      recordId: id,
      sharedWith: dto.sharedWithUserId,
      sharedBy: userId,
    });

    return share;
  }

  async revokeShare(shareId: string, userId: string, req: Request) {
    const share = await this.prisma.recordShare.findUnique({
      where: { id: shareId },
      include: {
        medicalRecord: {
          select: { id: true, patientId: true, uploadedBy: true },
        },
      },
    });

    if (!share) {
      throw new NotFoundException('Share not found');
    }

    const record = share.medicalRecord;
    if (record.patientId !== userId && record.uploadedBy !== userId) {
      throw new ForbiddenException('Only the record owner can revoke shares');
    }

    await this.prisma.recordShare.delete({ where: { id: shareId } });

    await this.auditService.logAccess(
      record.id,
      userId,
      AuditAction.SHARE,
      req,
    );
  }

  async getAuditTrail(recordId: string) {
    return this.auditService.getAuditTrail(recordId);
  }

  // ─── Access Control Helpers ─────────────────────────────────

  private assertAccess(
    record: {
      uploadedBy: string;
      patientId: string;
      shares: { expiresAt: Date; canDownload?: boolean }[];
    },
    userId: string,
  ): void {
    if (this.isOwner(record, userId)) return;
    if (this.isValidSharee(record.shares)) return;
    throw new ForbiddenException('Access denied to this record');
  }

  private isOwner(
    record: { uploadedBy: string; patientId: string },
    userId: string,
  ): boolean {
    return record.uploadedBy === userId || record.patientId === userId;
  }

  private isValidSharee(shares: { expiresAt: Date }[]): boolean {
    return (
      shares.length > 0 &&
      shares.some((s) => new Date(s.expiresAt) > new Date())
    );
  }

  private extractKeyFromUrl(url: string): string {
    // S3: https://bucket.s3.region.amazonaws.com/records/...
    const s3Prefix = 'amazonaws.com/';
    const s3Idx = url.indexOf(s3Prefix);
    if (s3Idx !== -1) {
      return url.slice(s3Idx + s3Prefix.length);
    }
    // Local fallback: /local-storage/records/...
    const localPrefix = '/local-storage/';
    if (url.startsWith(localPrefix)) {
      return url.slice(localPrefix.length);
    }
    return url;
  }

  // ─── File Validation ────────────────────────────────────────

  static validateFile(file: UploadedFile): void {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype as any)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds maximum limit of 10MB`,
      );
    }
  }

  private validateFile(file: UploadedFile): void {
    MedicalRecordsService.validateFile(file);
  }
}

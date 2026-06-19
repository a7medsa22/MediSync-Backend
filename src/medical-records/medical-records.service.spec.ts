import { Test, TestingModule } from '@nestjs/testing';
import { MedicalRecordsService } from './medical-records.service';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import { AuditService, AuditAction } from '../common/audit/audit.service';
import { STORAGE_SERVICE } from '../common/storage/storage.module';
import { IStorageService } from '../common/storage/storage.interface';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateMedicalRecordDto,
  UpdateMedicalRecordDto,
  ShareRecordDto,
  QueryRecordsDto,
} from './dto/medical-records.dto';
import { EncryptionMetadata } from './types/encryption-metadata.type';

// 模拟文件对象
const mockFile: Express.Multer.File = {
  fieldname: 'file',
  originalname: 'test-report.pdf',
  encoding: '7bit',
  mimetype: 'application/pdf',
  size: 1024 * 1024, // 1MB
  destination: '/tmp',
  filename: 'test-report.pdf',
  path: '/tmp/test-report.pdf',
  buffer: Buffer.from('test file content'),
};

// 模拟 Prisma 事务客户端
const mockPrismaClient = {
  medicalRecord: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  fileAuditLog: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  recordShare: {
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    findUnique: jest.fn(),
  },
  patient: {
    findUnique: jest.fn(),
  },
};

const mockPrismaService = {
  $transaction: jest.fn(async (callback: any) => {
    const result = await callback(mockPrismaClient);
    return result;
  }),
  medicalRecord: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  fileAuditLog: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  recordShare: {
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    findUnique: jest.fn(),
  },
  patient: {
    findUnique: jest.fn(),
  },
};

// 模拟加密服务
const mockEncryptionService = {
  encryptFile: jest.fn(),
  decryptFile: jest.fn(),
};

// 模拟存储服务
const mockStorageService = {
  upload: jest.fn(),
  download: jest.fn(),
  delete: jest.fn().mockResolvedValue(undefined),
};

// 模拟审计服务
const mockAuditService = {
  logAccess: jest.fn(),
  getAuditTrail: jest.fn(),
  extractIpAddress: jest.fn(),
};

// 模拟事件发射器
const mockEventEmitter = {
  emit: jest.fn(),
};

describe('MedicalRecordsService', () => {
  let service: MedicalRecordsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MedicalRecordsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: STORAGE_SERVICE, useValue: mockStorageService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<MedicalRecordsService>(MedicalRecordsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createRecord', () => {
    it('should create a medical record successfully', async () => {
      // Arrange
      const dto: CreateMedicalRecordDto = {
        patientId: 'patient-123',
        title: 'Blood Test Results',
        recordType: 'LAB_RESULT',
        description: 'Annual blood work',
      };
      const userId = 'user-123';
      const encryptedData = Buffer.from('encrypted content');
      const encryptionMeta: EncryptionMetadata = {
        algorithm: 'aes-256-gcm',
        iv: 'mock-iv',
        authTag: 'mock-auth-tag',
        keyId: 'key-123',
      };
      const uploadResult = {
        url: 'https://medisync-records.s3.us-east-1.amazonaws.com/records/patient-123/encrypted-file.pdf',
        key: 'records/patient-123/encrypted-file.pdf',
      };
      const createdRecord = {
        id: 'record-123',
        ...dto,
        fileName: mockFile.originalname,
        fileUrl: uploadResult.url,
        uploadedBy: userId,
      };

      mockEncryptionService.encryptFile.mockResolvedValue({
        encryptedData,
        ...encryptionMeta,
      });
      mockStorageService.upload.mockResolvedValue(uploadResult);
      mockPrismaClient.medicalRecord.create.mockResolvedValue(createdRecord);
      mockPrismaClient.fileAuditLog.create.mockResolvedValue({});
      mockPrismaService.patient.findUnique.mockResolvedValue({ userId: 'patient-user-123' });

      // Act
      const result = await service.createRecord(dto, mockFile, userId);

      // Assert
      expect(result).toEqual(createdRecord);
      expect(mockEncryptionService.encryptFile).toHaveBeenCalledWith(
        mockFile.buffer,
      );
      expect(mockStorageService.upload).toHaveBeenCalled();
      expect(mockPrismaClient.medicalRecord.create).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'medical-record.created',
        {
          recordId: createdRecord.id,
          patientId: dto.patientId,
          uploadedBy: userId,
        },
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'notification.trigger',
        expect.objectContaining({
          userId: 'patient-user-123',
          type: 'MEDICAL_RECORD_UPLOADED',
        }),
      );
    });

    it('should throw BadRequestException for invalid file type', async () => {
      // Arrange
      const invalidFile = { ...mockFile, mimetype: 'application/exe' };
      const dto: CreateMedicalRecordDto = {
        patientId: 'patient-123',
        title: 'Test',
        recordType: 'LAB_RESULT',
      };
      const userId = 'user-123';

      // Act & Assert
      await expect(
        service.createRecord(dto, invalidFile, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for file size exceeding limit', async () => {
      // Arrange
      const largeFile = { ...mockFile, size: 11 * 1024 * 1024 }; // 11MB
      const dto: CreateMedicalRecordDto = {
        patientId: 'patient-123',
        title: 'Test',
        recordType: 'LAB_RESULT',
      };
      const userId = 'user-123';

      // Act & Assert
      await expect(
        service.createRecord(dto, largeFile, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should rollback S3 upload if DB transaction fails', async () => {
      // Arrange
      const dto: CreateMedicalRecordDto = {
        patientId: 'patient-123',
        title: 'Test',
        recordType: 'LAB_RESULT',
      };
      const userId = 'user-123';
      const encryptedData = Buffer.from('encrypted content');
      const encryptionMeta: EncryptionMetadata = {
        algorithm: 'aes-256-gcm',
        iv: 'mock-iv',
        authTag: 'mock-auth-tag',
        keyId: 'key-123',
      };
      const uploadResult = {
        url: 'https://medisync-records.s3.us-east-1.amazonaws.com/records/patient-123/encrypted-file.pdf',
        key: 'records/patient-123/encrypted-file.pdf',
      };

      mockEncryptionService.encryptFile.mockResolvedValue({
        encryptedData,
        ...encryptionMeta,
      });
      mockStorageService.upload.mockResolvedValue(uploadResult);
      mockPrismaClient.medicalRecord.create.mockRejectedValue(
        new Error('DB Error'),
      );

      // Act & Assert
      await expect(service.createRecord(dto, mockFile, userId)).rejects.toThrow(
        'DB Error',
      );
      expect(mockStorageService.delete).toHaveBeenCalledWith(uploadResult.key);
    });
  });

  describe('listRecords', () => {
    it('should return paginated medical records', async () => {
      // Arrange
      const dto: QueryRecordsDto = {
        patientId: 'patient-123',
        page: 1,
        limit: 10,
      };
      const mockRecords = [
        {
          id: 'record-1',
          title: 'Test Record',
          patient: { userId: 'patient-123' },
          doctor: { user: { firstName: 'John', lastName: 'Doe' } },
        },
      ];
      const total = 1;

      mockPrismaService.medicalRecord.findMany.mockResolvedValue(mockRecords);
      mockPrismaService.medicalRecord.count.mockResolvedValue(total);

      // Act
      const result = await service.listRecords(dto);

      // Assert
      expect(result).toEqual({
        data: mockRecords,
        meta: {
          total,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      });
      expect(mockPrismaService.medicalRecord.findMany).toHaveBeenCalledWith({
        where: { patientId: 'patient-123' },
        skip: 0,
        take: 10,
        orderBy: { recordDate: 'desc' },
        include: {
          patient: { select: { userId: true } },
          doctor: {
            select: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      });
    });
  });

  describe('getRecord', () => {
    it('should return a record with stripped encryption metadata', async () => {
      // Arrange
      const recordId = 'record-123';
      const userId = 'user-123';
      const mockRecord = {
        id: recordId,
        title: 'Test Record',
        uploadedBy: userId,
        patientId: 'patient-123',
        encryptionMetadata: {
          algorithm: 'aes-256-gcm',
          iv: 'mock-iv',
          authTag: 'mock-auth-tag',
          keyId: 'key-123',
        },
        shares: [],
      };
      const req = { headers: {} } as any;

      mockPrismaService.medicalRecord.findUnique.mockResolvedValue(mockRecord);

      // Act
      const result = await service.getRecord(recordId, userId, req);

      // Assert
      expect(result).toEqual({
        ...mockRecord,
        encryptionMetadata: {
          algorithm: mockRecord.encryptionMetadata.algorithm,
          keyId: mockRecord.encryptionMetadata.keyId,
        },
      });
      expect(mockAuditService.logAccess).toHaveBeenCalledWith(
        recordId,
        userId,
        AuditAction.VIEW,
        req,
      );
    });

    it('should throw NotFoundException if record does not exist', async () => {
      // Arrange
      const recordId = 'non-existent-id';
      const userId = 'user-123';
      const req = {} as any;

      mockPrismaService.medicalRecord.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getRecord(recordId, userId, req)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user does not have access', async () => {
      // Arrange
      const recordId = 'record-123';
      const userId = 'unauthorized-user';
      const mockRecord = {
        id: recordId,
        title: 'Test Record',
        uploadedBy: 'another-user',
        patientId: 'another-patient',
        shares: [],
      };
      const req = {} as any;

      mockPrismaService.medicalRecord.findUnique.mockResolvedValue(mockRecord);

      // Act & Assert
      await expect(service.getRecord(recordId, userId, req)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('downloadRecord', () => {
    it('should download and decrypt a record', async () => {
      // Arrange
      const recordId = 'record-123';
      const userId = 'user-123';
      const mockRecord = {
        id: recordId,
        fileName: 'test-report.pdf',
        mimeType: 'application/pdf',
        fileUrl:
          'https://medisync-records.s3.us-east-1.amazonaws.com/records/patient-123/encrypted-file.pdf',
        uploadedBy: userId,
        patientId: 'patient-123',
        encryptionMetadata: {
          algorithm: 'aes-256-gcm',
          iv: 'mock-iv',
          authTag: 'mock-auth-tag',
          keyId: 'key-123',
        },
        shares: [],
      };
      const encryptedBuffer = Buffer.from('encrypted content');
      const decryptedBuffer = Buffer.from('decrypted content');
      const req = {} as any;

      mockPrismaService.medicalRecord.findUnique.mockResolvedValue(mockRecord);
      mockStorageService.download.mockResolvedValue(encryptedBuffer);
      mockEncryptionService.decryptFile.mockResolvedValue(decryptedBuffer);

      // Act
      const result = await service.downloadRecord(recordId, userId, req);

      // Assert
      expect(result).toEqual({
        fileName: mockRecord.fileName,
        mimeType: mockRecord.mimeType,
        fileBuffer: decryptedBuffer,
      });
      expect(mockStorageService.download).toHaveBeenCalledWith(
        'records/patient-123/encrypted-file.pdf',
      );
      expect(mockEncryptionService.decryptFile).toHaveBeenCalledWith(
        encryptedBuffer,
        mockRecord.encryptionMetadata.iv,
        mockRecord.encryptionMetadata.authTag,
        mockRecord.encryptionMetadata.keyId,
      );
      expect(mockAuditService.logAccess).toHaveBeenCalledWith(
        recordId,
        userId,
        AuditAction.DOWNLOAD,
        req,
      );
    });

    it('should throw ForbiddenException if share does not allow download', async () => {
      // Arrange
      const recordId = 'record-123';
      const userId = 'user-123';
      const mockRecord = {
        id: recordId,
        uploadedBy: 'another-user',
        patientId: 'another-patient',
        shares: [
          {
            expiresAt: new Date(Date.now() + 86400000), // Tomorrow
            canDownload: false,
          },
        ],
      };
      const req = {} as any;

      mockPrismaService.medicalRecord.findUnique.mockResolvedValue(mockRecord);

      // Act & Assert
      await expect(
        service.downloadRecord(recordId, userId, req),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateRecord', () => {
    it('should update a record', async () => {
      // Arrange
      const recordId = 'record-123';
      const userId = 'user-123';
      const dto: UpdateMedicalRecordDto = {
        title: 'Updated Title',
        description: 'Updated description',
      };
      const mockRecord = {
        id: recordId,
        uploadedBy: userId,
      };
      const updatedRecord = {
        ...mockRecord,
        ...dto,
      };
      const req = {} as any;

      mockPrismaService.medicalRecord.findUnique.mockResolvedValue(mockRecord);
      mockPrismaService.medicalRecord.update.mockResolvedValue(updatedRecord);

      // Act
      const result = await service.updateRecord(recordId, dto, userId, req);

      // Assert
      expect(result).toEqual(updatedRecord);
      expect(mockPrismaService.medicalRecord.update).toHaveBeenCalledWith({
        where: { id: recordId },
        data: {
          title: dto.title,
          description: dto.description,
        },
      });
    });

    it('should throw ForbiddenException if user is not the uploader', async () => {
      // Arrange
      const recordId = 'record-123';
      const userId = 'unauthorized-user';
      const dto: UpdateMedicalRecordDto = {
        title: 'Updated Title',
      };
      const mockRecord = {
        id: recordId,
        uploadedBy: 'another-user',
      };
      const req = {} as any;

      mockPrismaService.medicalRecord.findUnique.mockResolvedValue(mockRecord);

      // Act & Assert
      await expect(
        service.updateRecord(recordId, dto, userId, req),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteRecord', () => {
    it('should delete a record', async () => {
      // Arrange
      const recordId = 'record-123';
      const userId = 'user-123';
      const mockRecord = {
        id: recordId,
        uploadedBy: userId,
        patientId: 'patient-123',
        fileUrl:
          'https://medisync-records.s3.us-east-1.amazonaws.com/records/patient-123/encrypted-file.pdf',
      };
      const req = {
        headers: { 'user-agent': 'test-agent' },
      } as any;

      mockPrismaService.medicalRecord.findUnique.mockResolvedValue(mockRecord);
      mockAuditService.extractIpAddress.mockReturnValue('127.0.0.1');
      mockPrismaClient.fileAuditLog.deleteMany.mockResolvedValue({});
      mockPrismaClient.recordShare.deleteMany.mockResolvedValue({});
      mockPrismaClient.medicalRecord.delete.mockResolvedValue({});
      mockPrismaClient.fileAuditLog.create.mockResolvedValue({});

      // Act
      await service.deleteRecord(recordId, userId, req);

      // Assert
      expect(mockStorageService.delete).toHaveBeenCalledWith(
        'records/patient-123/encrypted-file.pdf',
      );
      expect(mockPrismaClient.fileAuditLog.deleteMany).toHaveBeenCalledWith({
        where: { recordId },
      });
      expect(mockPrismaClient.recordShare.deleteMany).toHaveBeenCalledWith({
        where: { recordId },
      });
      expect(mockPrismaClient.medicalRecord.delete).toHaveBeenCalledWith({
        where: { id: recordId },
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'medical-record.deleted',
        {
          recordId,
          patientId: mockRecord.patientId,
        },
      );
    });

    it('should throw ForbiddenException if user is not the uploader', async () => {
      // Arrange
      const recordId = 'record-123';
      const userId = 'unauthorized-user';
      const mockRecord = {
        id: recordId,
        uploadedBy: 'another-user',
      };
      const req = {} as any;

      mockPrismaService.medicalRecord.findUnique.mockResolvedValue(mockRecord);

      // Act & Assert
      await expect(service.deleteRecord(recordId, userId, req)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('shareRecord', () => {
    it('should share a record with another user', async () => {
      // Arrange
      const recordId = 'record-123';
      const userId = 'user-123';
      const dto: ShareRecordDto = {
        sharedWithUserId: 'shared-user-123',
        expiresAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      };
      const mockRecord = {
        id: recordId,
        patientId: 'patient-123',
        uploadedBy: userId,
      };
      const mockShare = {
        id: 'share-123',
        ...dto,
        recordId,
        sharedBy: userId,
      };
      const req = {} as any;

      const recordWithUser = {
        ...mockRecord,
        title: 'Blood Test Results',
        patient: { user: { firstName: 'Test', lastName: 'Patient' } },
      };

      mockPrismaService.medicalRecord.findUnique.mockResolvedValue(recordWithUser);
      mockPrismaService.recordShare.findFirst.mockResolvedValue(null);
      mockPrismaService.recordShare.create.mockResolvedValue(mockShare);

      // Act
      const result = await service.shareRecord(recordId, dto, userId, req);

      // Assert
      expect(result).toEqual(mockShare);
      expect(mockPrismaService.recordShare.create).toHaveBeenCalledWith({
        data: {
          recordId,
          sharedWithUserId: dto.sharedWithUserId,
          sharedBy: userId,
          canDownload: true,
          canShare: false,
          expiresAt: new Date(dto.expiresAt),
        },
      });
      expect(mockAuditService.logAccess).toHaveBeenCalledWith(
        recordId,
        userId,
        AuditAction.SHARE,
        req,
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'medical-record.shared',
        {
          recordId,
          sharedWith: dto.sharedWithUserId,
          sharedBy: userId,
        },
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'notification.trigger',
        expect.objectContaining({
          userId: 'shared-user-123',
          type: 'MEDICAL_RECORD_SHARED',
          data: expect.objectContaining({
            recordId: 'record-123',
            patientName: 'Test Patient',
            recordTitle: 'Blood Test Results',
          }),
        }),
      );
    });

    it('should update an existing share if one exists', async () => {
      // Arrange
      const recordId = 'record-123';
      const userId = 'user-123';
      const dto: ShareRecordDto = {
        sharedWithUserId: 'shared-user-123',
        expiresAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        canDownload: false,
      };
      const mockRecord = {
        id: recordId,
        patientId: 'patient-123',
        uploadedBy: userId,
      };
      const existingShare = {
        id: 'existing-share-123',
        recordId,
        sharedWithUserId: dto.sharedWithUserId,
        canDownload: true,
        canShare: false,
        expiresAt: new Date(Date.now() + 86400000),
      };
      const updatedShare = {
        ...existingShare,
        canDownload: dto.canDownload,
        expiresAt: new Date(dto.expiresAt),
      };
      const req = {} as any;

      mockPrismaService.medicalRecord.findUnique.mockResolvedValue(mockRecord);
      mockPrismaService.recordShare.findFirst.mockResolvedValue(existingShare);
      mockPrismaService.recordShare.update.mockResolvedValue(updatedShare);

      // Act
      const result = await service.shareRecord(recordId, dto, userId, req);

      // Assert
      expect(result).toEqual(updatedShare);
      expect(mockPrismaService.recordShare.update).toHaveBeenCalledWith({
        where: { id: existingShare.id },
        data: {
          canDownload: dto.canDownload,
          canShare: existingShare.canShare,
          expiresAt: new Date(dto.expiresAt),
          sharedBy: userId,
        },
      });
    });

    it('should throw ForbiddenException if user is not the patient or uploader', async () => {
      // Arrange
      const recordId = 'record-123';
      const userId = 'unauthorized-user';
      const dto: ShareRecordDto = {
        sharedWithUserId: 'shared-user-123',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
      const mockRecord = {
        id: recordId,
        patientId: 'patient-123',
        uploadedBy: 'another-user',
      };
      const req = {} as any;

      mockPrismaService.medicalRecord.findUnique.mockResolvedValue(mockRecord);

      // Act & Assert
      await expect(
        service.shareRecord(recordId, dto, userId, req),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('revokeShare', () => {
    it('should revoke a share', async () => {
      // Arrange
      const shareId = 'share-123';
      const userId = 'user-123';
      const mockShare = {
        id: shareId,
        medicalRecord: {
          id: 'record-123',
          patientId: 'patient-123',
          uploadedBy: userId,
        },
      };
      const req = {} as any;

      mockPrismaService.recordShare.findUnique.mockResolvedValue(mockShare);

      // Act
      await service.revokeShare(shareId, userId, req);

      // Assert
      expect(mockPrismaService.recordShare.delete).toHaveBeenCalledWith({
        where: { id: shareId },
      });
      expect(mockAuditService.logAccess).toHaveBeenCalledWith(
        mockShare.medicalRecord.id,
        userId,
        AuditAction.SHARE,
        req,
      );
    });

    it('should throw ForbiddenException if user is not the record owner', async () => {
      // Arrange
      const shareId = 'share-123';
      const userId = 'unauthorized-user';
      const mockShare = {
        id: shareId,
        medicalRecord: {
          id: 'record-123',
          patientId: 'patient-123',
          uploadedBy: 'another-user',
        },
      };
      const req = {} as any;

      mockPrismaService.recordShare.findUnique.mockResolvedValue(mockShare);

      // Act & Assert
      await expect(service.revokeShare(shareId, userId, req)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getAuditTrail', () => {
    it('should return the audit trail for a record', async () => {
      // Arrange
      const recordId = 'record-123';
      const mockAuditTrail = [
        {
          id: 'audit-1',
          recordId,
          action: AuditAction.VIEW,
          timestamp: new Date(),
        },
      ];

      mockAuditService.getAuditTrail.mockResolvedValue(mockAuditTrail);

      // Act
      const result = await service.getAuditTrail(recordId);

      // Assert
      expect(result).toEqual(mockAuditTrail);
      expect(mockAuditService.getAuditTrail).toHaveBeenCalledWith(recordId);
    });
  });
});

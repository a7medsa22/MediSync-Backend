import { Test, TestingModule } from '@nestjs/testing';
import { MedicalRecordsController } from './medical-records.controller';
import { MedicalRecordsService } from './medical-records.service';
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
import { UserRole } from '@prisma/client';

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

describe('MedicalRecordsController', () => {
  let controller: MedicalRecordsController;
  let service: MedicalRecordsService;

  // 模拟 MedicalRecordsService
  const mockMedicalRecordsService = {
    createRecord: jest.fn(),
    listRecords: jest.fn(),
    getRecord: jest.fn(),
    downloadRecord: jest.fn(),
    updateRecord: jest.fn(),
    deleteRecord: jest.fn(),
    shareRecord: jest.fn(),
    revokeShare: jest.fn(),
    getAuditTrail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MedicalRecordsController],
      providers: [
        {
          provide: MedicalRecordsService,
          useValue: mockMedicalRecordsService,
        },
      ],
    }).compile();

    controller = module.get<MedicalRecordsController>(MedicalRecordsController);
    service = module.get<MedicalRecordsService>(MedicalRecordsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a medical record', async () => {
      // Arrange
      const dto: CreateMedicalRecordDto = {
        patientId: 'patient-123',
        title: 'Blood Test Results',
        recordType: 'LAB_RESULT',
        description: 'Annual blood work',
      };
      const userId = 'user-123';
      const createdRecord = {
        id: 'record-123',
        ...dto,
        fileName: mockFile.originalname,
        uploadedBy: userId,
      };

      mockMedicalRecordsService.createRecord.mockResolvedValue(createdRecord);

      // Act
      const result = await controller.create(dto, mockFile, userId);

      // Assert
      expect(result).toEqual(createdRecord);
      expect(service.createRecord).toHaveBeenCalledWith(dto, mockFile, userId);
    });

    it('should throw BadRequestException for invalid file', async () => {
      // Arrange
      const invalidFile = { ...mockFile, mimetype: 'application/exe' };
      const dto: CreateMedicalRecordDto = {
        patientId: 'patient-123',
        title: 'Test',
        recordType: 'LAB_RESULT',
      };
      const userId = 'user-123';

      mockMedicalRecordsService.createRecord.mockRejectedValue(
        new BadRequestException('Unsupported file type'),
      );

      // Act & Assert
      await expect(controller.create(dto, invalidFile, userId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('list', () => {
    it('should return a paginated list of medical records', async () => {
      // Arrange
      const query: QueryRecordsDto = {
        patientId: 'patient-123',
        page: 1,
        limit: 10,
      };
      const mockResponse = {
        data: [
          {
            id: 'record-1',
            title: 'Test Record',
            patient: { userId: 'patient-123' },
            doctor: { user: { firstName: 'John', lastName: 'Doe' } },
          },
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      };

      mockMedicalRecordsService.listRecords.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.list(query);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(service.listRecords).toHaveBeenCalledWith(query);
    });
  });

  describe('get', () => {
    it('should return a single medical record', async () => {
      // Arrange
      const recordId = 'record-123';
      const userId = 'user-123';
      const mockRecord = {
        id: recordId,
        title: 'Test Record',
        uploadedBy: userId,
        patientId: 'patient-123',
      };
      const req = {} as any;

      mockMedicalRecordsService.getRecord.mockResolvedValue(mockRecord);

      // Act
      const result = await controller.get(recordId, userId, req);

      // Assert
      expect(result).toEqual(mockRecord);
      expect(service.getRecord).toHaveBeenCalledWith(recordId, userId, req);
    });

    it('should throw NotFoundException if record does not exist', async () => {
      // Arrange
      const recordId = 'non-existent-id';
      const userId = 'user-123';
      const req = {} as any;

      mockMedicalRecordsService.getRecord.mockRejectedValue(
        new NotFoundException('Record not found'),
      );

      // Act & Assert
      await expect(controller.get(recordId, userId, req)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user does not have access', async () => {
      // Arrange
      const recordId = 'record-123';
      const userId = 'unauthorized-user';
      const req = {} as any;

      mockMedicalRecordsService.getRecord.mockRejectedValue(
        new ForbiddenException('Access denied to this record'),
      );

      // Act & Assert
      await expect(controller.get(recordId, userId, req)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('download', () => {
    it('should download a medical record', async () => {
      // Arrange
      const recordId = 'record-123';
      const userId = 'user-123';
      const mockDownloadResult = {
        fileName: 'test-report.pdf',
        mimeType: 'application/pdf',
        fileBuffer: Buffer.from('test file content'),
      };
      const req = {} as any;

      mockMedicalRecordsService.downloadRecord.mockResolvedValue(
        mockDownloadResult,
      );

      // Act
      const result = await controller.download(recordId, userId, req);

      // Assert
      expect(result).toEqual(mockDownloadResult);
      expect(service.downloadRecord).toHaveBeenCalledWith(
        recordId,
        userId,
        req,
      );
    });

    it('should throw ForbiddenException if user does not have download permission', async () => {
      // Arrange
      const recordId = 'record-123';
      const userId = 'unauthorized-user';
      const req = {} as any;

      mockMedicalRecordsService.downloadRecord.mockRejectedValue(
        new ForbiddenException('Download permission restricted for this share'),
      );

      // Act & Assert
      await expect(controller.download(recordId, userId, req)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('should update a medical record', async () => {
      // Arrange
      const recordId = 'record-123';
      const userId = 'user-123';
      const dto: UpdateMedicalRecordDto = {
        title: 'Updated Title',
        description: 'Updated description',
      };
      const updatedRecord = {
        id: recordId,
        ...dto,
      };
      const req = {} as any;

      mockMedicalRecordsService.updateRecord.mockResolvedValue(updatedRecord);

      // Act
      const result = await controller.update(recordId, dto, userId, req);

      // Assert
      expect(result).toEqual(updatedRecord);
      expect(service.updateRecord).toHaveBeenCalledWith(
        recordId,
        dto,
        userId,
        req,
      );
    });

    it('should throw ForbiddenException if user is not the uploader', async () => {
      // Arrange
      const recordId = 'record-123';
      const userId = 'unauthorized-user';
      const dto: UpdateMedicalRecordDto = {
        title: 'Updated Title',
      };
      const req = {} as any;

      mockMedicalRecordsService.updateRecord.mockRejectedValue(
        new ForbiddenException('Only the uploader can edit this record'),
      );

      // Act & Assert
      await expect(
        controller.update(recordId, dto, userId, req),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('should delete a medical record', async () => {
      // Arrange
      const recordId = 'record-123';
      const userId = 'user-123';
      const req = {} as any;

      mockMedicalRecordsService.deleteRecord.mockResolvedValue(undefined);

      // Act
      await controller.delete(recordId, userId, req);

      // Assert
      expect(service.deleteRecord).toHaveBeenCalledWith(recordId, userId, req);
    });

    it('should throw ForbiddenException if user is not the uploader', async () => {
      // Arrange
      const recordId = 'record-123';
      const userId = 'unauthorized-user';
      const req = {} as any;

      mockMedicalRecordsService.deleteRecord.mockRejectedValue(
        new ForbiddenException('Only the uploader can delete this record'),
      );

      // Act & Assert
      await expect(controller.delete(recordId, userId, req)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('share', () => {
    it('should share a medical record with another user', async () => {
      // Arrange
      const recordId = 'record-123';
      const userId = 'user-123';
      const dto: ShareRecordDto = {
        sharedWithUserId: 'shared-user-123',
        expiresAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      };
      const mockShare = {
        id: 'share-123',
        ...dto,
        recordId,
        sharedBy: userId,
      };
      const req = {} as any;

      mockMedicalRecordsService.shareRecord.mockResolvedValue(mockShare);

      // Act
      const result = await controller.share(recordId, dto, userId, req);

      // Assert
      expect(result).toEqual(mockShare);
      expect(service.shareRecord).toHaveBeenCalledWith(
        recordId,
        dto,
        userId,
        req,
      );
    });

    it('should throw ForbiddenException if user is not the patient or uploader', async () => {
      // Arrange
      const recordId = 'record-123';
      const userId = 'unauthorized-user';
      const dto: ShareRecordDto = {
        sharedWithUserId: 'shared-user-123',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
      const req = {} as any;

      mockMedicalRecordsService.shareRecord.mockRejectedValue(
        new ForbiddenException(
          'Only the patient or uploader can share this record',
        ),
      );

      // Act & Assert
      await expect(
        controller.share(recordId, dto, userId, req),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('revokeShare', () => {
    it('should revoke a share', async () => {
      // Arrange
      const shareId = 'share-123';
      const userId = 'user-123';
      const req = {} as any;

      mockMedicalRecordsService.revokeShare.mockResolvedValue(undefined);

      // Act
      await controller.revokeShare(shareId, userId, req);

      // Assert
      expect(service.revokeShare).toHaveBeenCalledWith(shareId, userId, req);
    });

    it('should throw ForbiddenException if user is not the record owner', async () => {
      // Arrange
      const shareId = 'share-123';
      const userId = 'unauthorized-user';
      const req = {} as any;

      mockMedicalRecordsService.revokeShare.mockRejectedValue(
        new ForbiddenException('Only the record owner can revoke shares'),
      );

      // Act & Assert
      await expect(
        controller.revokeShare(shareId, userId, req),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('auditTrail', () => {
    it('should return the audit trail for a record', async () => {
      // Arrange
      const recordId = 'record-123';
      const mockAuditTrail = [
        {
          id: 'audit-1',
          recordId,
          action: 'VIEW',
          timestamp: new Date(),
        },
      ];

      mockMedicalRecordsService.getAuditTrail.mockResolvedValue(mockAuditTrail);

      // Act
      const result = await controller.auditTrail(recordId);

      // Assert
      expect(result).toEqual(mockAuditTrail);
      expect(service.getAuditTrail).toHaveBeenCalledWith(recordId);
    });
  });
});

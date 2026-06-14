import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { QrProvider } from './qr.provider';
import { NotificationsService } from 'src/notifications/notifications.service';
import { QrService } from './qr.service';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
// eslint-disable-next-line import/order
import { QrTokenType } from './dto/generate-qr.dto';
// eslint-disable-next-line import/order
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('QrService', () => {
  let service: QrService;
  let prisma: PrismaService;
  let qrProvider: QrProvider;

  const mockPrismaService = {
    doctor: { findUnique: jest.fn() },
    patient: { findUnique: jest.fn() },
    qrToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    doctorPatientConnection: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('MDS'),
  };

  const mockQrProvider = {
    generateToken: jest.fn(),
    generateQrCodeImage: jest.fn(),
    verifyTokenFormat: jest.fn(),
    verifyTokenSignature: jest.fn(),
  };

  const mockNotificationsService = {
    notifyDoctorNewConnection: jest.fn(),
    notifyPatientConnectionSuccess: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QrService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: QrProvider, useValue: mockQrProvider },
        { provide: NotificationsService, useValue: mockNotificationsService },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn(), on: jest.fn(), off: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<QrService>(QrService);
    prisma = module.get<PrismaService>(PrismaService);
    qrProvider = module.get<QrProvider>(QrProvider);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateConnectionQr', () => {
    const doctorId = 'doc-1';
    const dto = { expiryMinutes: 10, type: QrTokenType.CONNECTION };

    it('should generate a QR token successfully', async () => {
      const doctor = {
        id: doctorId,
        user: { firstName: 'John', lastName: 'Doe', status: 'ACTIVE' },
        specialization: { name: 'Cardiology' },
      };
      mockPrismaService.doctor.findUnique.mockResolvedValue(doctor);
      mockQrProvider.generateToken.mockReturnValue('token-123');
      mockQrProvider.generateQrCodeImage.mockResolvedValue('base64-img');
      mockPrismaService.qrToken.create.mockResolvedValue({
        id: 'token-id',
        token: 'token-123',
        type: QrTokenType.CONNECTION,
        expiresAt: new Date(Date.now() + 10 * 60000),
        createdAt: new Date(),
        isUsed: false,
      });

      const result = await service.generateConnectionQr(doctorId, dto);

      expect(result.token).toBe('token-123');
      expect((result.doctor as any)?.name).toBe('John Doe');
      expect(mockPrismaService.qrToken.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException if doctor not found', async () => {
      mockPrismaService.doctor.findUnique.mockResolvedValue(null);
      await expect(service.generateConnectionQr(doctorId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if doctor is not active', async () => {
      mockPrismaService.doctor.findUnique.mockResolvedValue({
        user: { status: 'INACTIVE' },
      });
      await expect(service.generateConnectionQr(doctorId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateToken', () => {
    const token = 'MDS_doc1_random';

    it('should validate a valid token', async () => {
      mockQrProvider.verifyTokenFormat.mockReturnValue(true);
      const qrToken = {
        id: '1',
        token,
        doctorId: 'doc-1',
        isUsed: false,
        expiresAt: new Date(Date.now() + 10000),
      };
      mockPrismaService.qrToken.findUnique.mockResolvedValue(qrToken);
      mockQrProvider.verifyTokenSignature.mockReturnValue(true);

      const result = await service.validateToken(token);

      expect(result).toEqual(qrToken);
    });

    it('should throw BadRequestException if format is invalid', async () => {
      mockQrProvider.verifyTokenFormat.mockReturnValue(false);
      await expect(service.validateToken(token)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if token not in DB', async () => {
      mockQrProvider.verifyTokenFormat.mockReturnValue(true);
      mockPrismaService.qrToken.findUnique.mockResolvedValue(null);
      await expect(service.validateToken(token)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if token already used', async () => {
      mockQrProvider.verifyTokenFormat.mockReturnValue(true);
      mockPrismaService.qrToken.findUnique.mockResolvedValue({ isUsed: true });
      await expect(service.validateToken(token)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if token expired', async () => {
      mockQrProvider.verifyTokenFormat.mockReturnValue(true);
      mockPrismaService.qrToken.findUnique.mockResolvedValue({
        isUsed: false,
        expiresAt: new Date(Date.now() - 10000),
      });
      await expect(service.validateToken(token)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw UnauthorizedException if signature invalid', async () => {
      mockQrProvider.verifyTokenFormat.mockReturnValue(true);
      mockPrismaService.qrToken.findUnique.mockResolvedValue({
        isUsed: false,
        expiresAt: new Date(Date.now() + 10000),
        doctorId: 'doc-1',
      });
      mockQrProvider.verifyTokenSignature.mockReturnValue(false);
      await expect(service.validateToken(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('scanAndConnect', () => {
    const patientId = 'pat-1';
    const scanDto = { token: 'token-123' };

    it('should create a connection successfully', async () => {
      const qrToken = {
        id: 'tid',
        doctorId: 'doc-1',
        type: QrTokenType.CONNECTION,
        isUsed: false,
        expiresAt: new Date(Date.now() + 10000),
      };
      const patient = {
        id: patientId,
        userId: 'u-pat',
        user: {
          firstName: 'Pat',
          lastName: 'Ient',
          status: 'ACTIVE',
          email: 'p@p.com',
        },
      };
      const doctor = {
        id: 'doc-1',
        userId: 'u-doc',
        user: {
          firstName: 'Doc',
          lastName: 'Tor',
          status: 'ACTIVE',
          email: 'd@d.com',
        },
        specialization: { name: 'GP' },
      };

      jest.spyOn(service, 'validateToken').mockResolvedValue(qrToken as any);
      mockPrismaService.patient.findUnique.mockResolvedValue(patient);
      mockPrismaService.doctor.findUnique.mockResolvedValue(doctor);
      mockPrismaService.doctorPatientConnection.findUnique.mockResolvedValue(
        null,
      );
      mockPrismaService.doctorPatientConnection.create.mockResolvedValue({
        id: 'conn-1',
        status: 'ACTIVE',
        connectedAt: new Date(),
      });

      const result = await service.scanAndConnect(patientId, scanDto);

      expect(result.connectionId).toBe('conn-1');

      // Implementation emits notification.trigger events via EventEmitter2
      expect((service as any).eventEmitter.emit).toHaveBeenCalledWith(
        'notification.trigger',
        expect.objectContaining({ type: expect.any(String) }),
      );

      expect(mockPrismaService.qrToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isUsed: true }),
        }),
      );
    });
  });
});

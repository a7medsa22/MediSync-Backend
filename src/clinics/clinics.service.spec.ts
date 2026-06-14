import { Test, TestingModule } from '@nestjs/testing';
import { ClinicsService } from './clinics.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/common/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { VerificationStatus, NotificationType } from '@prisma/client';

describe('ClinicsService', () => {
  let service: ClinicsService;
  let prisma: {
    clinic: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    user: { findMany: jest.Mock };
    doctor: { findUnique: jest.Mock };
    clinicInsurance: { create: jest.Mock; delete: jest.Mock };
  };
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    delPattern: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock; on: jest.Mock; off: jest.Mock };

  beforeEach(async () => {
    prisma = {
      clinic: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
      },
      doctor: {
        findUnique: jest.fn(),
      },
      clinicInsurance: {
        create: jest.fn(),
        delete: jest.fn(),
      },
    };

    redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      delPattern: jest.fn(),
    };

    eventEmitter = {
      emit: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClinicsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        {
          provide: EventEmitter2,
          useValue: eventEmitter,
        },
      ],
    }).compile();

    service = module.get<ClinicsService>(ClinicsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createClinic', () => {
    const userId = 'user-1';
    const doctorId = 'doc-1';
    const dto = {
      name: 'Clinic A',
      address: '123 Main St',
      city: 'Cairo',
      governorate: 'Giza',
      phone: '0123456789',
      email: 'clinic@test.com',
      licenseNumber: 'LIC-001',
      licenseDoc: 'url',
      consultationFee: 100,
    };

    it('should create a clinic successfully', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: doctorId, userId });
      prisma.clinic.findFirst.mockResolvedValue(null);
      prisma.clinic.create.mockResolvedValue({
        id: 'clinic-1',
        ...dto,
        doctorId,
        verificationStatus: VerificationStatus.PENDING,
      });
      prisma.user.findMany.mockResolvedValue([]);

      const result = await service.createClinic(userId, dto);

      expect(result.id).toBe('clinic-1');
      expect(prisma.clinic.create).toHaveBeenCalledWith({
        data: {
          ...dto,
          doctorId,
          verificationStatus: VerificationStatus.PENDING,
        },
      });
    });

    it('should throw NotFoundException if doctor not found', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);

      await expect(service.createClinic(userId, dto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.createClinic(userId, dto)).rejects.toThrow(
        'Doctor not found',
      );
    });

    it('should throw BadRequestException if clinic name already exists for doctor', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: doctorId, userId });
      prisma.clinic.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.createClinic(userId, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createClinic(userId, dto)).rejects.toThrow(
        'Clinic with this name already registered by you.',
      );
    });
  });

  describe('getClinic', () => {
    it('should return cached clinic if available', async () => {
      const cachedClinic = { id: 'clinic-1', name: 'Cached Clinic' };
      redis.get.mockResolvedValue(cachedClinic);

      const result = await service.getClinic('clinic-1');

      expect(result).toEqual(cachedClinic);
      expect(redis.get).toHaveBeenCalledWith('clinic:details:clinic-1');
    });

    it('should fetch from DB and cache if not cached', async () => {
      redis.get.mockResolvedValue(null);
      const clinic = {
        id: 'clinic-1',
        name: 'DB Clinic',
        insurances: [],
        doctor: { firstName: 'Dr', lastName: 'Test' },
      };
      prisma.clinic.findUnique.mockResolvedValue(clinic);

      const result = await service.getClinic('clinic-1');

      expect(result).toEqual(clinic);
      expect(prisma.clinic.findUnique).toHaveBeenCalled();
      expect(redis.set).toHaveBeenCalled();
    });

    it('should throw NotFoundException if clinic not found', async () => {
      redis.get.mockResolvedValue(null);
      prisma.clinic.findUnique.mockResolvedValue(null);

      await expect(service.getClinic('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateClinic', () => {
    it('should throw NotFoundException if clinic not found', async () => {
      prisma.clinic.findUnique.mockResolvedValue(null);

      await expect(
        service.updateClinic('nonexistent', 'user-1', false, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not admin and not owner', async () => {
      prisma.doctor.findUnique.mockResolvedValue(null);
      prisma.clinic.findUnique.mockResolvedValue({
        id: 'clinic-1',
        doctorId: 'other-doc',
        verificationStatus: VerificationStatus.VERIFIED,
      });

      await expect(
        service.updateClinic('clinic-1', 'user-1', false, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if clinic not verified', async () => {
      prisma.doctor.findUnique.mockResolvedValue({
        id: 'doc-1',
        userId: 'user-1',
      });
      prisma.clinic.findUnique.mockResolvedValue({
        id: 'clinic-1',
        doctorId: 'doc-1',
        verificationStatus: VerificationStatus.PENDING,
      });

      await expect(
        service.updateClinic('clinic-1', 'user-1', false, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update clinic for admin', async () => {
      prisma.clinic.findUnique.mockResolvedValue({
        id: 'clinic-1',
        doctorId: 'doc-1',
        verificationStatus: VerificationStatus.VERIFIED,
      });
      prisma.clinic.update.mockResolvedValue({
        id: 'clinic-1',
        name: 'Updated',
      });

      const result = await service.updateClinic('clinic-1', 'admin', true, {
        name: 'Updated',
      });

      expect(result.name).toBe('Updated');
    });
  });

  describe('verifyClinic', () => {
    it('should throw NotFoundException if clinic not found', async () => {
      prisma.clinic.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyClinic('nonexistent', 'admin-1', {
          status: VerificationStatus.VERIFIED,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if clinic already processed', async () => {
      prisma.clinic.findUnique.mockResolvedValue({
        id: 'clinic-1',
        verificationStatus: VerificationStatus.VERIFIED,
      });

      await expect(
        service.verifyClinic('clinic-1', 'admin-1', {
          status: VerificationStatus.VERIFIED,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should verify clinic and emit notification', async () => {
      prisma.clinic.findUnique.mockResolvedValue({
        id: 'clinic-1',
        doctorId: 'doc-1',
        verificationStatus: VerificationStatus.PENDING,
      });
      prisma.clinic.update.mockResolvedValue({
        id: 'clinic-1',
        verificationStatus: VerificationStatus.VERIFIED,
      });

      await service.verifyClinic('clinic-1', 'admin-1', {
        status: VerificationStatus.VERIFIED,
      });

      expect(prisma.clinic.update).toHaveBeenCalledWith({
        where: { id: 'clinic-1' },
        data: expect.objectContaining({
          verificationStatus: VerificationStatus.VERIFIED,
          verifiedBy: 'admin-1',
        }),
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'notification.trigger',
        expect.objectContaining({
          userId: 'doc-1',
          type: NotificationType.CLINIC_VERIFIED,
        }),
      );
    });

    it('should reject clinic and set rejection reason', async () => {
      prisma.clinic.findUnique.mockResolvedValue({
        id: 'clinic-1',
        doctorId: 'doc-1',
        verificationStatus: VerificationStatus.PENDING,
      });
      prisma.clinic.update.mockResolvedValue({
        id: 'clinic-1',
        verificationStatus: VerificationStatus.REJECTED,
        rejectionReason: 'Invalid docs',
      });

      await service.verifyClinic('clinic-1', 'admin-1', {
        status: VerificationStatus.REJECTED,
        rejectionReason: 'Invalid docs',
      });

      expect(prisma.clinic.update).toHaveBeenCalledWith({
        where: { id: 'clinic-1' },
        data: expect.objectContaining({
          verificationStatus: VerificationStatus.REJECTED,
          rejectionReason: 'Invalid docs',
        }),
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'notification.trigger',
        expect.objectContaining({
          type: NotificationType.CLINIC_REJECTED,
        }),
      );
    });
  });

  describe('searchClinics', () => {
    it('should return cached results if available', async () => {
      const cached = { total: 1, clinics: [] };
      redis.get.mockResolvedValue(cached);

      const result = await service.searchClinics({});

      expect(result).toEqual(cached);
    });

    it('should search clinics with filters', async () => {
      redis.get.mockResolvedValue(null);
      prisma.clinic.findMany.mockResolvedValue([]);

      await service.searchClinics({ city: 'Cairo', governorate: 'Giza' });

      expect(prisma.clinic.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            city: 'Cairo',
            governorate: 'Giza',
            verificationStatus: VerificationStatus.VERIFIED,
          }),
        }),
      );
    });
  });

  describe('addInsurance', () => {
    it('should add insurance to clinic', async () => {
      prisma.clinicInsurance.create.mockResolvedValue({
        clinicId: 'clinic-1',
        insuranceId: 'ins-1',
        isVerified: true,
      });

      const result = await service.addInsurance('clinic-1', 'ins-1');

      expect(result.insuranceId).toBe('ins-1');
      expect(prisma.clinicInsurance.create).toHaveBeenCalled();
    });
  });

  describe('removeInsurance', () => {
    it('should remove insurance from clinic', async () => {
      prisma.clinicInsurance.delete.mockResolvedValue({});

      await service.removeInsurance('clinic-1', 'ins-1');

      expect(prisma.clinicInsurance.delete).toHaveBeenCalledWith({
        where: {
          clinicId_insuranceId: { clinicId: 'clinic-1', insuranceId: 'ins-1' },
        },
      });
    });
  });
});

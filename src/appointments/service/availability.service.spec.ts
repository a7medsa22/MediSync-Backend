import { Test, TestingModule } from '@nestjs/testing';
import { AvailabilityService } from './availability.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { AvailabilityValidationHelpers } from './availability-validation.helpers';
import {
  CreateAvailabilityDto,
  CreateMultipleAvailabilitiesDto,
} from '../dto/availability.dto';
import { DayOfWeek } from '@prisma/client';

describe('AvailabilityService', () => {
  let service: AvailabilityService;

  const prismaMock = {
    doctorAvailability: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    doctorBreak: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    doctorDayOff: {
      create: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
  };

  const validationHelpersMock = {
    validateNoAvailabilityOverlap: jest.fn(),
    validateNoDuplicateAvailability: jest.fn(),
    validateDoctorOwnership: jest.fn(),
    validateNoBreakOverlap: jest.fn(),
    validateBreakWithinAvailability: jest.fn(),
    validateDayOffDate: jest.fn(),
    validateNoDuplicateDayOff: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: AvailabilityValidationHelpers,
          useValue: validationHelpersMock,
        },
      ],
    }).compile();

    service = module.get<AvailabilityService>(AvailabilityService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createAvailability', () => {
    it('creates availability after validations', async () => {
      const doctorId = 'doc_1';
      const createDto: CreateAvailabilityDto = {
        dayOfWeek: DayOfWeek.MONDAY,
        startTime: 9 * 60,
        endTime: 17 * 60,
        slotDuration: 30,
        maxAppointmentsPerDay: 10,
      };

      prismaMock.doctorAvailability.create.mockResolvedValue({
        id: 'avail_1',
        doctorId,
        dayOfWeek: createDto.dayOfWeek,
        startTime: createDto.startTime,
        endTime: createDto.endTime,
        slotDuration: createDto.slotDuration,
        maxAppointmentsPerDay: createDto.maxAppointmentsPerDay,
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.createAvailability(doctorId, createDto);

      expect(
        validationHelpersMock.validateNoAvailabilityOverlap,
      ).toHaveBeenCalled();
      expect(
        validationHelpersMock.validateNoDuplicateAvailability,
      ).toHaveBeenCalled();
      expect(prismaMock.doctorAvailability.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          doctorId,
          dayOfWeek: createDto.dayOfWeek,
          startTime: createDto.startTime,
          endTime: createDto.endTime,
          slotDuration: createDto.slotDuration,
          maxAppointmentsPerDay: createDto.maxAppointmentsPerDay,
          isActive: true,
        }),
      });

      expect(result).toEqual(
        expect.objectContaining({
          id: 'avail_1',
          dayOfWeek: createDto.dayOfWeek,
          slotDuration: createDto.slotDuration,
          maxAppointmentsPerDay: createDto.maxAppointmentsPerDay,
          message: 'Availability created successfully',
        }),
      );
    });
  });

  describe('createMultipleAvailabilities', () => {
    it('returns partial success and collects errors when some creates fail', async () => {
      const doctorId = 'doc_1';

      const createDto: CreateMultipleAvailabilitiesDto = {
        availabilities: [
          {
            dayOfWeek: DayOfWeek.MONDAY,
            startTime: 9 * 60,
            endTime: 10 * 60,
            slotDuration: 30,
            maxAppointmentsPerDay: 10,
          },
          {
            dayOfWeek: DayOfWeek.TUESDAY,
            startTime: 9 * 60,
            endTime: 10 * 60,
            slotDuration: 30,
            maxAppointmentsPerDay: 10,
          },
        ],
      };

      prismaMock.doctorAvailability.create
        .mockResolvedValueOnce({
          id: 'avail_1',
          doctorId,
          dayOfWeek: createDto.availabilities[0].dayOfWeek,
          startTime: createDto.availabilities[0].startTime,
          endTime: createDto.availabilities[0].endTime,
          slotDuration: createDto.availabilities[0].slotDuration,
          maxAppointmentsPerDay:
            createDto.availabilities[0].maxAppointmentsPerDay,
          isActive: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        })
        .mockRejectedValueOnce(
          new Error('Overlapping availability already exists'),
        );

      const result = await service.createMultipleAvailabilities(
        doctorId,
        createDto,
      );

      expect(result.created).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]).toEqual(
        expect.objectContaining({
          dayOfWeek: DayOfWeek.TUESDAY,
          error: 'Overlapping availability already exists',
        }),
      );
    });
  });

  describe('getAvailabilities', () => {
    it('throws NotFoundException when none exist', async () => {
      prismaMock.doctorAvailability.findMany.mockResolvedValue([]);

      await expect(service.getAvailabilities('doc_1')).rejects.toThrow(
        'Doctor has no availabilities set',
      );
    });

    it('maps availabilities to API shape', async () => {
      prismaMock.doctorAvailability.findMany.mockResolvedValue([
        {
          id: 'avail_1',
          doctorId: 'doc_1',
          dayOfWeek: DayOfWeek.MONDAY,
          startTime: 9 * 60,
          endTime: 17 * 60,
          slotDuration: 30,
          maxAppointmentsPerDay: 10,
          isActive: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const result = await service.getAvailabilities('doc_1');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 'avail_1',
          dayOfWeek: DayOfWeek.MONDAY,
          slotDuration: 30,
          maxAppointmentsPerDay: 10,
          isActive: true,
        }),
      );
      expect(result[0].startTime).toEqual(expect.any(String));
      expect(result[0].endTime).toEqual(expect.any(String));
    });
  });
});

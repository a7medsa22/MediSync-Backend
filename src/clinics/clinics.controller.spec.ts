import { Test, TestingModule } from '@nestjs/testing';
import { ClinicsController } from './clinics.controller';
import { ClinicsService } from './clinics.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/common/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('ClinicsController', () => {
  let controller: ClinicsController;
  let service: ClinicsService;

  const mockService = {
    createClinic: jest.fn(),
    searchClinics: jest.fn(),
    getClinic: jest.fn(),
    updateClinic: jest.fn(),
    verifyClinic: jest.fn(),
    addInsurance: jest.fn(),
    removeInsurance: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClinicsController],
      providers: [
        { provide: ClinicsService, useValue: mockService },
        { provide: PrismaService, useValue: {} },
        { provide: RedisService, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    controller = module.get<ClinicsController>(ClinicsController);
    service = module.get<ClinicsService>(ClinicsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call createClinic with correct params', async () => {
    mockService.createClinic.mockResolvedValue({
      id: 'clinic-1',
      name: 'Test Clinic',
    });

    const result = await controller.createClinic('doc-1', {
      name: 'Test',
      address: 'Addr',
      city: 'Cairo',
      governorate: 'Giza',
      phone: '123',
      email: 'test@test.com',
      licenseNumber: 'LIC',
      licenseDoc: 'url',
      consultationFee: 100,
    });

    expect(result.id).toBe('clinic-1');
    expect(service.createClinic).toHaveBeenCalledWith(
      'doc-1',
      expect.any(Object),
    );
  });
});

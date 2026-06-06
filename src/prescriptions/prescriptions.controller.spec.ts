import { Test, TestingModule } from '@nestjs/testing';
import { PrescriptionsController } from './prescriptions.controller';
import { PrescriptionsService } from './services/prescriptions.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { PrescriptionRenewalService } from './services/prescription-renewal.service';
import { PrescriptionPdfService } from './services/prescription-pdf.service';
import { PrescriptionTemplateService } from './services/prescriptions.tempalet.service';

describe('PrescriptionsController', () => {
  let controller: PrescriptionsController;

  const mockPrescriptionsService = {
    createPrescription: jest.fn(),
    updatePrescription: jest.fn(),
    deletePrescription: jest.fn(),
    getPrescription: jest.fn(),
    getUserPrescriptions: jest.fn(),
  };

  const mockPrescriptionRenewalService = {
    requestRenewal: jest.fn(),
    approveRenewal: jest.fn(),
    rejectRenewal: jest.fn(),
  };

  const mockPrescriptionPdfService = {
    generatePrescriptionPdf: jest.fn(),
  };

  const mockPrescriptionTemplateService = {
    createTemplate: jest.fn(),
    getTemplates: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PrescriptionsController],
      providers: [
        {
          provide: PrescriptionsService,
          useValue: mockPrescriptionsService,
        },
        {
          provide: PrescriptionRenewalService,
          useValue: mockPrescriptionRenewalService,
        },
        {
          provide: PrescriptionPdfService,
          useValue: mockPrescriptionPdfService,
        },
        {
          provide: PrescriptionTemplateService,
          useValue: mockPrescriptionTemplateService,
        },
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<PrescriptionsController>(PrescriptionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

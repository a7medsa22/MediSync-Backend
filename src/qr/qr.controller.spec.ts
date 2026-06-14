import { Test, TestingModule } from '@nestjs/testing';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';
import { QrTokenType } from './dto/generate-qr.dto';

describe('QrController', () => {
  let controller: QrController;
  let service: QrService;

  const mockQrService = {
    generateConnectionQrForDoctor: jest.fn(),
    scanAndConnectForPatient: jest.fn(),
    getActiveTokens: jest.fn(),
    invalidateToken: jest.fn(),
  };

  const mockUser = {
    id: 'user-1',
    doctorId: 'doc-1',
    patientId: 'pat-1',
    role: 'DOCTOR',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QrController],
      providers: [
        {
          provide: QrService,
          useValue: mockQrService,
        },
      ],
    }).compile();

    controller = module.get<QrController>(QrController);
    service = module.get<QrService>(QrService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('generateQr', () => {
    it('should call service.generateConnectionQrForDoctor', async () => {
      const dto = { expiryMinutes: 5, type: QrTokenType.CONNECTION };
      mockQrService.generateConnectionQrForDoctor.mockResolvedValue({
        id: '1',
      });

      const result = await controller.generateQr(mockUser as any, dto);

      expect(result).toEqual({ id: '1' });
      expect(mockQrService.generateConnectionQrForDoctor).toHaveBeenCalledWith(
        mockUser,
        dto,
      );
    });
  });

  describe('scanQr', () => {
    it('should call service.scanAndConnectForPatient', async () => {
      const dto = { token: 'token-123' };
      mockQrService.scanAndConnectForPatient.mockResolvedValue({
        connectionId: 'c1',
      });

      const result = await controller.scanQr(mockUser as any, dto);

      expect(result.connectionId).toBe('c1');
      expect(mockQrService.scanAndConnectForPatient).toHaveBeenCalledWith(
        mockUser,
        dto,
      );
    });
  });

  describe('getActiveTokens', () => {
    it('should call service.getActiveTokens', async () => {
      mockQrService.getActiveTokens.mockResolvedValue([]);
      await controller.getActiveTokens(mockUser.doctorId);
      expect(mockQrService.getActiveTokens).toHaveBeenCalledWith(
        mockUser.doctorId,
      );
    });
  });

  describe('invalidateToken', () => {
    it('should call service.invalidateToken', async () => {
      const tokenId = 't1';
      mockQrService.invalidateToken.mockResolvedValue({ success: true });
      await controller.invalidateToken(mockUser.doctorId, tokenId);
      expect(mockQrService.invalidateToken).toHaveBeenCalledWith(
        mockUser.doctorId,
        tokenId,
      );
    });
  });
});

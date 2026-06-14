import { Test, TestingModule } from '@nestjs/testing';
import { SpecializationsController } from './specializations.controller';
import { SpecializationsService } from './specializations.service';

describe('SpecializationsController', () => {
  let controller: SpecializationsController;
  let service: SpecializationsService;

  const mockSpecializationsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getPopularSpecializations: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SpecializationsController],
      providers: [
        {
          provide: SpecializationsService,
          useValue: mockSpecializationsService,
        },
      ],
    }).compile();

    controller = module.get<SpecializationsController>(
      SpecializationsController,
    );
    service = module.get<SpecializationsService>(SpecializationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call service.create', async () => {
      const dto = {
        name: 'Cardiology',
        nameAr: 'أمراض القلب',
        description: 'Heart health',
      };
      mockSpecializationsService.create.mockResolvedValue({ id: '1', ...dto });

      const result = await controller.create(dto);

      expect(result.id).toBe('1');
      expect(mockSpecializationsService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('should call service.findAll', async () => {
      mockSpecializationsService.findAll.mockResolvedValue([]);
      await controller.findAll();
      expect(mockSpecializationsService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should call service.findOne', async () => {
      const id = 'uuid-v4';
      mockSpecializationsService.findOne.mockResolvedValue({ id });
      await controller.findOne(id);
      expect(mockSpecializationsService.findOne).toHaveBeenCalledWith(id);
    });
  });

  describe('update', () => {
    it('should call service.update', async () => {
      const id = 'uuid-v4';
      const dto = { name: 'New Name' };
      mockSpecializationsService.update.mockResolvedValue({ id, ...dto });

      const result = await controller.update(id, dto);

      expect(result.name).toBe('New Name');
      expect(mockSpecializationsService.update).toHaveBeenCalledWith(id, dto);
    });
  });

  describe('remove', () => {
    it('should call service.remove', async () => {
      const id = 'uuid-v4';
      mockSpecializationsService.remove.mockResolvedValue({ id });
      await controller.remove(id);
      expect(mockSpecializationsService.remove).toHaveBeenCalledWith(id);
    });
  });

  describe('getPopularSpecializations', () => {
    it('should call service.getPopularSpecializations with limit', async () => {
      const limit = 5;
      mockSpecializationsService.getPopularSpecializations.mockResolvedValue(
        [],
      );
      await controller.getPopularSpecializations(limit);
      expect(
        mockSpecializationsService.getPopularSpecializations,
      ).toHaveBeenCalledWith(limit);
    });
  });
});

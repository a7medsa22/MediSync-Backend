import { Test, TestingModule } from '@nestjs/testing';
import { SpecializationsService } from './specializations.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('SpecializationsService', () => {
  let service: SpecializationsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    specialization: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpecializationsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SpecializationsService>(SpecializationsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new specialization', async () => {
      const dto = {
        name: 'Cardiology',
        nameAr: 'أمراض القلب',
        description: 'Heart health',
      };
      mockPrismaService.specialization.findUnique.mockResolvedValue(null);
      mockPrismaService.specialization.create.mockResolvedValue({
        id: '1',
        ...dto,
      });

      const result = await service.create(dto);

      expect(result).toEqual({ id: '1', ...dto });
      expect(mockPrismaService.specialization.create).toHaveBeenCalledWith({
        data: dto,
      });
    });

    it('should throw ConflictException if specialization already exists', async () => {
      const dto = { name: 'Cardiology', nameAr: 'أمراض القلب' };
      mockPrismaService.specialization.findUnique.mockResolvedValue({
        id: '1',
      });

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return all specializations', async () => {
      const expected = [{ id: '1', name: 'Cardiology' }];
      mockPrismaService.specialization.findMany.mockResolvedValue(expected);

      const result = await service.findAll();

      expect(result).toEqual(expected);
      expect(mockPrismaService.specialization.findMany).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a specialization if found', async () => {
      const expected = { id: '1', name: 'Cardiology' };
      mockPrismaService.specialization.findUnique.mockResolvedValue(expected);

      const result = await service.findOne('1');

      expect(result).toEqual(expected);
    });

    it('should throw NotFoundException if specialization not found', async () => {
      mockPrismaService.specialization.findUnique.mockResolvedValue(null);

      await expect(service.findOne('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a specialization', async () => {
      const id = '1';
      const dto = { name: 'New Name' };
      const existing = { id, name: 'Old Name' };

      mockPrismaService.specialization.findUnique
        .mockResolvedValueOnce(existing) // For initial check
        .mockResolvedValueOnce(null); // For name conflict check

      mockPrismaService.specialization.update.mockResolvedValue({
        ...existing,
        ...dto,
      });

      const result = await service.update(id, dto);

      expect(result.name).toBe('New Name');
      expect(mockPrismaService.specialization.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException if specialization to update not found', async () => {
      mockPrismaService.specialization.findUnique.mockResolvedValue(null);

      await expect(service.update('1', { name: 'Name' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if updated name already exists', async () => {
      const id = '1';
      const dto = { name: 'Existing' };
      mockPrismaService.specialization.findUnique
        .mockResolvedValueOnce({ id, name: 'Old' })
        .mockResolvedValueOnce({ id: '2', name: 'Existing' });

      await expect(service.update(id, dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('should delete a specialization if it has no doctors', async () => {
      const id = '1';
      mockPrismaService.specialization.findUnique.mockResolvedValue({
        id,
        _count: { doctors: 0 },
      });
      mockPrismaService.specialization.delete.mockResolvedValue({ id });

      const result = await service.remove(id);

      expect(result).toEqual({ id });
      expect(mockPrismaService.specialization.delete).toHaveBeenCalledWith({
        where: { id },
      });
    });

    it('should throw ConflictException if specialization has doctors', async () => {
      const id = '1';
      mockPrismaService.specialization.findUnique.mockResolvedValue({
        id,
        _count: { doctors: 5 },
      });

      await expect(service.remove(id)).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if specialization to delete not found', async () => {
      mockPrismaService.specialization.findUnique.mockResolvedValue(null);

      await expect(service.remove('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPopularSpecializations', () => {
    it('should return popular specializations', async () => {
      const expected = [{ id: '1', name: 'Cardiology' }];
      mockPrismaService.specialization.findMany.mockResolvedValue(expected);

      const result = await service.getPopularSpecializations(5);

      expect(result).toEqual(expected);
      expect(mockPrismaService.specialization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
          orderBy: { doctors: { _count: 'desc' } },
        }),
      );
    });
  });
});

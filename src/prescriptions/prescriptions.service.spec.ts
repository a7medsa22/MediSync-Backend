import { Test, TestingModule } from '@nestjs/testing';
import { PrescriptionsService } from './services/prescriptions.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrescriptionCacheService } from 'src/common/cache/prescription-cache.service';
import { UserCacheService } from 'src/common/cache/user-cache.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

describe('PrescriptionsService', () => {
  let service: PrescriptionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrescriptionsService,
        { provide: PrismaService, useValue: {} },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn(), on: jest.fn(), off: jest.fn() },
        },
        { provide: PrescriptionCacheService, useValue: {} },
        { provide: UserCacheService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: HttpService, useValue: {} },
      ],
    }).compile();

    service = module.get<PrescriptionsService>(PrescriptionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

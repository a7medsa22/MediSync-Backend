import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { AppModule } from 'src/app.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { cleanDatabase } from './db-utils';
import { HttpExceptionFilter } from 'src/common/filters/http-exception.filter';
import { TransformInterceptor } from 'src/common/interceptors/transform.interceptor';
import { EmailService } from 'src/email/email.service';
import { ThrottlerGuard, ThrottlerStorage } from '@nestjs/throttler';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { RedisService } from 'src/common/redis/redis.service';

const mockThrottlerGuard = {
  canActivate: () => true,
};

const mockThrottlerStorage = {
  increment: jest.fn().mockResolvedValue({
    remaining: 100,
    total: 100,
    isBlocked: false,
    timeToNext: 0,
  }),
  get: jest.fn().mockResolvedValue(null),
  resetAll: jest.fn().mockResolvedValue(undefined),
  reset: jest.fn().mockResolvedValue(undefined),
};

const mockRedisService = {
  getClient: jest.fn().mockReturnValue({
    on: jest.fn(),
    ping: jest.fn().mockResolvedValue('PONG'),
    flushall: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    scan: jest.fn().mockResolvedValue(['0', []]),
    quit: jest.fn().mockResolvedValue('OK'),
  }),
  ping: jest.fn().mockResolvedValue('PONG'),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  delPattern: jest.fn().mockResolvedValue(undefined),
  exists: jest.fn().mockResolvedValue(true),
  scan: jest.fn().mockResolvedValue([]),
  flushall: jest.fn().mockResolvedValue(undefined),
};

export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
  moduleFixture: TestingModule;
}> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(EmailService)
    .useValue({
      sendEmailVerificationOtp: jest.fn().mockResolvedValue(true),
      sendPasswordResetOtp: jest.fn().mockResolvedValue(true),
      sendLoginOtpEmail: jest.fn().mockResolvedValue(true),
    })
    .overrideProvider(HttpService)
    .useValue({
      get: jest.fn().mockReturnValue(of({ data: { results: [] } })),
      post: jest.fn().mockReturnValue(of({ data: {} })),
    })
    .overrideProvider(ThrottlerStorage)
    .useValue(mockThrottlerStorage)
    .overrideProvider(ThrottlerGuard)
    .useValue(mockThrottlerGuard)
    .overrideProvider(RedisService)
    .useValue(mockRedisService)

    .compile();

  const app = moduleFixture.createNestApplication();

  app.useLogger(false);

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  await app.init();

  const prisma = app.get(PrismaService);
  await cleanDatabase(prisma);

  const redis = app.get(RedisService);
  await redis.getClient().flushall();

  return { app, prisma, moduleFixture };
}

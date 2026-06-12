process.env.NODE_ENV = 'test';

import { INestApplication } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from 'src/app.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { cleanDatabase } from '../helpers/db-utils';
import { seedPatient } from '../helpers/auth-helpers';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { HttpExceptionFilter } from 'src/common/filters/http-exception.filter';
import { TransformInterceptor } from 'src/common/interceptors/transform.interceptor';
import { EmailService } from 'src/email/email.service';
import { ThrottlerGuard, ThrottlerStorage } from '@nestjs/throttler';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { RedisService } from 'src/common/redis/redis.service';
import { NotificationType } from '@prisma/client';

const mockThrottlerGuard = {
  canActivate: () => true,
};

const mockThrottlerStorage = {
  increment: jest.fn().mockResolvedValue({ remaining: 100, total: 100, isBlocked: false, timeToNext: 0 }),
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
  exists: jest.fn().mockResolvedValue(true),
  scan: jest.fn().mockResolvedValue([]),
  flushall: jest.fn().mockResolvedValue(undefined),
};

const waitForEventProcessing = () => new Promise((resolve) => setTimeout(resolve, 300));

dotenv.config({ path: '.env.test' });

describe('Event-Driven Notification System (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;

  beforeAll(async () => {
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

    app = moduleFixture.createNestApplication();

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

    prisma = app.get(PrismaService);
    eventEmitter = app.get(EventEmitter2);

    await cleanDatabase(prisma);

    const redis = app.get(RedisService);
    await redis.getClient().flushall();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await prisma?.$disconnect();
  });

  describe('notification.trigger event', () => {
    it('should create a notification when NEW_PRESCRIPTION event is emitted', async () => {
      const user = await seedPatient(prisma);

      eventEmitter.emit('notification.trigger', {
        userId: user.id,
        type: 'NEW_PRESCRIPTION' as NotificationType,
        data: {
          prescriptionId: 'test-prescription-id-123',
          doctorName: 'Dr. John Doe',
          actionUrl: '/prescriptions/test-prescription-id-123',
        },
      });

      await waitForEventProcessing();

      const notifications = await prisma.notification.findMany({
        where: { userId: user.id, isRead: false },
      });

      expect(notifications.length).toBe(1);
      expect(notifications[0].userId).toBe(user.id);
      expect(notifications[0].type).toBe('NEW_PRESCRIPTION' as NotificationType);
      expect(notifications[0].title).toBe('Prescription Notification');
      expect(notifications[0].message).toContain('A new prescription has been added');
      expect(notifications[0].metadata).toEqual(
        expect.objectContaining({
          prescriptionId: 'test-prescription-id-123',
          actionUrl: '/prescriptions/test-prescription-id-123',
        }),
      );
    });

    it('should handle gracefully when userId does not exist', async () => {
      const nonExistentUserId = 'non-existent-user-id-12345';

      eventEmitter.emit('notification.trigger', {
        userId: nonExistentUserId,
        type: 'NEW_PRESCRIPTION' as NotificationType,
        data: {
          prescriptionId: 'test-prescription-id-456',
          doctorName: 'Dr. Jane Smith',
          actionUrl: '/prescriptions/test-prescription-id-456',
        },
      });

      await waitForEventProcessing();

      const notifications = await prisma.notification.findMany({
        where: { userId: nonExistentUserId },
      });

      expect(notifications.length).toBe(0);
    });

    it('should handle missing or incomplete data fields gracefully', async () => {
      const user = await seedPatient(prisma);

      eventEmitter.emit('notification.trigger', {
        userId: user.id,
        type: 'NEW_PRESCRIPTION' as NotificationType,
        data: {},
      });

      await waitForEventProcessing();

      const notifications = await prisma.notification.findMany({
        where: { userId: user.id },
      });

      expect(notifications.length).toBe(1);
      expect(notifications[0].type).toBe('NEW_PRESCRIPTION' as NotificationType);
      expect(notifications[0].title).toBeTruthy();
      expect(notifications[0].message).toBeTruthy();
    });
  });
});

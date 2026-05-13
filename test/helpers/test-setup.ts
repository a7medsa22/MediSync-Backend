import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { AppModule } from 'src/app.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { cleanDatabase } from './db-utils';
import { HttpExceptionFilter } from 'src/common/filters/http-exception.filter';
import { TransformInterceptor } from 'src/common/interceptors/transform.interceptor';
import { EmailService } from 'src/email/email.service';
import { ThrottlerGuard } from '@nestjs/throttler';

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
    .overrideProvider(require('src/notifications/notifications.service').NotificationsService)
    .useValue({
      createNotification: jest.fn().mockResolvedValue(true),
      getUserNotifications: jest.fn().mockResolvedValue({ notifications: [], nextCursor: null }),
      getUnreadCount: jest.fn().mockResolvedValue(0),
      markAsRead: jest.fn().mockResolvedValue(true),
      markAllAsRead: jest.fn().mockResolvedValue(true),
      deleteNotification: jest.fn().mockResolvedValue(true),
    })
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleFixture.createNestApplication();

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
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  await app.init();

  const prisma = app.get(PrismaService);
  await cleanDatabase(prisma);

  return { app, prisma, moduleFixture };
}

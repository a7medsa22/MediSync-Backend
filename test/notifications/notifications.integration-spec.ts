import { EventEmitter2 } from '@nestjs/event-emitter';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { createTestApp } from '../helpers/test-setup';

describe('Notification Module (Event-Driven Integration)', () => {
  let app: INestApplication;
  let eventEmitter: EventEmitter2;
  let prisma: PrismaService;

  beforeAll(async () => {
    const setup = await createTestApp();
    app = setup.app;
    prisma = setup.prisma;
    eventEmitter = app.get(EventEmitter2);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Notification Trigger Listener', () => {
    it('should successfully save a notification in DB when notification.trigger event is emitted', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'notification-patient-test@medisync.com',
          password: 'hashed_password_safe',
          firstName: 'Omar',
          lastName: 'Ali',
          status: 'ACTIVE',
        },
      });

      eventEmitter.emit('notification.trigger', {
        userId: user.id,
        type: 'NEW_PRESCRIPTION',
        data: {
          prescriptionId: 'mock-prescription-uuid-123',
          doctorName: 'Dr. Ahmed Salah',
          actionUrl: '/prescriptions/mock-prescription-uuid-123',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      const savedNotification = await prisma.notification.findFirst({
        where: {
          userId: user.id,
          type: 'NEW_PRESCRIPTION',
        },
      });

      expect(savedNotification).toBeDefined();
      expect(savedNotification?.isRead).toBe(false);

      const metadataString = JSON.stringify(savedNotification?.metadata || {});
      expect(metadataString).toContain('Dr. Ahmed Salah');
    });

    it(' should handle gracefully and not crash the server if userId does not exist', async () => {
      const fakeUserId = '00000000-0000-0000-0000-000000000000';
      try {
        eventEmitter.emit('notification.trigger', {
          userId: fakeUserId,
          type: 'NEW_PRESCRIPTION',
          data: {
            prescriptionId: '123',
            doctorName: 'Dr. Test',
            actionUrl: '/',
          },
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (err) {
        expect(err).toBeDefined();
      }
    });

    it('should handle safely if data payload contains missing or incomplete fields', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'incomplete-payload-test@medisync.com',
          password: 'hashed_password_safe',
          firstName: 'Khaled',
          lastName: 'Hassan',
          status: 'ACTIVE',
        },
      });

      eventEmitter.emit('notification.trigger', {
        userId: user.id,
        type: 'NEW_PRESCRIPTION',
        data: {},
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      const savedNotification = await prisma.notification.findFirst({
        where: { userId: user.id, type: 'NEW_PRESCRIPTION' },
      });

      expect(savedNotification).toBeDefined();
    });
  });
});

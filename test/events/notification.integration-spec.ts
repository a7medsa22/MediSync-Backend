process.env.NODE_ENV = 'test';

import { INestApplication } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from 'src/prisma/prisma.service';
import { seedPatient } from '../helpers/auth-helpers';
import { NotificationType } from '@prisma/client';
import { createTestApp } from '../helpers/test-setup';

const waitForEventProcessing = () =>
  new Promise((resolve) => setTimeout(resolve, 300));

dotenv.config({ path: '.env.test' });

describe('Event-Driven Notification System (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;

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
      expect(notifications[0].type).toBe(
        'NEW_PRESCRIPTION' as NotificationType,
      );
      expect(notifications[0].title).toBe('Prescription Notification');
      expect(notifications[0].message).toContain(
        'A new prescription has been added',
      );
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
      expect(notifications[0].type).toBe(
        'NEW_PRESCRIPTION' as NotificationType,
      );
      expect(notifications[0].title).toBeTruthy();
      expect(notifications[0].message).toBeTruthy();
    });
  });
});

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../helpers/test-setup';
import { PrismaService } from 'src/prisma/prisma.service';
import { seedPatient, loginAndGetToken } from '../helpers/auth-helpers';
import { NotificationType } from '@prisma/client';

describe('Notifications Flow (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let patient: any;
  let patientToken: string;

  beforeAll(async () => {
    const setup = await createTestApp();
    app = setup.app;
    prisma = setup.prisma;

    patient = await seedPatient(prisma);
    const login = await loginAndGetToken(app, patient.email, patient.rawPassword);
    patientToken = login.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Notification Management', () => {
    beforeEach(async () => {
      // Create some test notifications
      await prisma.notification.createMany({
        data: [
          {
            userId: patient.id,
            title: 'New Connection',
            message: 'You have a new connection request',
            type: NotificationType.CONNECTION_REQUEST,
            isRead: false,
          },
          {
            userId: patient.id,
            title: 'Appointment Booked',
            message: 'Your appointment has been booked',
            type: NotificationType.APPOINTMENT_BOOKED,
            isRead: false,
          },
        ],
      });
    });

    it('should allow user to get their notifications', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
      expect(response.body.data[0].userId).toBe(patient.id);
    });

    it('should allow user to get unread count', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);

      expect(response.body.count).toBeGreaterThanOrEqual(2);
    });

    it('should allow user to mark a notification as read', async () => {
      const notifications = await prisma.notification.findMany({
        where: { userId: patient.id, isRead: false },
      });
      const notificationId = notifications[0].id;

      await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);

      const updated = await prisma.notification.findUnique({
        where: { id: notificationId },
      });
      expect(updated?.isRead).toBe(true);
    });

    it('should allow user to mark all notifications as read', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);

      const unreadCount = await prisma.notification.count({
        where: { userId: patient.id, isRead: false },
      });
      expect(unreadCount).toBe(0);
    });
  });
});

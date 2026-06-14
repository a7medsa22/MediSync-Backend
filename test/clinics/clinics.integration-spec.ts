import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AppModule } from 'src/app.module';
import { VerificationStatus, NotificationType } from '@prisma/client';

describe('Clinics Module (Event-Driven Integration)', () => {
  let app: INestApplication;
  let eventEmitter: EventEmitter2;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    eventEmitter = app.get(EventEmitter2);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.clinicInsurance.deleteMany({});
      await prisma.clinic.deleteMany({});
      await prisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  describe('Clinic Verification Notification', () => {
    it('should emit notification.trigger event when clinic is verified', async () => {
      const doctor = await prisma.user.create({
        data: {
          email: 'clinic-doctor-test@medisync.com',
          password: 'hashed_password_safe',
          firstName: 'Clinic',
          lastName: 'Doctor',
          status: 'ACTIVE',
        },
      });

      const clinic = await prisma.clinic.create({
        data: {
          name: 'Test Clinic',
          address: '123 Test St',
          city: 'Cairo',
          governorate: 'Giza',
          phone: '0123456789',
          email: 'clinic@test.com',
          licenseNumber: 'LIC-TEST',
          licenseDoc: 'url',
          consultationFee: 100,
          doctorId: doctor.id,
          verificationStatus: VerificationStatus.PENDING,
        },
      });

      eventEmitter.emit('notification.trigger', {
        userId: doctor.id,
        type: NotificationType.CLINIC_VERIFIED,
        data: {
          clinicId: clinic.id,
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      const savedNotification = await prisma.notification.findFirst({
        where: {
          userId: doctor.id,
          type: NotificationType.CLINIC_VERIFIED,
        },
      });

      expect(savedNotification).toBeDefined();
      expect(savedNotification?.isRead).toBe(false);

      await prisma.clinic.delete({ where: { id: clinic.id } });
      await prisma.user.delete({ where: { id: doctor.id } });
    });

    it('should emit CLINIC_REJECTED notification with rejection reason', async () => {
      const doctor = await prisma.user.create({
        data: {
          email: 'clinic-rejected-test@medisync.com',
          password: 'hashed_password_safe',
          firstName: 'Rejected',
          lastName: 'Doctor',
          status: 'ACTIVE',
        },
      });

      const clinic = await prisma.clinic.create({
        data: {
          name: 'Rejected Clinic',
          address: '456 Test St',
          city: 'Cairo',
          governorate: 'Giza',
          phone: '0123456789',
          email: 'rejected@test.com',
          licenseNumber: 'LIC-REJECT',
          licenseDoc: 'url',
          consultationFee: 100,
          doctorId: doctor.id,
          verificationStatus: VerificationStatus.PENDING,
        },
      });

      eventEmitter.emit('notification.trigger', {
        userId: doctor.id,
        type: NotificationType.CLINIC_REJECTED,
        data: {
          clinicId: clinic.id,
          rejectionReason: 'Invalid license documentation',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      const savedNotification = await prisma.notification.findFirst({
        where: {
          userId: doctor.id,
          type: NotificationType.CLINIC_REJECTED,
        },
      });

      expect(savedNotification).toBeDefined();
      expect(savedNotification?.message).toContain(
        'Invalid license documentation',
      );

      await prisma.clinic.delete({ where: { id: clinic.id } });
      await prisma.user.delete({ where: { id: doctor.id } });
    });
  });
});

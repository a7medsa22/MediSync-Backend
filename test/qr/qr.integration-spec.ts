import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../helpers/test-setup';
import { PrismaService } from 'src/prisma/prisma.service';
import { seedDoctor, seedPatient, loginAndGetToken } from '../helpers/auth-helpers';

describe('QR Flow (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let doctor: any;
  let patient: any;
  let doctorToken: string;
  let patientToken: string;

  beforeAll(async () => {
    const setup = await createTestApp();
    app = setup.app;
    prisma = setup.prisma;

    doctor = await seedDoctor(prisma);
    patient = await seedPatient(prisma);

    const doctorLogin = await loginAndGetToken(app, doctor.email, doctor.rawPassword);
    doctorToken = doctorLogin.accessToken;

    const patientLogin = await loginAndGetToken(app, patient.email, patient.rawPassword);
    patientToken = patientLogin.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('QR Management', () => {
    let qrToken: string;

    it('should allow doctor to generate a QR code', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/qr/generate')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          expiryMinutes: 30, // 30 minutes
        })
        .expect(201);

      const responseData = response.body.data || response.body;
      expect(responseData.token).toBeDefined();
      expect(responseData.qrCodeImage).toBeDefined();
      qrToken = responseData.token;
    });

    it('should allow doctor to validate QR token without using it', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/qr/validate')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          qrToken: qrToken,
          token: qrToken,
        })
        .expect(200);

      const responseData = response.body.data || response.body;
      expect(responseData.valid).toBe(true);
      expect(responseData.expiresAt).toBeDefined();
      expect(typeof responseData.remainingMinutes).toBe('number');

      const tokenRow = await prisma.qrToken.findUnique({ where: { token: qrToken } });
      expect(tokenRow).toBeDefined();
      expect(tokenRow?.isUsed).toBe(false);
    });

    it('should allow patient to scan QR and connect', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/qr/scan')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          token: qrToken,
        })
        .expect(200);

      const responseData = response.body.data || response.body; expect(responseData).toBeDefined();

      const doctorProfile = await prisma.doctor.findUnique({ where: { userId: doctor.id } });
      const patientProfile = await prisma.patient.findUnique({ where: { userId: patient.id } });

      const connection = await prisma.doctorPatientConnection.findFirst({
        where: { doctorId: doctorProfile?.id, patientId: patientProfile?.id },
      });
      expect(connection).toBeDefined();
    });

    it('should prevent reuse of the same QR token', async () => {
      const anotherPatient = await seedPatient(prisma);
      const anotherPatientToken = (await loginAndGetToken(app, anotherPatient.email, anotherPatient.rawPassword)).accessToken;

      await request(app.getHttpServer())
        .post('/api/v1/qr/scan')
        .set('Authorization', `Bearer ${anotherPatientToken}`)
        .send({
          token: qrToken,
        })
        .expect(400); // Token already used
    });

    it('should prevent scanning an expired QR token', async () => {
      const expiredToken = await prisma.qrToken.create({
        data: {
          doctorId: (await prisma.doctor.findUnique({ where: { userId: doctor.id } }))!.id,
          token: 'expired-token-123',
          expiresAt: new Date(Date.now() - 1000), // 1 second ago
        },
      });

      await request(app.getHttpServer())
        .post('/api/v1/qr/scan')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          token: expiredToken.token,
        })
        .expect(400); // Token expired
    });
  });
});
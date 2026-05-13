import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../helpers/test-setup';
import { PrismaService } from 'src/prisma/prisma.service';
import { seedDoctor, seedPatient, loginAndGetToken } from '../helpers/auth-helpers';
import { RequestStatus, ConnectionStatus } from '@prisma/client';

describe('Requests & Connections Flow (Integration)', () => {
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

  describe('Connection Requests', () => {
    let requestId: string;

    it('should allow patient to send a follow-up request', async () => {
      const doctorProfile = await prisma.doctor.findUnique({
        where: { userId: doctor.id },
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          doctorId: doctorProfile?.id,
          prescriptionImage: 'http://example.com/prescription.jpg',
          notes: 'I need a follow-up for my medication.',
        })
        .expect(201);

      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.status).toBe(RequestStatus.PENDING);
      requestId = response.body.data.id;
    });

    it('should prevent duplicate requests', async () => {
      const doctorProfile = await prisma.doctor.findUnique({
        where: { userId: doctor.id },
      });

      await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          doctorId: doctorProfile?.id,
          prescriptionImage: 'http://example.com/prescription.jpg',
        })
        .expect(409);
    });

    it('should allow doctor to get pending requests', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/requests/pending')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].id).toBe(requestId);
    });

    it('should allow doctor to accept request and create connection', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/requests/${requestId}/accept`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          schedule: 'Every Monday 10 AM',
        })
        .expect(201);

      expect(response.body.data.status).toBe(RequestStatus.ACCEPTED);
      
      // Verify connection created
      const connection = await prisma.doctorPatientConnection.findFirst({
        where: { 
          doctorId: (await prisma.doctor.findUnique({ where: { userId: doctor.id } }))?.id,
          patientId: (await prisma.patient.findUnique({ where: { userId: patient.id } }))?.id,
        },
      });
      expect(connection).toBeDefined();
      expect(connection?.status).toBe(ConnectionStatus.ACTIVE);
    });

    it('should allow doctor to reject a request', async () => {
      const anotherPatient = await seedPatient(prisma);
      const anotherPatientToken = (await loginAndGetToken(app, anotherPatient.email, anotherPatient.rawPassword)).accessToken;
      
      const doctorProfile = await prisma.doctor.findUnique({
        where: { userId: doctor.id },
      });

      // Send new request
      const reqResponse = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${anotherPatientToken}`)
        .send({
          doctorId: doctorProfile?.id,
          prescriptionImage: 'http://example.com/prescription.jpg',
        });
      
      const newRequestId = reqResponse.body.data.id;

      await request(app.getHttpServer())
        .post(`/api/v1/requests/${newRequestId}/reject`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          reason: 'Incomplete information',
        })
        .expect(201);

      const updatedRequest = await prisma.followUpRequest.findUnique({
        where: { id: newRequestId },
      });
      expect(updatedRequest?.status).toBe(RequestStatus.REJECTED);
    });

    it('should prevent patient from accepting their own request', async () => {
      const anotherPatient = await seedPatient(prisma);
      const anotherPatientToken = (await loginAndGetToken(app, anotherPatient.email, anotherPatient.rawPassword)).accessToken;
      
      const doctorProfile = await prisma.doctor.findUnique({
        where: { userId: doctor.id },
      });

      const reqResponse = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${anotherPatientToken}`)
        .send({
          doctorId: doctorProfile?.id,
          prescriptionImage: 'http://example.com/prescription.jpg',
        });
      
      const newRequestId = reqResponse.body.data.id;

      await request(app.getHttpServer())
        .post(`/api/v1/requests/${newRequestId}/accept`)
        .set('Authorization', `Bearer ${anotherPatientToken}`)
        .send({ schedule: 'test' })
        .expect(403);
    });
  });

  describe('Connections Management', () => {
    it('should allow patient to see their connected doctors', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/requests/connections')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].doctor).toBeDefined();
    });

    it('should allow doctor to see their connected patients', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/requests/connections')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].patient).toBeDefined();
    });
  });
});

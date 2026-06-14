import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../helpers/test-setup';
import { PrismaService } from 'src/prisma/prisma.service';
import { loginAndGetToken, seedDoctor, seedPatient } from '../helpers/auth-helpers';

describe('Clinics, Profiles & Reviews (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let doctorToken: string;
  let patientToken: string;
  let doctor: any;
  let patient: any;
  let patientId: string;
  let doctorId: string;
  let clinicId: string;

  beforeAll(async () => {
    const setup = await createTestApp();
    app = setup.app;
    prisma = setup.prisma;
  });

  beforeEach(async () => {
    doctor = await seedDoctor(prisma);
    patient = await seedPatient(prisma);

    const doctorLogin = await loginAndGetToken(
      app,
      doctor.email,
      doctor.rawPassword,
    );
    doctorToken = doctorLogin.accessToken;
    doctorId = doctor.id;

    const patientLogin = await loginAndGetToken(
      app,
      patient.email,
      patient.rawPassword,
    );
    patientToken = patientLogin.accessToken;
    patientId = patient.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /clinics', () => {
    it('should allow a doctor to create a clinic successfully', async () => {
      const clinicDto = {
        name: 'El-Amal Clinic',
        address: '123 Main St',
        city: 'Cairo',
        governorate: 'Cairo',
        phone: '01012345678',
        email: 'clinic@medisync.com',
        licenseNumber: 'LC-999888',
        licenseDoc: 'https://s3.amazonaws.com/medisync/docs/license.pdf',
        consultationFee: 300.00,
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/clinics')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(clinicDto)
        .expect(201);

      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe(clinicDto.name);
      expect(response.body.data.verificationStatus).toBe('PENDING');
      clinicId = response.body.data.id;
    });

    it('should reject clinic creation if user is a PATIENT (Role Guard)', async () => {
      const clinicDto = { name: 'Failed Clinic' };

      await request(app.getHttpServer())
        .post('/api/v1/clinics')
        .set('Authorization', `Bearer ${patientToken}`)
        .send(clinicDto)
        .expect(403);
    });
  });

  describe('POST /doctors/:id/reviews', () => {
    it('should allow a patient to review a doctor if they have a COMPLETED appointment', async () => {
      const connection = await prisma.doctorPatientConnection.create({
        data: { doctorId, patientId, status: 'ACTIVE' },
      });

      await prisma.appointment.create({
        data: {
          doctorId,
          patientId,
          connectionId: connection.id,
          startTime: new Date(),
          endTime: new Date(Date.now() + 30 * 60 * 1000),
          status: 'COMPLETED',
        },
      });

      const reviewDto = {
        rating: 5,
        comment: 'Good doctor, very professional and kind. Highly recommend.',
        isAnonymous: false,
      };

      const response = await request(app.getHttpServer())
        .post(`/api/v1/doctors/${doctorId}/reviews`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send(reviewDto)
        .expect(201);

      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.rating).toBe(5);

      const updatedDoctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
      expect(updatedDoctor?.rating).toBe(5);
      expect(updatedDoctor?.reviewCount).toBe(1);
    });

    it('should throw BadRequest (400) if patient tries to review without a completed appointment', async () => {
      const reviewDto = { rating: 4, comment: 'No completed appointment exists' };

      const response = await request(app.getHttpServer())
        .post(`/api/v1/doctors/${doctorId}/reviews`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send(reviewDto)
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('Cannot review without a completed appointment')]),
      );
    });
  });

  describe('GET /doctors/:id/reviews', () => {
    it('should return a list of reviews for a specific doctor', async () => {
      await prisma.doctorReview.create({
        data: {
          doctorId,
          patientId,
          rating: 4,
          comment: 'Good experience',
          isAnonymous: false,
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/doctors/${doctorId}/reviews`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
      expect(response.body.data[0].comment).toBe('Good experience');
    });
  });

  describe('GET /doctor-profile/:id', () => {
    it('should fetch the public profile of a doctor including aggregate ratings', async () => {
      await prisma.doctor.update({
        where: { id: doctorId },
        data: { rating: 4.5, reviewCount: 12 },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/doctor-profile/${doctorId}`)
        .expect(200);

      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.rating).toBe(4.5);
      expect(response.body.data.reviewCount).toBe(12);
    });
  });
});
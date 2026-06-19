import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../helpers/test-setup';
import { PrismaService } from 'src/prisma/prisma.service';
import { loginAndGetToken, seedDoctor, seedPatient } from '../helpers/auth-helpers';

describe('Doctor Profile & Reviews (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let doctorToken: string;
  let patientToken: string;
  let doctor: any;
  let patient: any;
  let patientId: string;
  let doctorId: string;

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
    // Find the Doctor profile ID (which is Doctor.id, not User.id)
    const doctorProfile = await prisma.doctor.findUnique({
      where: { userId: doctor.id },
    });
    doctorId = doctorProfile!.id;

    const patientLogin = await loginAndGetToken(
      app,
      patient.email,
      patient.rawPassword,
    );
    patientToken = patientLogin.accessToken;
    
    const patientProfile = await prisma.patient.findUnique({
      where: { userId: patient.id },
    });
    patientId = patientProfile!.id;

    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('PUT /doctor-profile/me', () => {
    it('should allow a logged-in doctor to update their own profile', async () => {
      const updateDto = {
        bio: 'Experienced surgeon with 10+ years of practice.',
        yearsOfExperience: 12,
        education: 'MD from Harvard Medical School',
      };

      const response = await request(app.getHttpServer())
        .put('/api/v2/doctor-profile/me')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.data.bio).toBe(updateDto.bio);
      expect(response.body.data.yearsOfExperience).toBe(updateDto.yearsOfExperience);
      expect(response.body.data.education).toBe(updateDto.education);

      // Verify DB change
      const dbDoctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
      expect(dbDoctor?.bio).toBe(updateDto.bio);
    });

    it('should deny access if not authenticated', async () => {
      await request(app.getHttpServer())
        .put('/api/v2/doctor-profile/me')
        .send({ bio: 'Hello' })
        .expect(401);
    });

    it('should deny profile updates if role is PATIENT', async () => {
      await request(app.getHttpServer())
        .put('/api/v2/doctor-profile/me')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ bio: 'Patient attempting to be doctor' })
        .expect(403);
    });
  });

  describe('GET /doctor-profile/:id', () => {
    it('should return a doctor profile by ID successfully', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v2/doctor-profile/${doctorId}`)
        .expect(200);

      expect(response.body.data.id).toBe(doctorId);
    });

    it('should throw NotFound (404) if profile does not exist', async () => {
      await request(app.getHttpServer())
        .get('/api/v2/doctor-profile/non-existent-uuid')
        .expect(404);
    });
  });

  describe('POST /doctors/:id/reviews', () => {
    it('should allow a patient to review a doctor after a completed appointment and trigger event-driven notification', async () => {
      // 1. Create a connection
      const connection = await prisma.doctorPatientConnection.create({
        data: { doctorId, patientId, status: 'ACTIVE' },
      });

      // 2. Create a completed appointment
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
        comment: 'Amazing attention and care.',
      };

      const response = await request(app.getHttpServer())
        .post(`/api/v2/doctors/${doctorId}/reviews`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send(reviewDto)
        .expect(201);

      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.rating).toBe(5);

      // Verify that the NEW_DOCTOR_REVIEW notification was triggered asynchronously via EventEmitter
      // Allow async event loop processing
      await new Promise((resolve) => setTimeout(resolve, 150));
 
      const notifications = await prisma.notification.findMany({
        where: { userId: doctor.id, type: 'NEW_DOCTOR_REVIEW' },
      });
      expect(notifications.length).toBe(1);
      expect(notifications[0].metadata).toEqual(
        expect.objectContaining({
          rating: reviewDto.rating,
          comment: reviewDto.comment,
          actionUrl: '/dashboard/doctor/reviews',
        }),
      );
    });

    it('should block reviews if patient has no completed appointment with the doctor', async () => {
      const reviewDto = {
        rating: 4,
        comment: 'I never had an appointment but trying to review.',
      };

      await request(app.getHttpServer())
        .post(`/api/v2/doctors/${doctorId}/reviews`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send(reviewDto)
        .expect(400);
    });
  });

  describe('GET /doctors/:id/reviews', () => {
    it('should list reviews for a doctor', async () => {
      await prisma.doctorReview.create({
        data: {
          doctorId,
          patientId,
          rating: 4,
          comment: 'Standard review',
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v2/doctors/${doctorId}/reviews`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });
});

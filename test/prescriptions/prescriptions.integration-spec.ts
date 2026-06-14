import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../helpers/test-setup';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  seedDoctor,
  seedPatient,
  loginAndGetToken,
} from '../helpers/auth-helpers';
import { TimeUtils } from 'src/common/utils/time.utils';

describe('Prescriptions Flow (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let doctor: any;
  let patient: any;
  let doctorProfile: any;
  let patientProfile: any;
  let connection: any;
  let doctorToken: string;
  let patientToken: string;
  let prescriptionId: string;
  let templateId: string;

  beforeAll(async () => {
    const setup = await createTestApp();
    app = setup.app;
    prisma = setup.prisma;

    doctor = await seedDoctor(prisma);
    patient = await seedPatient(prisma);

    doctorProfile = await prisma.doctor.findUnique({
      where: { userId: doctor.id },
    });
    patientProfile = await prisma.patient.findUnique({
      where: { userId: patient.id },
    });

    // Create active connection
    connection = await prisma.doctorPatientConnection.create({
      data: {
        doctorId: doctorProfile.id,
        patientId: patientProfile.id,
        status: 'ACTIVE',
      },
    });

    const doctorLogin = await loginAndGetToken(
      app,
      doctor.email,
      doctor.rawPassword,
    );
    doctorToken = doctorLogin.accessToken;

    const patientLogin = await loginAndGetToken(
      app,
      patient.email,
      patient.rawPassword,
    );
    patientToken = patientLogin.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Prescription Creation', () => {
    it('should allow doctor to create a prescription successfully', async () => {
      const expiresAt = TimeUtils.addDays(new Date(), 30).toISOString();

      const response = await request(app.getHttpServer())
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          connectionId: connection.id,
          medications: [
            {
              drugName: 'Paracetamol',
              dosage: '500mg',
              frequency: '3 times daily',
              duration: '7 days',
              instructions: 'Take after meals',
            },
          ],
          notes: 'Take plenty of rest',
          expiresAt,
        })
        .expect(201);

      expect(response.body.message).toBe('Prescription created successfully');
      expect(response.body.data.prescription).toBeDefined();
      prescriptionId = response.body.data.prescription.id;
    });

    it('should fail to create prescription with invalid DTO (missing required fields)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          connectionId: connection.id,
          medications: [], // Empty medications
          expiresAt: TimeUtils.addDays(new Date(), 30).toISOString(),
        })
        .expect(400);
    });

    it('should fail to create prescription with past expiry date', async () => {
      const pastDate = TimeUtils.addDays(new Date(), -1).toISOString();

      await request(app.getHttpServer())
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          connectionId: connection.id,
          medications: [
            {
              drugName: 'Paracetamol',
              dosage: '500mg',
              frequency: '3 times daily',
              duration: '7 days',
            },
          ],
          expiresAt: pastDate,
        })
        .expect(403);
    });

    it('should fail to create prescription for inactive connection', async () => {
      const anotherDoctor = await seedDoctor(prisma);
      const anotherDoctorProfile = await prisma.doctor.findUnique({
        where: { userId: anotherDoctor.id },
      });
      const anotherPatient = await seedPatient(prisma);
      const anotherPatientProfile = await prisma.patient.findUnique({
        where: { userId: anotherPatient.id },
      });

      const inactiveConnection = await prisma.doctorPatientConnection.create({
        data: {
          doctorId: anotherDoctorProfile!.id,
          patientId: anotherPatientProfile!.id,
          status: 'INACTIVE',
        },
      });

      const expiresAt = TimeUtils.addDays(new Date(), 30).toISOString();

      await request(app.getHttpServer())
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          connectionId: inactiveConnection.id,
          medications: [
            {
              drugName: 'Paracetamol',
              dosage: '500mg',
              frequency: '3 times daily',
              duration: '7 days',
            },
          ],
          expiresAt,
        })
        .expect(403);
    });
  });

  describe('Prescription Retrieval', () => {
    it('should allow patient to view their own prescriptions', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/prescriptions/my-prescriptions')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should allow doctor to get prescriptions for a connection', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/prescriptions/connections/${connection.id}`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should allow both doctor and patient to view a specific prescription', async () => {
      const doctorResponse = await request(app.getHttpServer())
        .get(`/api/v1/prescriptions/${prescriptionId}`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      expect(doctorResponse.body.data.id).toBe(prescriptionId);

      const patientResponse = await request(app.getHttpServer())
        .get(`/api/v1/prescriptions/${prescriptionId}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);

      expect(patientResponse.body.data.id).toBe(prescriptionId);
    });

    it('should allow doctor to get their own prescriptions with stats', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/prescriptions/doctor/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
    });
  });

  describe('Prescription Deactivation', () => {
    it('should allow doctor to deactivate a prescription', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/prescriptions/${prescriptionId}/deactivate`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      const updated = await prisma.prescription.findUnique({
        where: { id: prescriptionId },
      });
      expect(updated?.status).toBe('CANCELLED');
    });

    it('should prevent patient from deactivating prescription', async () => {
      const expiresAt = TimeUtils.addDays(new Date(), 30).toISOString();
      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          connectionId: connection.id,
          medications: [
            {
              drugName: 'Amoxicillin',
              dosage: '500mg',
              frequency: '3 times daily',
              duration: '7 days',
            },
          ],
          expiresAt,
        })
        .expect(201);

      const newPrescriptionId = createResponse.body.data.prescription.id;

      await request(app.getHttpServer())
        .put(`/api/v1/prescriptions/${newPrescriptionId}/deactivate`)
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(403);
    });
  });

  describe('Prescription Templates', () => {
    it('should allow doctor to create a template', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/prescriptions/templates')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          name: 'Standard Cold & Flu',
          notes: 'Template for common cold symptoms',
          medications: [
            {
              drugName: 'Paracetamol',
              dosage: '500mg',
              frequency: '3 times daily',
              duration: '7 days',
            },
          ],
        })
        .expect(201);

      expect(response.body.data).toBeDefined();
      templateId = response.body.data.id;
    });

    it('should allow doctor to get all templates', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/prescriptions/templates')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should allow doctor to create prescription from template', async () => {
      const expiresAt = TimeUtils.addDays(new Date(), 30).toISOString();

      const response = await request(app.getHttpServer())
        .post('/api/v1/prescriptions/from-template')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          connectionId: connection.id,
          templateId: templateId,
          expiresAt,
        })
        .expect(201);

      expect(response.body.message).toBe('Prescription created successfully');
    });

    it('should allow doctor to get template stats', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/prescriptions/templates/stats')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
    });

    it('should allow doctor to deactivate a template', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/prescriptions/templates/${templateId}/deactivate`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);
    });
  });

  describe('Prescription Renewal', () => {
    it('should allow patient to request prescription renewal', async () => {
      // Create a fresh prescription first
      const expiresAt = TimeUtils.addDays(new Date(), 30).toISOString();
      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          connectionId: connection.id,
          medications: [
            {
              drugName: 'Amoxicillin',
              dosage: '500mg',
              frequency: '3 times daily',
              duration: '7 days',
            },
          ],
          expiresAt,
        })
        .expect(201);

      const renewalPrescriptionId = createResponse.body.data.prescription.id;

      const response = await request(app.getHttpServer())
        .post(`/api/v1/prescriptions/${renewalPrescriptionId}/request-renewal`)
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(201);

      expect(response.body.data || response.body).toBeDefined();
    });

    it('should allow doctor to approve prescription renewal', async () => {
      // Create a fresh prescription for approval
      const expiresAt = TimeUtils.addDays(new Date(), 30).toISOString();
      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          connectionId: connection.id,
          medications: [
            {
              drugName: 'Ibuprofen',
              dosage: '400mg',
              frequency: '3 times daily',
              duration: '5 days',
            },
          ],
          expiresAt,
        })
        .expect(201);

      const approvePrescriptionId = createResponse.body.data.prescription.id;

      // Request renewal
      const renewalResponse = await request(app.getHttpServer())
        .post(`/api/v1/prescriptions/${approvePrescriptionId}/request-renewal`)
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(201);

      const renewalId =
        renewalResponse.body.data?.id || renewalResponse.body.id;

      // Then doctor approves it
      const approveResponse = await request(app.getHttpServer())
        .patch(`/api/v1/prescriptions/${renewalId}/approve-renewal`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          notes: 'Renewed for another 30 days',
          newExpiryDate: TimeUtils.addDays(new Date(), 30).toISOString(),
        })
        .expect(200);

      expect(approveResponse.body.data || approveResponse.body).toBeDefined();
    });

    it('should allow doctor to reject prescription renewal', async () => {
      // Create a fresh prescription for rejection
      const expiresAt = TimeUtils.addDays(new Date(), 30).toISOString();
      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          connectionId: connection.id,
          medications: [
            {
              drugName: 'Saline',
              dosage: '10ml',
              frequency: '2 times daily',
              duration: '3 days',
            },
          ],
          expiresAt,
        })
        .expect(201);

      const rejectPrescriptionId = createResponse.body.data.prescription.id;

      // Request renewal
      const renewalResponse = await request(app.getHttpServer())
        .post(`/api/v1/prescriptions/${rejectPrescriptionId}/request-renewal`)
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(201);

      const renewalId =
        renewalResponse.body.data?.id || renewalResponse.body.id;

      // Then doctor rejects it
      const rejectResponse = await request(app.getHttpServer())
        .patch(`/api/v1/prescriptions/${renewalId}/reject-renewal`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ reason: 'Medication no longer suitable' })
        .expect(200);

      expect(rejectResponse.body.data || rejectResponse.body).toBeDefined();
    });
  });

  describe('Drug Interactions', () => {
    it('should check drug interactions successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/prescriptions/check-interactions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          drugNames: ['Paracetamol', 'Ibuprofen'],
        })
        .expect(200);
    });

    it('should fail if only one drug is provided', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/prescriptions/check-interactions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          drugNames: ['Paracetamol'],
        })
        .expect(400);
    });
  });

  describe('Authorization Tests', () => {
    it('should prevent patient from creating a prescription', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          connectionId: connection.id,
          medications: [
            {
              drugName: 'Paracetamol',
              dosage: '500mg',
              frequency: '3 times daily',
              duration: '7 days',
            },
          ],
          expiresAt: TimeUtils.addDays(new Date(), 30).toISOString(),
        })
        .expect(403);
    });

    it('should prevent unauthorized doctor from accessing connection prescriptions', async () => {
      const anotherDoctor = await seedDoctor(prisma);
      const anotherDoctorToken = (
        await loginAndGetToken(
          app,
          anotherDoctor.email,
          anotherDoctor.rawPassword,
        )
      ).accessToken;

      await request(app.getHttpServer())
        .get(`/api/v1/prescriptions/connections/${connection.id}`)
        .set('Authorization', `Bearer ${anotherDoctorToken}`)
        .expect(403);
    });
  });
});

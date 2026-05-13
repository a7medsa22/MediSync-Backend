import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../helpers/test-setup';
import { PrismaService } from 'src/prisma/prisma.service';
import { seedDoctor, seedPatient, loginAndGetToken } from '../helpers/auth-helpers';

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

  beforeAll(async () => {
    const setup = await createTestApp();
    app = setup.app;
    prisma = setup.prisma;

    doctor = await seedDoctor(prisma);
    patient = await seedPatient(prisma);

    doctorProfile = await prisma.doctor.findUnique({ where: { userId: doctor.id } });
    patientProfile = await prisma.patient.findUnique({ where: { userId: patient.id } });

    // Create a connection first
    connection = await prisma.doctorPatientConnection.create({
      data: {
        doctorId: doctorProfile.id,
        patientId: patientProfile.id,
        status: 'ACTIVE',
      },
    });

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

  describe('Prescription Management', () => {
    let prescriptionId: string;

    it('should allow doctor to create a prescription', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/prescriptions/connections/${connection.id}`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          medications: [
            {
              name: 'Panadol',
              dosage: '500mg',
              frequency: 3,
              frequencyType: 'daily',
              duration: '7 days',
              notes: 'After meals',
            },
          ],
          notes: 'Take plenty of rest',
        })
        .expect(201);

      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.isActive).toBe(true);
      prescriptionId = response.body.data.id;
    });

    it('should allow patient to view their prescriptions', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/prescriptions/my-prescriptions')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].id).toBe(prescriptionId);
    });

    it('should allow doctor to deactivate a prescription', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/prescriptions/${prescriptionId}/deactivate`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      const updated = await prisma.prescription.findUnique({
        where: { id: prescriptionId },
      });
      expect(updated?.isActive).toBe(false);
    });

    it('should prevent patient from creating a prescription', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/prescriptions/connections/${connection.id}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          medications: [{ name: 'Test', dosage: '10mg' }],
        })
        .expect(403);
    });

    it('should prevent unauthorized doctor from accessing patient prescriptions', async () => {
      const anotherDoctor = await seedDoctor(prisma);
      const anotherDoctorToken = (await loginAndGetToken(app, anotherDoctor.email, anotherDoctor.rawPassword)).accessToken;

      await request(app.getHttpServer())
        .get(`/api/v1/prescriptions/patients/${patientProfile.id}`)
        .set('Authorization', `Bearer ${anotherDoctorToken}`)
        .expect(404); // PrescriptionsService returns 404 if no connection exists
    });
  });
});

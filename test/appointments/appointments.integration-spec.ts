import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../helpers/test-setup';
import { PrismaService } from 'src/prisma/prisma.service';
import { seedDoctor, seedPatient, loginAndGetToken } from '../helpers/auth-helpers';
import { AppointmentStatus, DayOfWeek } from '@prisma/client';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Appointments & Availability Flow (Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let doctor: any;
  let patient: any;
  let doctorProfile: any;
  let patientProfile: any;
  let connection: any;
  let doctorToken: string;
  let patientToken: string;

  const getDoctorAndPatientProfiles = async () => {
    const freshDoctorProfile = await prisma.doctor.findUnique({
      where: { userId: doctor.id },
    });

    const freshPatientProfile = await prisma.patient.findUnique({
      where: { userId: patient.id },
    });

    expect(freshDoctorProfile).toBeTruthy();
    expect(freshPatientProfile).toBeTruthy();

    return { freshDoctorProfile, freshPatientProfile };
  };

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

  describe('Availability Management', () => {
    it('should allow doctor to create availability', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/availability')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          doctorId: doctorProfile.id,
          dayOfWeek: DayOfWeek.MONDAY,
          startTime: 540, // 09:00 in minutes
          endTime: 720,   // 12:00 in minutes
          slotDuration: 30,
          maxAppointmentsPerDay: 10,
        });

      console.log('Response body:', response.body);
      console.log('Status:', response.status);
      
      expect(response.status).toBe(201);
      expect(response.body.data.dayOfWeek).toBe(DayOfWeek.MONDAY);
      expect(response.body.data.id).toBeDefined();
    });

    it('should prevent overlapping availability', async () => {
      // First, create an initial availability on Tuesday
      await request(app.getHttpServer())
        .post('/api/v1/availability')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          doctorId: doctorProfile.id,
          dayOfWeek: DayOfWeek.TUESDAY,
          startTime: 540, // 09:00 in minutes
          endTime: 720,   // 12:00 in minutes
          slotDuration: 30,
          maxAppointmentsPerDay: 10,
        })
        .expect(201);

      // Then try to create an overlapping availability on the same Tuesday
      const response = await request(app.getHttpServer())
        .post('/api/v1/availability')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          doctorId: doctorProfile.id,
          dayOfWeek: DayOfWeek.TUESDAY,
          startTime: 600, // 10:00 in minutes (overlaps with 09:00-12:00)
          endTime: 780,   // 13:00 in minutes (overlaps with 09:00-12:00)
          slotDuration: 30,
          maxAppointmentsPerDay: 10,
        });

      console.log('Overlapping test response:', response.body);
      console.log('Overlapping test status:', response.status);
      
      expect(response.status).toBe(409);
    });
  });

  describe('Appointment Booking', () => {
    let appointmentId: string;

    let doctorId: string;
    let patientId: string;

    beforeAll(async () => {
      const { freshDoctorProfile, freshPatientProfile } =
        await getDoctorAndPatientProfiles();

      doctorId = freshDoctorProfile!.id;
      patientId = freshPatientProfile!.id;

      // Reuse the connection created in the outer beforeAll
      // (doctorId, patientId is unique in DoctorPatientConnection)

      // Create all needed availabilities directly in database to bypass rate limiting
      await prisma.doctorAvailability.createMany({
        data: [
          {
            doctorId,
            dayOfWeek: DayOfWeek.WEDNESDAY,
            startTime: 540, // 09:00 in minutes
            endTime: 720, // 12:00 in minutes
            slotDuration: 30,
            maxAppointmentsPerDay: 10,
            isActive: true,
          },
          {
            doctorId,
            dayOfWeek: DayOfWeek.THURSDAY,
            startTime: 540, // 09:00 in minutes
            endTime: 720, // 12:00 in minutes
            slotDuration: 30,
            maxAppointmentsPerDay: 10,
            isActive: true,
          },
          {
            doctorId,
            dayOfWeek: DayOfWeek.FRIDAY,
            startTime: 540, // 09:00 in minutes
            endTime: 720, // 12:00 in minutes
            slotDuration: 30,
            maxAppointmentsPerDay: 10,
            isActive: true,
          },
          {
            doctorId,
            dayOfWeek: DayOfWeek.SATURDAY,
            startTime: 540, // 09:00 in minutes
            endTime: 720, // 12:00 in minutes
            slotDuration: 30,
            maxAppointmentsPerDay: 10,
            isActive: true,
          },
        ],
      });
    });

    it('should allow patient to book an appointment', async () => {
      // Calculate next Wednesday at 10:00 AM
      const nextWednesday = new Date();
      const daysUntilWednesday = (3 + 7 - nextWednesday.getDay()) % 7 || 7;
      nextWednesday.setDate(nextWednesday.getDate() + daysUntilWednesday);
      nextWednesday.setHours(10, 0, 0, 0);
      
      const response = await request(app.getHttpServer())
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .query({ patientId: patientId })
        .query({ patientId: patientId })
        .send({
          doctorId: doctorId,
          connectionId: connection.id,
          startTime: nextWednesday.toISOString(),
          type: 'IN_CLINIC',
          reason: 'General checkup',
        });

      console.log('Appointment booking response:', response.body);
      console.log('Appointment booking status:', response.status);

      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe(AppointmentStatus.PENDING);
      appointmentId = response.body.data.id;
    });

    it('should prevent double booking same slot', async () => {
      // Calculate next Thursday at 10:00 AM
      const nextThursday = new Date();
      const daysUntilThursday = (4 + 7 - nextThursday.getDay()) % 7 || 7;
      nextThursday.setDate(nextThursday.getDate() + daysUntilThursday);
      nextThursday.setHours(10, 0, 0, 0);
      
      // First, create an appointment with the original patient
      await sleep(1100);

      await request(app.getHttpServer())
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .query({ patientId: patientId })
        .send({
          doctorId: doctorId,
          connectionId: connection.id,
          startTime: nextThursday.toISOString(),
          type: 'IN_CLINIC',
          reason: 'First appointment',
        })
        .expect(201);

      // Then try to book the same slot with another patient
      const anotherPatient = await seedPatient(prisma);
      const anotherPatientProfile = await prisma.patient.findUnique({ where: { userId: anotherPatient.id } });
      const anotherPatientToken = (await loginAndGetToken(app, anotherPatient.email, anotherPatient.rawPassword)).accessToken;

      // Create a connection for the new patient
      const anotherConnection = await prisma.doctorPatientConnection.create({
        data: {
          doctorId: doctorId,
          patientId: anotherPatientProfile!.id,
          status: 'ACTIVE',
        },
      });
      
      const response = await request(app.getHttpServer())
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${anotherPatientToken}`)
        .query({ patientId: anotherPatientProfile?.id })
        .send({
          doctorId: doctorId,
          connectionId: anotherConnection.id,
          startTime: nextThursday.toISOString(),
          type: 'IN_CLINIC',
        });

      console.log('Double booking response:', response.body);
      console.log('Double booking status:', response.status);
      
      expect(response.status).toBe(400);
    });

    it('should allow doctor to confirm appointment', async () => {
      // Calculate next Friday at 10:00 AM
      const nextFriday = new Date();
      const daysUntilFriday = (5 + 7 - nextFriday.getDay()) % 7 || 7;
      nextFriday.setDate(nextFriday.getDate() + daysUntilFriday);
      nextFriday.setHours(10, 0, 0, 0);
      
      // Create an appointment
      const appointmentResponse = await request(app.getHttpServer())
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .query({ patientId: patientId })
        .send({
          doctorId: doctorId,
          connectionId: connection.id,
          startTime: nextFriday.toISOString(),
          type: 'IN_CLINIC',
          reason: 'Test appointment for confirmation',
        })
        .expect(201);

      const createdAppointmentId = appointmentResponse.body.data.id;

      // Confirm the appointment
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/appointments/${createdAppointmentId}/confirm`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body.data.status).toBe(AppointmentStatus.CONFIRMED);
    });

    it('should allow patient to cancel appointment', async () => {
      // Calculate next Saturday at 10:00 AM
      const nextSaturday = new Date();
      const daysUntilSaturday = (6 + 7 - nextSaturday.getDay()) % 7 || 7;
      nextSaturday.setDate(nextSaturday.getDate() + daysUntilSaturday);
      nextSaturday.setHours(10, 0, 0, 0);
      
      // Create an appointment
      const appointmentResponse = await request(app.getHttpServer())
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .query({ patientId: patientId })
        .send({
          doctorId: doctorId,
          connectionId: connection.id,
          startTime: nextSaturday.toISOString(),
          type: 'IN_CLINIC',
          reason: 'Test appointment for cancellation',
        })
        .expect(201);

      const createdAppointmentId = appointmentResponse.body.data.id;

      // Cancel the appointment
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/appointments/${createdAppointmentId}/cancel`)
        .set('Authorization', `Bearer ${patientToken}`)
        .query({ userId: patientProfile.id })
        .send({
          reason: 'PATIENT_REQUEST',
        })
        .expect(200);

      expect(response.body.data.status).toBe(AppointmentStatus.CANCELLED);
    });

    it('should return available slots for a doctor (critical availability endpoint)', async () => {
      const start = new Date();
      const end = new Date();
      end.setDate(end.getDate() + 7);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/appointments/doctor/${doctorId}/slots`)
        .query({
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        })
        .expect(200);

      // Response shape can vary; assert only on the slot list payload.
      const slots = response.body?.slots ?? response.body?.data?.slots;
      expect(Array.isArray(slots)).toBe(true);
      expect(slots.length).toBeGreaterThan(0);
      expect(slots[0]).toHaveProperty('start');
      expect(slots[0]).toHaveProperty('end');
    });

    it('should allow doctor to complete a confirmed appointment (appointment lifecycle)', async () => {
      // Create CONFIRMED appointment directly in DB to avoid throttler flakiness
      // Use 11:00 to avoid unique conflict with other tests at 10:00
      const nextWednesday = new Date();
      const daysUntilWednesday = (3 + 7 - nextWednesday.getDay()) % 7 || 7;
      nextWednesday.setDate(nextWednesday.getDate() + daysUntilWednesday);
      nextWednesday.setHours(11, 0, 0, 0);

      const endTime = new Date(nextWednesday);
      endTime.setMinutes(endTime.getMinutes() + 30);

      const createdAppointment = await prisma.appointment.create({
        data: {
          doctorId: doctorId,
          patientId: patientId,
          connectionId: connection.id,
          type: 'IN_CLINIC',
          status: AppointmentStatus.CONFIRMED,
          reason: 'Test appointment for completion',
          startTime: nextWednesday,
          endTime,
        },
      });

      // Complete appointment (doctor)
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/appointments/${createdAppointment.id}/complete`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body.data.status).toBe(AppointmentStatus.COMPLETED);
    });

    it('should allow patient to reschedule an appointment (reschedule happy path)', async () => {
      // Reschedule to a slot that actually exists in the doctor's availability window.
      // We created availability for THURSDAY: 09:00-12:00, slotDuration=30.
      // Earlier tests already use THURSDAY 10:00, so we pick 10:30 -> 11:00.
      const nextThursday = new Date();
      const daysUntilThursday = (4 + 7 - nextThursday.getDay()) % 7 || 7;
      nextThursday.setDate(nextThursday.getDate() + daysUntilThursday);

      const originalStart = new Date(nextThursday);
      originalStart.setHours(10, 30, 0, 0);

      const originalEnd = new Date(originalStart);
      originalEnd.setMinutes(originalEnd.getMinutes() + 30);

      const newStart = new Date(nextThursday);
      newStart.setHours(11, 0, 0, 0);

      // Create PENDING appointment directly in DB to avoid throttler flakiness
      const createdAppointment = await prisma.appointment.create({
        data: {
          doctorId: doctorId,
          patientId: patientId,
          connectionId: connection.id,
          type: 'IN_CLINIC',
          status: AppointmentStatus.PENDING,
          reason: 'Test appointment for reschedule',
          startTime: originalStart,
          endTime: originalEnd,
        },
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/appointments/${createdAppointment.id}/reschedule`)
        .set('Authorization', `Bearer ${patientToken}`)
        .query({ patientId: patientId })
        .send({
          newStartTime: newStart.toISOString(),
          reason: 'PATIENT_REQUEST',
        })
        .expect(200);

      expect(response.body.data.id).toBe(createdAppointment.id);
      expect(new Date(response.body.data.startTime).toISOString()).toBe(new Date(newStart).toISOString());
    });

    it('should retrieve doctor and patient appointments and single appointment', async () => {
      // Create appointment on next Friday 11:00 (avoid unique conflict with earlier Friday 10:00 appointment)
      const nextFriday = new Date();
      const daysUntilFriday = (5 + 7 - nextFriday.getDay()) % 7 || 7;
      nextFriday.setDate(nextFriday.getDate() + daysUntilFriday);
      nextFriday.setHours(11, 0, 0, 0);

      const endTime = new Date(nextFriday);
      endTime.setMinutes(endTime.getMinutes() + 30);

      const createdAppointment = await prisma.appointment.create({
        data: {
          doctorId: doctorId,
          patientId: patientId,
          connectionId: connection.id,
          type: 'IN_CLINIC',
          status: AppointmentStatus.PENDING,
          reason: 'Test appointment for retrieval',
          startTime: nextFriday,
          endTime,
        },
      });

      const createdAppointmentId = createdAppointment.id;

      const doctorAppointments = await request(app.getHttpServer())
        .get(`/api/v1/appointments/doctor/${doctorId}`)
        .expect(200);

      const doctorAppointmentsData = Array.isArray(doctorAppointments.body)
        ? doctorAppointments.body
        : doctorAppointments.body?.data;

      expect(Array.isArray(doctorAppointmentsData)).toBe(true);
      expect(doctorAppointmentsData.length).toBeGreaterThan(0);

      const patientAppointments = await request(app.getHttpServer())
        .get(`/api/v1/appointments/patient/${patientId}`)
        .expect(200);

      const patientAppointmentsData = Array.isArray(patientAppointments.body)
        ? patientAppointments.body
        : patientAppointments.body?.data;

      expect(Array.isArray(patientAppointmentsData)).toBe(true);
      expect(patientAppointmentsData.length).toBeGreaterThan(0);

      const single = await request(app.getHttpServer())
        .get(`/api/v1/appointments/${createdAppointmentId}`)
        .query({ userId: patientId })
        .expect(200);

      expect(single.body.data.id).toBe(createdAppointmentId);
    });
  });
});

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/test-setup';
import { loginAndGetToken, seedDoctor, seedPatient } from './helpers/auth-helpers';
import * as bcrypt from 'bcryptjs';

jest.setTimeout(20000);

describe('Appointments Flow (e2e)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;
  let doctorUserId: string;
  let patientUserId: string;
  let doctorId: string;
  let patientId: string;
  let connectionId: string;
  let appointmentId: string;
  let doctorToken: string;
  let patientToken: string;

  const uniqueSuffix = Math.random().toString(36).slice(2, 8);
  const weekdayNames = [
    'SUNDAY',
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
  ] as const;

  // Keep local date math so it matches slot-generator's expectations.
  function getFutureAppointmentDate() {
    const nextDay = new Date();
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(9, 0, 0, 0);

    if (nextDay <= new Date()) {
      nextDay.setDate(nextDay.getDate() + 1);
    }

    return nextDay;
  }

  beforeAll(async () => {
    const setup = await createTestApp();
    app = setup.app;
    prisma = setup.prisma;

    if (!app) throw new Error('Test app failed to initialize');

    const doctorEmail = `integration-doctor-${uniqueSuffix}@example.com`;
    const patientEmail = `integration-patient-${uniqueSuffix}@example.com`;

    const hashedPassword = await bcrypt.hash('password123', 12);

    const doctorUser = await seedDoctor(prisma, {
      email: doctorEmail,
      firstName: 'Doctor',
      lastName: 'Test',
    });
    doctorUserId = doctorUser.id;
    const doctorProfile = await prisma.doctor.findUnique({
      where: { userId: doctorUserId },
    });
    doctorId = doctorProfile!.id;

    const patientUser = await seedPatient(prisma, {
      email: patientEmail,
      firstName: 'Patient',
      lastName: 'Test',
    });
    patientUserId = patientUser.id;
    const patientProfile = await prisma.patient.findUnique({
      where: { userId: patientUserId },
    });
    patientId = patientProfile!.id;

    const doctorLogin = await loginAndGetToken(
      app,
      doctorEmail,
      'Password123!',
    );
    doctorToken = doctorLogin.accessToken;

    const patientLogin = await loginAndGetToken(
      app,
      patientEmail,
      'Password123!',
    );
    patientToken = patientLogin.accessToken;

    const connection = await prisma.doctorPatientConnection.create({
      data: {
        doctorId,
        patientId,
        status: 'ACTIVE',
      },
    });
    connectionId = connection.id;

    const appointmentDate = getFutureAppointmentDate();
    const dayOfWeek = weekdayNames[appointmentDate.getDay()];

    await prisma.doctorAvailability.create({
      data: {
        doctorId,
        dayOfWeek,
        startTime: 9 * 60,
        endTime: 17 * 60,
        slotDuration: 30,
      },
    });
  });

  afterAll(async () => {
    if (!app) return;
    try {
      await prisma.appointment.deleteMany({ where: { connectionId } });
      await prisma.doctorAvailability.deleteMany({ where: { doctorId } });
      await prisma.doctorPatientConnection.deleteMany({
        where: { id: connectionId },
      });
      await prisma.doctor.deleteMany({ where: { id: doctorId } });
      await prisma.patient.deleteMany({ where: { id: patientId } });
      await prisma.user.deleteMany({
        where: { id: { in: [doctorUserId, patientUserId] } },
      });
    } finally {
      await app.close();
    }
  });

  it('should execute the appointment lifecycle and preserve slot availability behavior', async () => {
    const appointmentDate = getFutureAppointmentDate();
    const appointmentEnd = new Date(appointmentDate.getTime() + 30 * 60 * 1000);

    const bookingResponse = await request(app!.getHttpServer())
      .post('/api/v2/appointments/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .query({ patientId })
      .send({
        doctorId,
        connectionId,
        startTime: appointmentDate.toISOString(),
        type: 'IN_CLINIC',
        reason: 'Integration testing appointment',
        roomNumber: '101',
      })
      .expect(201);

    expect(bookingResponse.body?.data).toMatchObject({
      status: 'PENDING',
      startTime: appointmentDate.toISOString(),
    });

    appointmentId = bookingResponse.body?.data?.id;
    expect(appointmentId).toBeDefined();

    const doctorAppointments = await request(app!.getHttpServer())
      .get(`/api/v2/appointments/appointments/doctor/${doctorId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);
    expect(Array.isArray(doctorAppointments.body?.data)).toBe(true);
    expect(
      doctorAppointments.body.data.some(
        (item: any) => item.id === appointmentId,
      ),
    ).toBe(true);

    const patientAppointments = await request(app!.getHttpServer())
      .get(`/api/v2/appointments/appointments/patient/${patientId}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);
    expect(Array.isArray(patientAppointments.body?.data)).toBe(true);
    expect(
      patientAppointments.body.data.some(
        (item: any) => item.id === appointmentId,
      ),
    ).toBe(true);

    const slotRangeStart = new Date(appointmentDate);
    slotRangeStart.setHours(0, 0, 0, 0);
    const slotRangeEnd = new Date(appointmentDate);
    slotRangeEnd.setHours(23, 59, 59, 999);

    const availableSlots = await request(app!.getHttpServer())
      .get(`/api/v2/appointments/appointments/doctor/${doctorId}/slots`)
      .set('Authorization', `Bearer ${patientToken}`)
      .query({
        startDate: slotRangeStart.toISOString(),
        endDate: slotRangeEnd.toISOString(),
      })
      .expect(200);

    expect(availableSlots.body?.data?.doctorId).toBe(doctorId);
    expect(availableSlots.body?.data?.availableCount).toBeGreaterThan(0);
    expect(
      availableSlots.body.data.slots.some(
        (slot: any) => slot.start === appointmentDate.toISOString(),
      ),
    ).toBe(false);

    const legacySlots = await request(app!.getHttpServer())
      .get('/api/v2/appointments/appointments/slots/available')
      .set('Authorization', `Bearer ${patientToken}`)
      .query({
        doctorId,
        startDate: slotRangeStart.toISOString(),
        endDate: slotRangeEnd.toISOString(),
      })
      .expect(200);

    expect(legacySlots.body?.data?.doctorId).toBe(doctorId);
    expect(Array.isArray(legacySlots.body.data.slots)).toBe(true);

    const rangeSlots = await request(app!.getHttpServer())
      .get(`/api/v2/appointments/appointments/slots/range/${doctorId}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .query({
        start: slotRangeStart.toISOString(),
        end: slotRangeEnd.toISOString(),
      })
      .expect(200);

    expect(rangeSlots.body?.data?.doctorId).toBe(doctorId);
    expect(Array.isArray(rangeSlots.body.data.slots)).toBe(true);

    const nextSlots = await request(app!.getHttpServer())
      .get('/api/v2/appointments/appointments/slots/next')
      .set('Authorization', `Bearer ${patientToken}`)
      .query({ doctorId, days: 7 })
      .expect(200);

    expect(nextSlots.body?.data?.doctorId).toBe(doctorId);
    expect(Array.isArray(nextSlots.body.data.nextSlots)).toBe(true);

    await request(app!.getHttpServer())
      .patch(`/api/v2/appointments/appointments/${appointmentId}/confirm`)
      .set('Authorization', `Bearer ${patientToken}`)
      .query({ patientId })
      .expect(200);

    const newAppointmentDate = new Date(
      appointmentDate.getTime() + 60 * 60 * 1000,
    );

    const rescheduleResponse = await request(app!.getHttpServer())
      .patch(`/api/v2/appointments/appointments/${appointmentId}/reschedule`)
      .set('Authorization', `Bearer ${patientToken}`)
      .query({ patientId })
      .send({
        newStartTime: newAppointmentDate.toISOString(),
        reason: 'Need a later slot',
      })
      .expect(200);

    expect(rescheduleResponse.body?.data?.startTime).toBe(
      newAppointmentDate.toISOString(),
    );
    expect(rescheduleResponse.body?.data?.status).toBe('CONFIRMED');

    const appointmentById = await request(app!.getHttpServer())
      .get(`/api/v2/appointments/appointments/${appointmentId}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .query({ userId: patientId })
      .expect(200);

    expect(appointmentById.body?.data?.id).toBe(appointmentId);
    expect(appointmentById.body?.data?.startTime).toBe(
      newAppointmentDate.toISOString(),
    );

    const cancellationResponse = await request(app!.getHttpServer())
      .patch(`/api/v2/appointments/appointments/${appointmentId}/cancel`)
      .set('Authorization', `Bearer ${patientToken}`)
      .query({ userId: patientId })
      .send({ reason: 'PATIENT_REQUEST' })
      .expect(200);

    expect(cancellationResponse.body?.data?.status).toBe('CANCELLED');
    expect(cancellationResponse.body?.data?.message).toContain('cancelled');
  });
});

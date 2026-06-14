import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { SlotGeneratorService } from './slot-generator.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppointmentStatus } from '@prisma/client';
import { AppointmentRefundPolicy } from '../policies/appointment-refund.policy';

describe('AppointmentsService', () => {
  let service: AppointmentsService;

  const prismaMock = {
    doctorAvailability: { findMany: jest.fn(), findFirst: jest.fn() },
    appointment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    doctorPatientConnection: { findUnique: jest.fn() },
    doctor: { findUnique: jest.fn() },
  };

  const slotGeneratorMock = {
    generateSlots: jest.fn(),
  };

  const notificationsMock = {
    createNotification: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SlotGeneratorService, useValue: slotGeneratorMock },
        { provide: NotificationsService, useValue: notificationsMock },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn(), on: jest.fn(), off: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);

    jest.clearAllMocks();
    notificationsMock.createNotification.mockResolvedValue({ id: 'notif_1' });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAvailableSlots', () => {
    it('throws NotFoundException when doctor has no availability', async () => {
      prismaMock.doctorAvailability.findMany.mockResolvedValue([]);

      await expect(
        service.getAvailableSlots({
          doctorId: 'doc_1',
          startDate: new Date(),
          endDate: new Date(Date.now() + 60_000),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('filters out overlapping booked appointments', async () => {
      const doctorId = 'doc_1';
      const startDate = new Date('2026-01-05T00:00:00.000Z');
      const endDate = new Date('2026-01-05T23:59:59.000Z');

      prismaMock.doctorAvailability.findMany.mockResolvedValue([{ doctorId }]);

      // Two candidate slots
      const slots = [
        {
          start: new Date('2026-01-05T09:00:00.000Z'),
          end: new Date('2026-01-05T09:30:00.000Z'),
        },
        {
          start: new Date('2026-01-05T09:30:00.000Z'),
          end: new Date('2026-01-05T10:00:00.000Z'),
        },
      ];

      slotGeneratorMock.generateSlots.mockResolvedValue(slots);

      // Booked appointment overlaps only the second slot
      prismaMock.appointment.findMany.mockResolvedValue([
        {
          startTime: new Date('2026-01-05T09:45:00.000Z'),
          endTime: new Date('2026-01-05T10:15:00.000Z'),
        },
      ]);

      const result = await service.getAvailableSlots({
        doctorId,
        startDate,
        endDate,
      });

      expect(result.doctorId).toBe(doctorId);
      expect(result.availableCount).toBe(1);
      expect(result.slots).toHaveLength(1);
      expect(result.slots[0].start.toISOString()).toBe(
        '2026-01-05T09:00:00.000Z',
      );
    });
  });

  describe('bookAppointment', () => {
    it('throws BadRequestException when startTime is not in the future', async () => {
      const startTime = new Date(Date.now() - 60_000).toISOString();

      await expect(
        service.bookAppointment('patient_1', {
          doctorId: 'doc_1',
          startTime,
          type: 'CONSULTATION' as any,
          reason: 'test',
          roomNumber: '101',
          connectionId: 'conn_1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates appointment and sends notification', async () => {
      const now = Date.now();
      const startDate = new Date(now + 60 * 60 * 1000);
      const end = new Date(startDate.getTime() + 30 * 60 * 1000);

      prismaMock.doctorAvailability.findFirst.mockResolvedValue({
        id: 'avail_1',
        doctorId: 'doc_1',
        slotDuration: 30,
      });

      prismaMock.doctorPatientConnection.findUnique.mockResolvedValue({
        id: 'conn_1',
        doctorId: 'doc_1',
        patientId: 'patient_1',
      });

      prismaMock.appointment.findFirst.mockResolvedValue(null); // no conflicts

      // Generate slots and include exactly the start time so it's valid
      slotGeneratorMock.generateSlots.mockResolvedValue([
        { start: startDate, end },
      ]);

      prismaMock.appointment.create.mockResolvedValue({
        id: 'app_1',
        doctorId: 'doc_1',
        patientId: 'patient_1',
        connectionId: 'conn_1',
        startTime: startDate,
        endTime: end,
        type: 'CONSULTATION',
        reason: 'test',
        roomNumber: '101',
        status: AppointmentStatus.PENDING,
        patient: { user: { firstName: 'P', lastName: 'T' } },
        doctor: { user: { firstName: 'D', lastName: 'O' } },
      });

      const result = await service.bookAppointment('patient_1', {
        doctorId: 'doc_1',
        startTime: startDate.toISOString(),
        type: 'CONSULTATION' as any,
        reason: 'test',
        roomNumber: '101',
        connectionId: 'conn_1',
      });

      expect(prismaMock.appointment.create).toHaveBeenCalled();

      // service emits notification.trigger via EventEmitter2
      expect((service as any).eventEmitter.emit).toHaveBeenCalledWith(
        'notification.trigger',
        expect.objectContaining({
          userId: 'doc_1',
          type: expect.any(String),
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: 'app_1',
          status: AppointmentStatus.PENDING,
        }),
      );
    });
  });

  describe('confirmAppointment', () => {
    it('updates appointment to CONFIRMED and notifies doctor', async () => {
      const appointmentId = 'app_1';
      const patientId = 'patient_1';

      const startTime = new Date('2026-01-05T10:00:00.000Z');

      prismaMock.appointment.update.mockResolvedValue({
        id: appointmentId,
        status: AppointmentStatus.CONFIRMED,
        doctorId: 'doc_1',
        startTime,
        // service.confirmAppointment reads updateAppoinment.patient.user.*
        patient: { user: { firstName: 'P', lastName: 'T' } },
      });

      const result = await service.confirmAppointment(appointmentId, patientId);

      expect(prismaMock.appointment.update).toHaveBeenCalled();

      expect((service as any).eventEmitter.emit).toHaveBeenCalledWith(
        'notification.trigger',
        expect.objectContaining({
          userId: 'doc_1',
          type: expect.any(String),
          data: expect.objectContaining({
            appointmentId: appointmentId,
          }),
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: appointmentId,
          status: AppointmentStatus.CONFIRMED,
        }),
      );
    });

    it('throws BadRequestException on prisma P2025', async () => {
      const err: any = new Error('not found');
      err.code = 'P2025';

      prismaMock.appointment.update.mockRejectedValue(err);

      await expect(
        service.confirmAppointment('app_404', 'patient_1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('completeAppointment', () => {
    it('completes a confirmed appointment successfully', async () => {
      const appointmentId = 'app_1';
      const startTime = new Date('2026-01-05T10:00:00.000Z');
      const endTime = new Date('2026-01-05T10:30:00.000Z');

      prismaMock.appointment.findUnique.mockResolvedValue({
        id: appointmentId,
        status: AppointmentStatus.CONFIRMED,
      });

      prismaMock.appointment.update.mockResolvedValue({
        id: appointmentId,
        status: AppointmentStatus.COMPLETED,
        startTime,
        endTime,
      });

      const result = await service.completeAppointment(appointmentId);

      expect(prismaMock.appointment.findUnique).toHaveBeenCalledWith({
        where: { id: appointmentId },
        select: { id: true, status: true },
      });
      expect(prismaMock.appointment.update).toHaveBeenCalledWith({
        where: { id: appointmentId },
        data: { status: AppointmentStatus.COMPLETED },
        select: { id: true, status: true, startTime: true, endTime: true },
      });
      expect(result).toEqual({
        id: appointmentId,
        status: AppointmentStatus.COMPLETED,
        startTime,
        endTime,
        message: 'Appointment completed successfully',
      });
    });

    it('throws NotFoundException when appointment does not exist', async () => {
      prismaMock.appointment.findUnique.mockResolvedValue(null);

      await expect(
        service.completeAppointment('app_404'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when appointment cannot be completed', async () => {
      prismaMock.appointment.findUnique.mockResolvedValue({
        id: 'app_1',
        status: AppointmentStatus.CANCELLED,
      });

      await expect(service.completeAppointment('app_1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('cancelAppointment', () => {
    it('cancels appointment and sends cancellation notification with refund calc', async () => {
      const appointmentId = 'app_1';
      const userId = 'doc_1';
      const now = new Date();
      const startTime = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

      const updated = {
        id: appointmentId,
        status: AppointmentStatus.CANCELLED,
        startTime,
        cancelledAt: now,
        cancelledBy: userId,
        doctorId: 'doc_1',
        patientId: 'patient_1',
      };

      prismaMock.appointment.update.mockResolvedValue(updated as any);

      const expectedRefund = AppointmentRefundPolicy.calculate({
        isDoctorCancelling: true,
        appointmentStartMs: startTime.getTime(),
        cancellationTimestampMs: now.getTime(),
      });

      const result = await service.cancelAppointment(appointmentId, userId, {
        reason: '  too late  ',
      } as any);

      expect(prismaMock.appointment.update).toHaveBeenCalled();

      // service.cancelAppointment emits notification.trigger via EventEmitter2
      expect((service as any).eventEmitter.emit).toHaveBeenCalledWith(
        'notification.trigger',
        expect.objectContaining({
          userId: 'patient_1',
          type: expect.any(String),
          data: expect.objectContaining({
            appointmentId,
            refundEligible: expectedRefund.eligible,
          }),
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: appointmentId,
          status: AppointmentStatus.CANCELLED,
          refund: expect.objectContaining({
            eligible: expectedRefund.eligible,
            percentage: expectedRefund.percentage,
          }),
          message: expect.stringContaining('cancelled'),
        }),
      );
    });

    it('returns already cancelled response when appointment already cancelled', async () => {
      const appointmentId = 'app_1';
      const userId = 'doc_1';
      const now = new Date();
      const startTime = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

      const p2025: any = new Error('not allowed');
      p2025.code = 'P2025';

      prismaMock.appointment.update.mockRejectedValue(p2025);

      prismaMock.appointment.findUnique.mockResolvedValue({
        id: appointmentId,
        status: AppointmentStatus.CANCELLED,
        startTime,
        cancelledAt: now,
        cancelledBy: userId,
        doctorId: 'doc_1',
        patientId: 'patient_1',
      });

      const result = await service.cancelAppointment(appointmentId, userId, {
        reason: 'x',
      } as any);

      expect(result.message).toContain('already cancelled');
      expect(result.id).toBe(appointmentId);
    });

    it('throws if prisma cancel fails with non P2025 error', async () => {
      const appointmentId = 'app_1';
      const userId = 'doc_1';

      prismaMock.appointment.update.mockRejectedValue(new Error('db down'));

      await expect(
        service.cancelAppointment(appointmentId, userId, {
          reason: 'x',
        } as any),
      ).rejects.toBeInstanceOf(Error);
    });
  });
});

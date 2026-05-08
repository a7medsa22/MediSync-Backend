import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SlotGeneratorService } from './slot-generator.service';
import { AvailableSlotsResponse, CancelAppointmentDto, CreateAppointmentDto, GetAvailableSlots, RescheduleAppointmentDto } from '../dto/appointment.dto';
import { AppointmentStatusPolicy } from '../policies/appointment-status.policy';
import { AppointmentRefundPolicy } from '../policies/appointment-refund.policy';
import { Appointment, AppointmentStatus, NotificationType } from '@prisma/client';
import { NotificationsService } from 'src/notifications/notifications.service';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slotService: SlotGeneratorService,
    private readonly notificationsService: NotificationsService

  ) { }
  async getAvailableSlots(params: GetAvailableSlots): Promise<AvailableSlotsResponse> {
    const { doctorId, startDate, endDate } = params;

    const availabilities = await this.prisma.doctorAvailability.findMany({
      where: { doctorId, }
    })
    if (!availabilities.length)
      throw new NotFoundException('Doctor has not set availability');

    const slots = await this.slotService.generateSlots({ doctorId, startDate, endDate });

    const bookedAppointments = await this.prisma.appointment.findMany({
      where: {
        doctorId,
        startTime: { gte: startDate },
        endTime: { lte: endDate },
        status: { in: AppointmentStatusPolicy.activeStatuses() },
      },
      select: { startTime: true, endTime: true }
    });

    const availableSlots = slots.filter(
      (slot) =>
        !bookedAppointments.some(
          (booked) =>
            slot.start < booked.endTime && slot.end > booked.startTime,
        ),
    );

    return {
      doctorId,
      availableCount: availableSlots.length,
      slots: availableSlots.slice(0, 100),
    }
  }

  async getDoctorAppointments(
    doctorId: string,
    status?: AppointmentStatus,
  ) {
    return this.prisma.appointment.findMany({
      where: {
        doctorId,
        status: status ?? undefined,
      },
      orderBy: { startTime: 'asc' },
    });
  }

  async getPatientAppointments(
    patientId: string,
    status?: AppointmentStatus,
  ) {
    return this.prisma.appointment.findMany({
      where: {
        patientId,
        status: status ?? undefined,
      },
      orderBy: { startTime: 'asc' },
    });
  }

  async getAppointmentById(appointmentId: string, userId?: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (userId) {
      this.validateAppointmentOwnership(appointment, userId);
    }

    return appointment;
  }

  async scheduleReminders(appointment: Appointment) {
    const dateText = appointment.startTime.toDateString();
    const timeText = appointment.startTime.toLocaleTimeString();

    await Promise.all([
      this.createAppointmentNotification({
        userId: appointment.patientId,
        type: NotificationType.APPOINTMENT_REMINDER,
        title: 'Appointment Reminder',
        message: `Reminder: your appointment is scheduled for ${dateText} at ${timeText}.`,
        metadata: { appointmentId: appointment.id, reminderType: 'scheduled' },
      }),
      this.createAppointmentNotification({
        userId: appointment.doctorId,
        type: NotificationType.APPOINTMENT_REMINDER,
        title: 'Appointment Reminder',
        message: `Reminder: you have an appointment scheduled for ${dateText} at ${timeText}.`,
        metadata: { appointmentId: appointment.id, reminderType: 'scheduled' },
      }),
    ]);

    return true;
  }

  async sendReminder(appointmentId: string, timeframe: string) {
    const appointment = await this.getAppointmentById(appointmentId);
    const dateText = appointment.startTime.toDateString();
    const timeText = appointment.startTime.toLocaleTimeString();
    const reminderLabel = timeframe === '24h' ? '24 hours' : timeframe === '1h' ? '1 hour' : timeframe;

    await Promise.all([
      this.createAppointmentNotification({
        userId: appointment.patientId,
        type: NotificationType.APPOINTMENT_REMINDER,
        title: `Appointment Reminder (${reminderLabel})`,
        message: `Reminder: your appointment is in ${reminderLabel} on ${dateText} at ${timeText}.`,
        metadata: { appointmentId: appointment.id, timeframe },
      }),
      this.createAppointmentNotification({
        userId: appointment.doctorId,
        type: NotificationType.APPOINTMENT_REMINDER,
        title: `Appointment Reminder (${reminderLabel})`,
        message: `Reminder: your appointment is in ${reminderLabel} on ${dateText} at ${timeText}.`,
        metadata: { appointmentId: appointment.id, timeframe },
      }),
    ]);

    return { reminderSent: true, timeframe };
  }

  async bookAppointment(patientId: string, createDto: CreateAppointmentDto) {
    const { doctorId, startTime, type, reason, roomNumber } = createDto;
    const start = new Date(startTime);

    this.validateFutureDate(start);

    const availability = await this.getDoctorAvailability(doctorId);
    const end = this.calculateAppointmentEnd(start, availability.slotDuration);

    await this.validateDoctorPatientConnection(doctorId, patientId);
    await this.validateConflictingAppointments(doctorId, start, end);
    await this.validateSlotAvailability(doctorId, start, end);

    const appointment = await this.prisma.appointment.create({
      data: {
        doctorId,
        patientId,
        connectionId: createDto.connectionId,
        startTime: start,
        endTime: end,
        type,
        reason,
        roomNumber,
        status: AppointmentStatus.PENDING,
      },
      include: {
        doctor: {
          select: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        patient: {
          select: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    await this.createAppointmentNotification({
      userId: doctorId,
      type: NotificationType.APPOINTMENT_BOOKED,
      title: 'New Appointment Request',
      message: `${appointment.patient.user.firstName} ${appointment.patient.user.lastName} booked appointment for ${start.toDateString()} at ${start.toLocaleTimeString()}`,
      metadata: { appointmentId: appointment.id },
    });

    return {
      ...this.mapAppointmentResponse(appointment),
      message: 'Appointment booked successfully. Awaiting doctor confirmation.',
    };
  }

  async confirmAppointment(appointmentId: string, patientId: string) {
    try {
      const updateAppoinment = await this.prisma.appointment.update({
        where: {
          id: appointmentId,
          patientId,
          status: { in: AppointmentStatusPolicy.confirmableStatuses() }
        },
        data: {
          status: AppointmentStatus.CONFIRMED
        },
        select: {
          id: true, status: true, doctorId: true, startTime: true
        }
      });

      // Notify doctor
      await this.notificationsService.createNotification({
        userId: updateAppoinment.doctorId,
        type: NotificationType.APPOINTMENT_CONFIRMED,
        title: 'Appointment Confirmed',
        message: `Patient confirmed appointment at ${updateAppoinment.startTime.toDateString()}`,
      });

      return updateAppoinment

    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new BadRequestException('Action not allowed or appointment not found');
      }
      throw error
    }
  }
  async cancelAppointment(
    appointmentId: string,
    userId: string,
    cancelDto: CancelAppointmentDto,
  ) {
    const reason = cancelDto.reason?.trim();
    const now = new Date();

    try {
      const updated = await this.prisma.appointment.update({
        where: {
          id: appointmentId,
          status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
          OR: [{ doctorId: userId }, { patientId: userId }],
        },
        data: {
          status: AppointmentStatus.CANCELLED,
          cancelledAt: now,
          cancelledBy: userId,
          cancellationReason: reason,
        },
        select: {
          id: true,
          status: true,
          startTime: true,
          cancelledAt: true,
          cancelledBy: true,
          doctorId: true,
          patientId: true,
        },
      });

      const refund = this.calculateCancellationRefund(
        updated.doctorId === userId,
        updated.startTime.getTime(),
        now.getTime(),
      );

      await this.createAppointmentNotification({
        userId: updated.doctorId === userId ? updated.patientId : updated.doctorId,
        type: NotificationType.APPOINTMENT_CANCELLED,
        title: 'Appointment Cancelled',
        message: `Your appointment scheduled for ${updated.startTime.toDateString()} has been cancelled.`,
        metadata: { appointmentId: updated.id, refundEligible: refund.eligible },
      });

      return this.buildCancellationResponse(updated, refund, 'Appointment cancelled successfully');
    } catch (error: any) {
      if (error.code === 'P2025') {
        const existing = await this.prisma.appointment.findUnique({
          where: { id: appointmentId },
          select: {
            id: true,
            status: true,
            startTime: true,
            cancelledAt: true,
            cancelledBy: true,
            doctorId: true,
            patientId: true,
          },
        });

        if (existing?.status === AppointmentStatus.CANCELLED) {
          const refund = this.calculateCancellationRefund(
            existing.cancelledBy === existing.doctorId,
            existing.startTime.getTime(),
            existing.cancelledAt?.getTime() ?? now.getTime(),
          );

          return this.buildCancellationResponse(existing, refund, 'Appointment was already cancelled');
        }

        throw new BadRequestException('Appointment not found or cannot be cancelled');
      }

      throw error;
    }
  }

  async rescheduleAppointment(appointmentId: string, patientId: string, rescheduleDto: RescheduleAppointmentDto) {
    const { newStartTime, reason } = rescheduleDto;
    const newStart = new Date(newStartTime);

    this.validateFutureDate(newStart);

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        patientId,
        status: { in: AppointmentStatusPolicy.activeStatuses() },
      },
      select: {
        id: true,
        doctorId: true,
        startTime: true,
        status: true,
      },
    });

    if (!appointment) {
      throw new BadRequestException('Appointment not found or cannot be rescheduled');
    }

    const availability = await this.getDoctorAvailability(appointment.doctorId);
    const newEnd = this.calculateAppointmentEnd(newStart, availability.slotDuration);

    await this.validateConflictingAppointments(appointment.doctorId, newStart, newEnd, appointmentId);
    await this.validateSlotAvailability(appointment.doctorId, newStart, newEnd);

    const updated = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        startTime: newStart,
        endTime: newEnd,
        reason: reason ? `Rescheduled: ${reason}` : undefined,
      },
      select: {
        id: true,
        status: true,
        startTime: true,
        endTime: true,
      },
    });

    return {
      ...this.mapAppointmentResponse(updated),
      message: 'Appointment rescheduled successfully',
    };
  }
  private async getDoctorAvailability(doctorId: string) {
    const availability = await this.prisma.doctorAvailability.findFirst({
      where: { doctorId },
    });

    if (!availability) {
      throw new NotFoundException(
        'Doctor has not set availability',
      );
    }

    return availability;
  }
  private calculateAppointmentEnd(
    start: Date,
    durationMinutes: number,
  ) {
    return new Date(
      start.getTime() + durationMinutes * 60 * 1000,
    );
  }
  private validateFutureDate(date: Date) {
    if (date <= new Date()) {
      throw new BadRequestException(
        'Date must be in the future',
      );
    }

    return true;
  }
  private validateAppointmentStatus(
    currentStatus: AppointmentStatus,
    allowedStatuses: AppointmentStatus[],
  ) {
    if (!allowedStatuses.includes(currentStatus)) {
      throw new BadRequestException(
        `Invalid appointment status: ${currentStatus}`,
      );
    }

    return true;
  }

  private validateAppointmentOwnership(
    appointment: {
      doctorId: string;
      patientId: string;
    },
    userId: string,
  ) {
    const isDoctor = appointment.doctorId === userId;
    const isPatient = appointment.patientId === userId;

    if (!isDoctor && !isPatient) {
      throw new ForbiddenException(
        'You are not allowed to access this appointment',
      );
    }

    return {
      isDoctor,
      isPatient,
    };
  }

  private async validateDoctorPatientConnection(

    doctorId: string,
    patientId: string,
  ) {
    const connection =
      await this.prisma.doctorPatientConnection.findUnique({
        where: {
          doctorId_patientId: {
            doctorId,
            patientId,
          },
        },
      });

    if (!connection) {
      throw new NotFoundException(
        'Connection does not exist',
      );
    }

    return connection;
  }
  private async validateConflictingAppointments(
    doctorId: string,
    start: Date,
    end: Date,
    appointmentId?: string,
  ) {
    const conflicting =
      await this.prisma.appointment.findFirst({
        where: {
          doctorId,
          id: appointmentId
            ? { not: appointmentId }
            : undefined,

          startTime: { lt: end },
          endTime: { gt: start },

          status: {
            in: AppointmentStatusPolicy.activeStatuses(),
          },
        },
      });

    if (conflicting) {
      throw new BadRequestException(
        'Time slot is already booked',
      );
    }

    return true;
  }
  private async validateSlotAvailability(
    doctorId: string,
    start: Date,
    end: Date,
  ) {
    const slots =
      await this.slotService.generateSlots({
        doctorId,
        startDate: start,
        endDate: end,
      });

    const isValidSlot = slots.some(
      (slot) =>
        slot.start.getTime() === start.getTime(),
    );

    if (!isValidSlot) {
      throw new BadRequestException(
        'Invalid slot',
      );
    }

    return true;
  }

  private async createAppointmentNotification(
    params: {
      userId: string;
      type: NotificationType;
      title: string;
      message: string;
      metadata?: Record<string, any>;
    },
  ) {
    return this.notificationsService.createNotification({
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      metadata: params.metadata,
    });
  }
  private mapAppointmentResponse(
    appointment: {
      id: string;
      status: AppointmentStatus;
      startTime: Date;
      endTime: Date;
    },
  ) {
    return {
      id: appointment.id,
      status: appointment.status,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
    };
  }

  private buildCancellationResponse(
    appointment: {
      id: string;
      status: AppointmentStatus;
      cancelledAt: Date | null;
    },
    refund: { eligible: boolean; percentage: number; amount?: number | null },
    message: string,
  ) {
    return {
      id: appointment.id,
      status: appointment.status,
      cancelledAt: appointment.cancelledAt,
      refund: {
        eligible: refund.eligible,
        percentage: refund.percentage,
        amount: refund.amount ?? null,
      },
      message,
    };
  }

  private calculateCancellationRefund(
    isDoctorCancelling: boolean,
    appointmentStartMs: number,
    cancellationTimestampMs: number,
  ) {
    return AppointmentRefundPolicy.calculate({
      isDoctorCancelling,
      appointmentStartMs,
      cancellationTimestampMs,
    });
  }

}

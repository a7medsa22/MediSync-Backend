import { NotificationHandler } from '../interfaces/notification-handler.interface';
import { NotificationsType as T } from '../enums/notifications.enum';
export class AppointmentHandler implements NotificationHandler {
  build(
    data: any,
    type: T,
  ): { title: string; message: string; metadata?: any } {
    switch (type) {
      case T.APPOINTMENT_CONFIRMED:
        return {
          title: 'Appointment Confirmed',
          message: `${data.patientName} confirmed the appointment.`,
          metadata: { appointmentId: data.appointmentId, status: 'confirmed' },
        };
      case T.APPOINTMENT_CANCELLED:
        return {
          title: 'Appointment Cancelled',
          message: `Your appointment scheduled for ${data.date} has been cancelled.`,
          metadata: {
            appointmentId: data.appointmentId,
            refundEligible: data.refundEligible,
          },
        };

      case T.APPOINTMENT_REMINDER:
        return {
          title: data.title || 'Appointment Reminder',
          message:
            data.message ||
            `Reminder: You have an appointment tomorrow with Dr. ${data.doctorName}`,
          metadata: { appointmentId: data.appointmentId, ...data.metadata },
        };

      default:
        return {
          title: 'New Appointment Request',
          message: `${data.patientName} booked appointment for ${data.date} at ${data.time}`,
          metadata: { appointmentId: data.appointmentId },
        };
    }
  }
}

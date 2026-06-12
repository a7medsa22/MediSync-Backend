import { NotificationsType } from "./enums/notifications.enum";
import { AppointmentHandler } from "./handlers/appointment.handler";
import { ChatHandler } from "./handlers/chat.handler";
import { ConnectionHandler } from "./handlers/connection.handler";
import { PrescriptionHandler } from "./handlers/prescription.handler";
import { SystemHandler } from "./handlers/system.handler";

export const notificationRegistry = {
    [NotificationsType.CONNECTION_REQUEST]:
        new ConnectionHandler(),
    'CONNECTION_REQUEST':
        new ConnectionHandler(),

    [NotificationsType.CONNECTION_ACCEPTED]:
        new ConnectionHandler(),
    'CONNECTION_ACCEPTED':
        new ConnectionHandler(),

    [NotificationsType.NEW_CONNECTION]:
        new ConnectionHandler(),
    'NEW_CONNECTION':
        new ConnectionHandler(),

    [NotificationsType.NEW_MESSAGE]:
        new ChatHandler(),
    'NEW_MESSAGE':
        new ChatHandler(),

    [NotificationsType.NEW_CHAT_MESSAGE]:
        new ChatHandler(),
    'NEW_CHAT_MESSAGE':
        new ChatHandler(),

    [NotificationsType.APPOINTMENT_BOOKED]:
        new AppointmentHandler(),
    'APPOINTMENT_BOOKED':
        new AppointmentHandler(),

    [NotificationsType.APPOINTMENT_CONFIRMED]:
        new AppointmentHandler(),
    'APPOINTMENT_CONFIRMED':
        new AppointmentHandler(),

    [NotificationsType.APPOINTMENT_REMINDER]:
        new AppointmentHandler(),
    'APPOINTMENT_REMINDER':
        new AppointmentHandler(),

    [NotificationsType.APPOINTMENT_CANCELLED]:
        new AppointmentHandler(),
    'APPOINTMENT_CANCELLED':
        new AppointmentHandler(),

    [NotificationsType.PRESCRIPTION_RENEWAL_REQUEST]:
        new PrescriptionHandler(),
    'PRESCRIPTION_RENEWAL_REQUEST':
        new PrescriptionHandler(),

    [NotificationsType.PRESCRIPTION_EXPIRY_WARNING]:
        new PrescriptionHandler(),
    'PRESCRIPTION_EXPIRY_WARNING':
        new PrescriptionHandler(),

    [NotificationsType.NEW_PRESCRIPTION]:
        new PrescriptionHandler(),
    'NEW_PRESCRIPTION':
        new PrescriptionHandler(),

    [NotificationsType.PRESCRIPTION_CANCELLED]:
        new PrescriptionHandler(),
    'PRESCRIPTION_CANCELLED':
        new PrescriptionHandler(),

    [NotificationsType.PRESCRIPTION_RENEWAL_APPROVED]:
        new PrescriptionHandler(),
    'PRESCRIPTION_RENEWAL_APPROVED':
        new PrescriptionHandler(),

    [NotificationsType.PRESCRIPTION_RENEWAL_REJECTED]:
        new PrescriptionHandler(),
    'PRESCRIPTION_RENEWAL_REJECTED':
        new PrescriptionHandler(),

    [NotificationsType.QR_SCANNED]:
        new SystemHandler(),
    'QR_SCANNED':
        new SystemHandler(),

    [NotificationsType.PRESCRIPTION_EXPIRY_REMINDER]:
        new PrescriptionHandler(),
    'PRESCRIPTION_EXPIRY_REMINDER':
        new PrescriptionHandler(),

    // Fallback when registry doesn't have a handler for the incoming type
    SYSTEM_DEFAULT: new SystemHandler(),
};

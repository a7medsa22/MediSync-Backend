import { NotificationsType } from "./enums/notifications.enum";
import { AppointmentHandler } from "./handlers/appointment.handler";
import { ChatHandler } from "./handlers/chat.handler";
import { ConnectionHandler } from "./handlers/connection.handler";
import { PrescriptionHandler } from "./handlers/prescription.handler";
import { SystemHandler } from "./handlers/system.handler";

export const notificationRegistry = {
    [NotificationsType.CONNECTION_REQUEST]:
        new ConnectionHandler(),

    [NotificationsType.CONNECTION_ACCEPTED]:
        new ConnectionHandler(),

    [NotificationsType.NEW_CONNECTION]:
        new ConnectionHandler(),

    [NotificationsType.NEW_MESSAGE]:
        new ChatHandler(),

    [NotificationsType.NEW_CHAT_MESSAGE]:
        new ChatHandler(),

    [NotificationsType.APPOINTMENT_BOOKED]:
        new AppointmentHandler(),

    [NotificationsType.APPOINTMENT_CONFIRMED]:
        new AppointmentHandler(),

    [NotificationsType.APPOINTMENT_REMINDER]:
        new AppointmentHandler(),

    [NotificationsType.APPOINTMENT_CANCELLED]:
        new AppointmentHandler(),


    [NotificationsType.PRESCRIPTION_RENEWAL_REQUEST]:
        new PrescriptionHandler(),

    [NotificationsType.PRESCRIPTION_EXPIRY_WARNING]:
        new PrescriptionHandler(),

    [NotificationsType.NEW_PRESCRIPTION]:
        new PrescriptionHandler(),

    [NotificationsType.PRESCRIPTION_CANCELLED]:
        new PrescriptionHandler(),

    [NotificationsType.QR_SCANNED]:
        new SystemHandler(),

    // Fallback when registry doesn't have a handler for the incoming type
    SYSTEM_DEFAULT: new SystemHandler(),
};

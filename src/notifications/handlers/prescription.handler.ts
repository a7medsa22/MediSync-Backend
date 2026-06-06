import { NotificationHandler } from "../interfaces/notification-handler.interface";
import { NotificationsType as T } from "../enums/notifications.enum";

export class PrescriptionHandler implements NotificationHandler {
    build(data: any, type: T): { title: string; message: string; metadata?: any; } {
        switch (type) {
            case T.PRESCRIPTION_RENEWAL_REQUEST:
                return {
                    title: 'Prescription Renewal Request',
                    message: `Patient ${data.patientName} has requested a renewal for ${data.medicationName}`,
                    metadata: {
                        patientId: data.patientId,
                        prescriptionId: data.prescriptionId,
                    },
                };
            case T.NEW_PRESCRIPTION:
                return {
                    title: 'New Prescription',
                    message: `Dr. ${data.doctorName} has prescribed new medication for you.`,
                    metadata: {
                        prescriptionId: data.prescriptionId,
                        actionUrl: data.actionUrl,
                    },
                };
            case T.PRESCRIPTION_CANCELLED:
                return {
                    title: 'Prescription Cancelled',
                    message: `Dr. ${data.doctorName} has cancelled your prescription for ${data.medicationName || 'medication'}. Reason: ${data.reason}`,
                    metadata: {
                        prescriptionId: data.prescriptionId,
                        reason: data.reason,
                    },
                };
            case T.PRESCRIPTION_RENEWAL_APPROVED:
                return {
                    title: 'Renewal Approved',
                    message: `Dr. ${data.doctorName} has approved your renewal request for ${data.medicationName || 'medication'}.`,
                    metadata: {
                        prescriptionId: data.prescriptionId,
                    },
                };
            case T.PRESCRIPTION_RENEWAL_REJECTED:
                return {
                    title: 'Renewal Rejected',
                    message: `Dr. ${data.doctorName} has rejected your renewal request. Reason: ${data.reason}`,
                    metadata: {
                        prescriptionId: data.prescriptionId,
                        reason: data.reason,
                    },
                };
            case T.PRESCRIPTION_EXPIRY_REMINDER:
                return {
                    title: 'Prescription Expiry Reminder',
                    message: `Your prescription for ${data.medicationName} is expiring on ${data.expiryDate}. Please contact your doctor for renewal if needed.`,
                    metadata: {
                        prescriptionId: data.prescriptionId,
                        expiryDate: data.expiryDate,
                    },
                };
            default:
                return {
                    title: 'Prescription Notification',
                    message: `A new prescription has been added for ${data.medicationName}`,
                    metadata: {
                        patientId: data.patientId,
                        prescriptionId: data.prescriptionId,
                    },
                };
        }
    }
}
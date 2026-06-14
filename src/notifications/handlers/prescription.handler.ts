import { NotificationsType } from '../enums/notifications.enum';
import { NotificationHandler } from '../interfaces/notification-handler.interface';

export class PrescriptionHandler implements NotificationHandler {
  build(
    data: any,
    type: NotificationsType,
  ): { title: string; message: string; metadata?: any } {
    switch (type) {
      case NotificationsType.PRESCRIPTION_RENEWAL_REQUEST:
        return {
          title: 'Prescription Renewal Request',
          message: `Patient ${data.patientName} has requested a renewal for ${data.medicationName}`,
          metadata: {
            patientId: data.patientId,
            prescriptionId: data.prescriptionId,
          },
        };
      case NotificationsType.NEW_PRESCRIPTION:
        return {
          title: 'New Prescription',
          message: `Dr. ${data.doctorName} has prescribed new medication for you.`,
          metadata: {
            prescriptionId: data.prescriptionId,
            actionUrl: data.actionUrl,
          },
        };
      case NotificationsType.PRESCRIPTION_CANCELLED:
        return {
          title: 'Prescription Cancelled',
          message: `Dr. ${data.doctorName} has cancelled your prescription for ${data.medicationName || 'medication'}. Reason: ${data.reason}`,
          metadata: {
            prescriptionId: data.prescriptionId,
            reason: data.reason,
          },
        };
      case NotificationsType.PRESCRIPTION_RENEWAL_APPROVED:
        return {
          title: 'Renewal Approved',
          message: `Dr. ${data.doctorName} has approved your renewal request for ${data.medicationName || 'medication'}.`,
          metadata: {
            prescriptionId: data.prescriptionId,
          },
        };
      case NotificationsType.PRESCRIPTION_RENEWAL_REJECTED:
        return {
          title: 'Renewal Rejected',
          message: `Dr. ${data.doctorName} has rejected your renewal request. Reason: ${data.reason}`,
          metadata: {
            prescriptionId: data.prescriptionId,
            reason: data.reason,
          },
        };
      case NotificationsType.PRESCRIPTION_EXPIRY_WARNING:
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

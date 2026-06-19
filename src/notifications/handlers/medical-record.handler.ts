import { NotificationHandler } from '../interfaces/notification-handler.interface';
import { NotificationsType as T } from '../enums/notifications.enum';

export class MedicalRecordHandler implements NotificationHandler {
  build(
    data: any,
    type: T,
  ): { title: string; message: string; metadata?: any } {
    switch (type) {
      case T.MEDICAL_RECORD_SHARED:
        return {
          title: 'Medical Record Shared',
          message: `A medical record "${data.recordTitle}" belonging to ${data.patientName} has been shared with you.`,
          metadata: {
            recordId: data.recordId,
            patientName: data.patientName,
            recordTitle: data.recordTitle,
            actionUrl: data.actionUrl,
          },
        };
      case T.MEDICAL_RECORD_UPLOADED:
        return {
          title: 'Medical Record Uploaded',
          message: `A new medical record "${data.title}" has been uploaded.`,
          metadata: {
            recordId: data.recordId,
            title: data.title,
            actionUrl: data.actionUrl,
          },
        };
      default:
        return {
          title: 'Medical Record Notification',
          message: data.message || 'Medical record update',
          metadata: {
            recordId: data.recordId,
          },
        };
    }
  }
}

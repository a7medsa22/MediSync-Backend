import { NotificationHandler } from '../interfaces/notification-handler.interface';
import { NotificationsType as T } from '../enums/notifications.enum';

export class ClinicHandler implements NotificationHandler {
  build(
    data: any,
    type: T,
  ): { title: string; message: string; metadata?: any } {
    switch (type) {
      case T.CLINIC_VERIFIED:
        return {
          title: 'Clinic Verified',
          message: 'Your clinic has been verified and is now searchable',
          metadata: {
            clinicId: data.clinicId,
          },
        };
      case T.CLINIC_REJECTED:
        return {
          title: 'Clinic Rejected',
          message: `Your clinic was rejected${data.rejectionReason ? `: ${data.rejectionReason}` : ''}`,
          metadata: {
            clinicId: data.clinicId,
            rejectionReason: data.rejectionReason,
          },
        };
      default:
        return {
          title: 'Clinic Notification',
          message: data.message || 'Clinic status update',
          metadata: {
            clinicId: data.clinicId,
          },
        };
    }
  }
}

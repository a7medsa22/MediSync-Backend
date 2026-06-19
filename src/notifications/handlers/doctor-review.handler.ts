import { NotificationHandler } from '../interfaces/notification-handler.interface';
import { NotificationsType as T } from '../enums/notifications.enum';

export class DoctorReviewHandler implements NotificationHandler {
  build(
    data: any,
    type: T,
  ): { title: string; message: string; metadata?: any } {
    return {
      title: 'New Review Received',
      message: `You received a new ${data.rating}-star review: "${data.comment || 'No comment provided'}"`,
      metadata: {
        rating: data.rating,
        comment: data.comment,
        actionUrl: data.actionUrl,
      },
    };
  }
}

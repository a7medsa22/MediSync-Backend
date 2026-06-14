import { NotificationHandler } from '../interfaces/notification-handler.interface';
import { NotificationsType as T } from '../enums/notifications.enum';
export class SystemHandler implements NotificationHandler {
  build(
    data: any,
    type: T,
  ): { title: string; message: string; metadata?: any } {
    return {
      title: 'System Notification',
      message: `A system event occurred: ${data.eventType}`,
      metadata: {
        scannerId: data.scannerId,
      },
    };
  }
}

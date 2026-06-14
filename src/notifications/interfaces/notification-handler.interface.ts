import { NotificationsType } from '../enums/notifications.enum';

export interface NotificationHandler {
  build(
    data: any,
    type: NotificationsType,
  ): {
    title: string;
    message: string;
    metadata?: any;
  };
}

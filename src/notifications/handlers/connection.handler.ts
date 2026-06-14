import { NotificationHandler } from '../interfaces/notification-handler.interface';
import { NotificationsType as T } from '../enums/notifications.enum';

export class ConnectionHandler implements NotificationHandler {
  build(
    data: any,
    type: T,
  ): { title: string; message: string; metadata?: any } {
    switch (type) {
      case T.CONNECTION_REQUEST:
        return {
          title: 'New Connection Request',
          message: `${data.senderName} sent you a connection request`,
          metadata: {
            senderId: data.senderId,
          },
        };
      case T.CONNECTION_ACCEPTED:
        return {
          title: 'Connection Accepted',
          message: `${data.senderName} accepted your connection request`,
          metadata: {
            senderId: data.senderId,
          },
        };
      case T.NEW_CONNECTION:
        return {
          title: 'New Connection Established',
          message: `You are now connected with ${data.senderName}`,
          metadata: {
            senderId: data.senderId,
          },
        };
      default:
        return {
          title: 'Connection Notification',
          message: `${data.senderName} sent you a connection request`,
          metadata: {
            senderId: data.senderId,
          },
        };
    }
  }
}

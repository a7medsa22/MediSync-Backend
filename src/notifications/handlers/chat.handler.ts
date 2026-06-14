import { NotificationHandler } from '../interfaces/notification-handler.interface';
import { NotificationsType as T } from '../enums/notifications.enum';

export class ChatHandler implements NotificationHandler {
  build(
    data: any,
    type: T,
  ): { title: string; message: string; metadata?: any } {
    switch (type) {
      case T.NEW_MESSAGE:
        return {
          title: 'New Chat Message',
          message: `${data.senderName}: ${data.message}`,
          metadata: {
            senderId: data.senderId,
            conversationId: data.conversationId,
          },
        };
      default:
        return {
          title: 'New Chat Message',
          message: `${data.senderName}: ${data.message}`,
          metadata: {
            senderId: data.senderId,
            conversationId: data.conversationId,
          },
        };
    }
  }
}

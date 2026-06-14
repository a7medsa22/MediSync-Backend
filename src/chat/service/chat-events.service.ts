import { Injectable } from '@nestjs/common';
import { ChatService } from './chat.service';
import { MessageService } from '../message.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { ActiveUsersService } from './active-users.service';

@Injectable()
export class ChatEventsService {
  constructor(
    private readonly chatService: ChatService,
    private readonly messageService: MessageService,
    private readonly notifications: NotificationsService,
    private readonly activeUsers: ActiveUsersService,
  ) {}

  async sendMessage(chatId: string, userId: string, content: string) {
    const message = await this.messageService.sendMessage(
      chatId,
      userId,
      content.trim(),
      'TEXT',
    );

    const chat = await this.chatService.getChatDetails(chatId, userId);

    const recipientUserId =
      chat.doctor.userId === userId ? chat.patient.userId : chat.doctor.userId;

    await this.chatService.updateConnectionLastMessage(
      chat.connectionId,
      message.createdAt,
      content,
    );

    const senderIsDoctor = chat.doctor.userId === userId;
    const recipientRole = senderIsDoctor ? 'PATIENT' : 'DOCTOR';
    await this.chatService.incrementUnreadCount(
      chat.connectionId,
      recipientRole,
    );

    const isRecipientOnline = await this.activeUsers.isOnline(recipientUserId);
    if (!isRecipientOnline) {
      await this.notifications.createNotification({
        userId: recipientUserId,
        type: 'NEW_CHAT_MESSAGE',
        title: `New message from ${message.senderName || 'Sender'}`,
        message: content.substring(0, 100),
        metadata: {
          chatId,
          messageId: message.id,
          senderId: userId,
        },
      });
    }

    return message;
  }
}

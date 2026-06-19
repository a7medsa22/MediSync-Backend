import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { chatDetailsSelectWithStatus } from '../common/selects/chat.select';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './service/chat.service';
import { UserCacheService } from '../common/cache/user-cache.service';
import { GetMessagesDto } from './dto';
import { messageSelect } from '../common/selects/message.select';

@Injectable()
export class MessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly userCacheService: UserCacheService,
  ) {}
  async sendMessage(
    chatId: string,
    senderId: string,
    content: string,
    messageType: string = 'TEXT',
  ) {
    // 1. Validate content
    if (!content || !content.trim()) {
      throw new BadRequestException('Message cannot be empty');
    }
    // Verify chat exists
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: chatDetailsSelectWithStatus,
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    // Verify sender has access
    if (!this.chatService.hasAccess(chat, senderId)) {
      throw new ForbiddenException('No access');
    }
    // Verify connection is ACTIVE
    if (chat.connection.status !== 'ACTIVE') {
      throw new BadRequestException('Connection is not active');
    }
    const sender = await this.userCacheService.getUserSnapshot(senderId);
    if (!sender) {
      throw new NotFoundException('Sender not found');
    }

    // Create message
    const message = await this.prisma.message.create({
      data: {
        chatId,
        senderId,
        content,
        messageType,
        senderName: `${sender.firstName} ${sender.lastName}`,
        senderRole: sender.role,
      },
    });

    return message;
  }

  async getMessages(chatId: string, userId: string, query: GetMessagesDto) {
    // Verify access
    const chat = await this.chatService.getChatHeader(chatId);

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    if (!this.chatService.canAccessChat(chat, userId)) {
      throw new ForbiddenException('No access to this chat');
    }

    // Pagination logic

    const limit = query.limit ?? 20;

    // Build where clause
    const where: any = {
      chatId,
      isDeleted: false,
    };

    if (query.before) {
      const beforeMessage = await this.prisma.message.findUnique({
        where: { id: query.before },
        select: { createdAt: true },
      });

      if (beforeMessage) {
        where.createdAt = { lt: beforeMessage.createdAt };
      }
    }

    // Get messages
    const messages = await this.prisma.message.findMany({
      where,
      select: messageSelect,
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    // 5) Determine if hasMore
    const lastMessage = messages.at(-1);

    const hasMore = lastMessage
      ? (await this.prisma.message.count({
          where: {
            chatId,
            isDeleted: false,
            createdAt: { lt: lastMessage.createdAt },
          },
        })) > 0
      : false;

    return {
      messages,
      cursor: lastMessage?.createdAt || null,
      hasMore,
    };
  }

  /**
   * Mark message as read
   */
  async markAsRead(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        senderId: true,
        isRead: true,
        readAt: true,
        chatId: true,
      },
    });

    if (!message) throw new NotFoundException('Message not found');

    // Cannot mark your own message
    if (message.senderId === userId) {
      throw new BadRequestException('Cannot mark your own message as read');
    }

    // Get chat header (cached)
    const chatHeader = await this.chatService.getChatHeader(message.chatId);

    if (!this.chatService.canAccessChat(chatHeader, userId)) {
      throw new ForbiddenException('No access');
    }

    // Can't mark your own message as read
    if (message.senderId === userId) {
      throw new BadRequestException('Cannot mark your own message as read');
    }

    // Already read
    if (message.isRead) {
      return message;
    }

    // Mark as read
    return this.prisma.message.update({
      where: { id: messageId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Mark all messages in chat as read
   */
  async markAllAsRead(chatId: string, userId: string) {
    // Verify access
    const chat = await this.chatService.getChatHeader(chatId);

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    if (!this.chatService.canAccessChat(chat, userId)) {
      throw new ForbiddenException('No access to this chat');
    }
    // Mark all unread messages (not sent by user) as read
    await this.prisma.message.updateMany({
      where: {
        chatId,
        isRead: false,
        senderId: { not: userId },
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { message: 'All messages marked as read' };
  }

  /**
   * Delete message (soft delete - for sender only)
   */
  async deleteMessage(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        senderId: true,
        isDeleted: true,
      },
    });

    if (!message) throw new NotFoundException('Message not found');

    if (message.senderId !== userId) {
      throw new ForbiddenException('You can delete only your own messages');
    }

    if (message.isDeleted) {
      throw new BadRequestException('Message already deleted');
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        content: 'This message was deleted',
        messageType: 'DELETED',
      },
    });

    return { message: 'Message deleted successfully' };
  }

  /**
   * Get unread messages count for a chat
   */
  async getUnreadCount(chatId: string, userId: string) {
    return this.prisma.message.count({
      where: {
        chatId,
        isRead: false,
        senderId: { not: userId },
        isDeleted: false,
      },
    });
  }
}

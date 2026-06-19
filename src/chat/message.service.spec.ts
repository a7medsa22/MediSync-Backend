import { Test, TestingModule } from '@nestjs/testing';
import { MessageService } from './message.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './service/chat.service';
import { UserCacheService } from '../common/cache/user-cache.service';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

describe('MessageService', () => {
  let service: MessageService;
  let prisma: PrismaService;
  let chatService: ChatService;
  let userCacheService: UserCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageService,
        {
          provide: PrismaService,
          useValue: {
            chat: { findUnique: jest.fn() },
            message: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              count: jest.fn(),
            },
          },
        },
        {
          provide: ChatService,
          useValue: {
            hasAccess: jest.fn(),
            getChatHeader: jest.fn(),
            canAccessChat: jest.fn(),
          },
        },
        {
          provide: UserCacheService,
          useValue: {
            getUserSnapshot: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MessageService>(MessageService);
    prisma = module.get<PrismaService>(PrismaService);
    chatService = module.get<ChatService>(ChatService);
    userCacheService = module.get<UserCacheService>(UserCacheService);
  });

  describe('sendMessage', () => {
    it('should throw BadRequestException if content is empty', async () => {
      await expect(
        service.sendMessage('chatId', 'senderId', ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if chat not found', async () => {
      (prisma.chat.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.sendMessage('chatId', 'senderId', 'Hello'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if sender has no access', async () => {
      (prisma.chat.findUnique as jest.Mock).mockResolvedValue({
        connection: { status: 'ACTIVE' },
      });
      (chatService.hasAccess as jest.Mock).mockReturnValue(false);
      await expect(
        service.sendMessage('chatId', 'senderId', 'Hello'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if connection is not active', async () => {
      (prisma.chat.findUnique as jest.Mock).mockResolvedValue({
        connection: { status: 'INACTIVE' },
      });
      (chatService.hasAccess as jest.Mock).mockReturnValue(true);
      await expect(
        service.sendMessage('chatId', 'senderId', 'Hello'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create message successfully', async () => {
      const chat = { connection: { status: 'ACTIVE' } };
      const sender = { firstName: 'John', lastName: 'Doe', role: 'USER' };
      const createdMessage = { id: '1', content: 'Hello' };

      (prisma.chat.findUnique as jest.Mock).mockResolvedValue(chat);
      (chatService.hasAccess as jest.Mock).mockReturnValue(true);
      (userCacheService.getUserSnapshot as jest.Mock).mockResolvedValue(sender);
      (prisma.message.create as jest.Mock).mockResolvedValue(createdMessage);

      const result = await service.sendMessage('chatId', 'senderId', 'Hello');

      expect(result).toEqual(createdMessage);
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ chatId: 'chatId', content: 'Hello' }),
        }),
      );
    });
  });

  describe('getMessages', () => {
    it('should throw NotFoundException if chat not found', async () => {
      (chatService.getChatHeader as jest.Mock).mockResolvedValue(null);
      await expect(service.getMessages('chatId', 'userId', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user has no access', async () => {
      (chatService.getChatHeader as jest.Mock).mockResolvedValue({});
      (chatService.canAccessChat as jest.Mock).mockReturnValue(false);
      await expect(service.getMessages('chatId', 'userId', {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return messages with hasMore and cursor', async () => {
      const chatHeader = {};
      const messages = [{ id: '1', createdAt: new Date() }];

      (chatService.getChatHeader as jest.Mock).mockResolvedValue(chatHeader);
      (chatService.canAccessChat as jest.Mock).mockReturnValue(true);
      (prisma.message.findMany as jest.Mock).mockResolvedValue(messages);
      (prisma.message.count as jest.Mock).mockResolvedValue(0);

      const result = await service.getMessages('chatId', 'userId', {});

      expect(result.messages).toEqual(messages);
      expect(result.cursor).toEqual(messages[0].createdAt);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('markAsRead', () => {
    it('should throw NotFoundException if message not found', async () => {
      (prisma.message.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.markAsRead('msgId', 'userId')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if marking own message', async () => {
      (prisma.message.findUnique as jest.Mock).mockResolvedValue({
        id: 'msgId',
        senderId: 'userId',
        isRead: false,
        chatId: 'chat1',
      });
      (chatService.getChatHeader as jest.Mock).mockResolvedValue({});
      (chatService.canAccessChat as jest.Mock).mockReturnValue(true);

      await expect(service.markAsRead('msgId', 'userId')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should update message as read', async () => {
      const message = {
        id: 'msgId',
        senderId: 'otherUser',
        isRead: false,
        chatId: 'chat1',
      };
      const updatedMessage = { ...message, isRead: true };

      (prisma.message.findUnique as jest.Mock).mockResolvedValue(message);
      (chatService.getChatHeader as jest.Mock).mockResolvedValue({});
      (chatService.canAccessChat as jest.Mock).mockReturnValue(true);
      (prisma.message.update as jest.Mock).mockResolvedValue(updatedMessage);

      const result = await service.markAsRead('msgId', 'userId');
      expect(result.isRead).toBe(true);
    });
  });

  describe('markAllAsRead', () => {
    it('should throw NotFoundException if chat not found', async () => {
      (chatService.getChatHeader as jest.Mock).mockResolvedValue(null);
      await expect(service.markAllAsRead('chatId', 'userId')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user cannot access chat', async () => {
      (chatService.getChatHeader as jest.Mock).mockResolvedValue({});
      (chatService.canAccessChat as jest.Mock).mockReturnValue(false);
      await expect(service.markAllAsRead('chatId', 'userId')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should mark all messages as read', async () => {
      (chatService.getChatHeader as jest.Mock).mockResolvedValue({});
      (chatService.canAccessChat as jest.Mock).mockReturnValue(true);
      (prisma.message.updateMany as jest.Mock).mockResolvedValue({ count: 3 });

      const result = await service.markAllAsRead('chatId', 'userId');

      expect(prisma.message.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            chatId: 'chatId',
            isRead: false,
            senderId: { not: 'userId' },
          }),
          data: expect.objectContaining({
            isRead: true,
          }),
        }),
      );
      expect(result).toEqual({ message: 'All messages marked as read' });
    });
  });

  describe('deleteMessage', () => {
    it('should throw NotFoundException if message not found', async () => {
      (prisma.message.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.deleteMessage('msgId', 'userId')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user is not sender', async () => {
      (prisma.message.findUnique as jest.Mock).mockResolvedValue({
        id: 'msgId',
        senderId: 'otherUser',
        isDeleted: false,
      });
      await expect(service.deleteMessage('msgId', 'userId')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException if message already deleted', async () => {
      (prisma.message.findUnique as jest.Mock).mockResolvedValue({
        id: 'msgId',
        senderId: 'userId',
        isDeleted: true,
      });
      await expect(service.deleteMessage('msgId', 'userId')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should delete message successfully', async () => {
      const message = { id: 'msgId', senderId: 'userId', isDeleted: false };
      (prisma.message.findUnique as jest.Mock).mockResolvedValue(message);
      (prisma.message.update as jest.Mock).mockResolvedValue({
        ...message,
        isDeleted: true,
      });

      const result = await service.deleteMessage('msgId', 'userId');

      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'msgId' },
          data: expect.objectContaining({
            isDeleted: true,
            content: 'This message was deleted',
            messageType: 'DELETED',
          }),
        }),
      );
      expect(result).toEqual({ message: 'Message deleted successfully' });
    });
  });

  describe('getUnreadCount', () => {
    it('should return count of unread messages', async () => {
      (prisma.message.count as jest.Mock).mockResolvedValue(5);

      const result = await service.getUnreadCount('chatId', 'userId');

      expect(prisma.message.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            chatId: 'chatId',
            isRead: false,
            senderId: { not: 'userId' },
            isDeleted: false,
          }),
        }),
      );
      expect(result).toBe(5);
    });
  });
});

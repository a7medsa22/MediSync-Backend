// src/chat/chat.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatService } from './service/chat.service';
import { MessageService } from './message.service';
import { BadRequestException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';

describe('ChatController', () => {
  let controller: ChatController;
  let chatService: ChatService;
  let messageService: MessageService;

  // Mock data
  const mockUser = {
    sub: 'user-123',
    email: 'test@example.com',
    role: UserRole.DOCTOR,
    status: UserStatus.ACTIVE,
    doctorId: 'doc-456',
    patientId: null,
  };

  const mockRequest = {
    user: mockUser,
  };

  const mockChats = [
    {
      connectionId: 'conn-1',
      chatId: 'chat-1',
      participant: {
        id: 'pat-1',
        name: 'Ali Ahmed',
        role: 'PATIENT',
      },
      unreadCount: 2,
    },
  ];

  const mockChat = {
    id: 'chat-abc',
    chatId: 'chat-abc',
    connectionId: 'conn-123',
    connection: {},
  };

  const mockMessage = {
    id: 'msg-001',
    chatId: 'chat-abc',
    senderId: 'user-123',
    content: 'Hello',
    createdAt: new Date(),
  };

  // Mock Services
  const mockChatService = {
    getUserChats: jest.fn(),
    getOrCreateChat: jest.fn(),
    getChatDetails: jest.fn(),
    verifyUserAccess: jest.fn(),
    getUnreadCount: jest.fn(),
    updateConnectionLastMessage: jest.fn(),
    resetUnreadCount: jest.fn(),
  };

  const mockMessageService = {
    getMessages: jest.fn(),
    sendMessage: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    deleteMessage: jest.fn(),
    getUnreadCount: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: mockChatService,
        },
        {
          provide: MessageService,
          useValue: mockMessageService,
        },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
    chatService = module.get<ChatService>(ChatService);
    messageService = module.get<MessageService>(MessageService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ===============================================
  // getConversations Tests
  // ===============================================
  describe('getConversations', () => {
    it('should return user chats', async () => {
      mockChatService.getUserChats.mockResolvedValue(mockChats);

      const result = await controller.getConversations(mockUser as any);

      expect(result).toEqual(mockChats);
      expect(mockChatService.getUserChats).toHaveBeenCalledWith(
        mockUser.sub,
        mockUser.role,
      );
    });
  });

  // ===============================================
  // getOrCreateChat Tests
  // ===============================================
  describe('getOrCreateChat', () => {
    it('should create or get chat', async () => {
      mockChatService.getOrCreateChat.mockResolvedValue(mockChat);
      mockChatService.verifyUserAccess.mockResolvedValue(true);

      const result = await controller.getOrCreateChat('conn-123', mockUser.sub);

      expect(result).toEqual(mockChat);
      expect(mockChatService.getOrCreateChat).toHaveBeenCalledWith('conn-123');
      expect(mockChatService.verifyUserAccess).toHaveBeenCalledWith(
        mockChat.id,
        mockUser.sub,
      );
    });

    it('should throw BadRequestException if user does not have access', async () => {
      mockChatService.getOrCreateChat.mockResolvedValue(mockChat);
      mockChatService.verifyUserAccess.mockResolvedValue(false);

      await expect(
        controller.getOrCreateChat('conn-123', mockUser.sub),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ===============================================
  // getChatDetails Tests
  // ===============================================
  describe('getChatDetails', () => {
    it('should return chat details', async () => {
      mockChatService.getChatDetails.mockResolvedValue(mockChat);

      const result = await controller.getChatDetails('chat-abc', mockUser.sub);

      expect(result).toEqual(mockChat);
      expect(mockChatService.getChatDetails).toHaveBeenCalledWith(
        'chat-abc',
        mockUser.sub,
      );
    });
  });

  // ===============================================
  // getMessages Tests
  // ===============================================
  describe('getMessages', () => {
    it('should return paginated messages', async () => {
      const mockMessages = {
        messages: [mockMessage],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasMore: false,
        },
      };
      mockMessageService.getMessages.mockResolvedValue(mockMessages);

      const query = { page: 1, limit: 20 };
      const result = await controller.getMessages(
        'chat-abc',
        query as any,
        mockUser.sub,
      );

      expect(result).toEqual(mockMessages);
      expect(mockMessageService.getMessages).toHaveBeenCalledWith(
        'chat-abc',
        mockUser.sub,
        query,
      );
    });
  });

  // ===============================================
  // sendMessage Tests
  // ===============================================
  describe('sendMessage', () => {
    it('should send message and update cache', async () => {
      const dto = {
        chatId: 'chat-abc',
        content: 'Hello Doctor',
        messageType: 'TEXT',
      };

      mockMessageService.sendMessage.mockResolvedValue(mockMessage);
      mockChatService.getChatDetails.mockResolvedValue(mockChat);
      mockChatService.updateConnectionLastMessage.mockResolvedValue(undefined);

      const result = await controller.sendMessage(dto as any, mockUser.sub);

      expect(result).toEqual(mockMessage);
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith(
        dto.chatId,
        mockUser.sub,
        dto.content,
        'TEXT',
      );
      expect(mockChatService.getChatDetails).toHaveBeenCalledWith(
        dto.chatId,
        mockUser.sub,
      );
      expect(mockChatService.updateConnectionLastMessage).toHaveBeenCalledWith(
        mockChat.connectionId,
        mockMessage.createdAt,
        dto.content,
      );
    });
  });

  // ===============================================
  // markMessageAsRead Tests
  // ===============================================
  describe('markMessageAsRead', () => {
    it('should mark message as read', async () => {
      const updatedMessage = { ...mockMessage, isRead: true };
      mockMessageService.markAsRead.mockResolvedValue(updatedMessage);

      const result = await controller.markMessageAsRead(
        'msg-001',
        mockUser.sub,
      );

      expect(result).toEqual(updatedMessage);
      expect(mockMessageService.markAsRead).toHaveBeenCalledWith(
        'msg-001',
        mockUser.sub,
      );
    });
  });

  // ===============================================
  // markAllAsRead Tests
  // ===============================================
  describe('markAllAsRead', () => {
    it('should mark all messages as read', async () => {
      mockMessageService.markAllAsRead.mockResolvedValue({
        message: 'All messages marked as read',
      });
      mockChatService.resetUnreadCount.mockResolvedValue(undefined);

      const result = await controller.markAllAsRead('chat-abc', mockUser.sub);

      expect(result).toEqual({ message: 'All messages marked as read' });
      expect(mockMessageService.markAllAsRead).toHaveBeenCalledWith(
        'chat-abc',
        mockUser.sub,
      );
      expect(mockChatService.resetUnreadCount).toHaveBeenCalledWith(
        'chat-abc',
        mockUser.sub,
      );
    });
  });

  // ===============================================
  // deleteMessage Tests
  // ===============================================
  describe('deleteMessage', () => {
    it('should delete message', async () => {
      mockMessageService.deleteMessage.mockResolvedValue({
        message: 'Message deleted successfully',
      });

      const result = await controller.deleteMessage('msg-001', mockUser.sub);

      expect(result).toEqual({ message: 'Message deleted successfully' });
      expect(mockMessageService.deleteMessage).toHaveBeenCalledWith(
        'msg-001',
        mockUser.sub,
      );
    });
  });

  // ===============================================
  // getUnreadCount Tests
  // ===============================================
  describe('getUnreadCount', () => {
    it('should return total unread count', async () => {
      mockChatService.getUnreadCount.mockResolvedValue(5);

      const result = await controller.getUnreadCount(mockUser as any);

      expect(result).toEqual({ count: 5 });
      expect(mockChatService.getUnreadCount).toHaveBeenCalledWith(
        mockUser.sub,
        mockUser.role,
      );
    });
  });

  // ===============================================
  // getChatUnreadCount Tests
  // ===============================================
  describe('getChatUnreadCount', () => {
    it('should return chat-specific unread count', async () => {
      mockMessageService.getUnreadCount.mockResolvedValue(2);

      const result = await controller.getChatUnreadCount(
        'chat-abc',
        mockUser.sub,
      );

      expect(result).toEqual({ count: 2 });
      expect(mockMessageService.getUnreadCount).toHaveBeenCalledWith(
        'chat-abc',
        mockUser.sub,
      );
    });
  });
});

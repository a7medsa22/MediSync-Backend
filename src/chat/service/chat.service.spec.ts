import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole, ConnectionStatus } from '@prisma/client';
import { ChatService } from './chat.service';
import { RedisService } from 'src/common/redis/redis.service';
import { connectionSelect } from 'src/common/selects/chat.select';

describe('ChatService', () => {
  let service: ChatService;
  let prismaService: PrismaService;

  // Mock data
  const mockConnection = {
    id: 'conn-123',
    doctorId: 'doc-456',
    patientId: 'pat-789',
    status: ConnectionStatus.ACTIVE,
    doctor: {
      id: 'doc-456',
      userId: 'user-doc',
      user: { id: 'user-doc', firstName: 'Ahmed', lastName: 'Mohamed' },
    },
    patient: {
      id: 'pat-789',
      userId: 'user-pat',
      user: { id: 'user-pat', firstName: 'Ali', lastName: 'Hassan' },
    },
  };

  const mockChat = {
    id: 'chat-abc',
    connectionId: 'conn-123',
    lastMessageAt: null,
    lastMessagePreview: null,
    connection: mockConnection,
    messages: [],
  };
  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  // Mock PrismaService
  const mockPrismaService = {
    doctorPatientConnection: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    chat: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (fn) => {
      if (Array.isArray(fn)) {
        return Promise.all(fn.map((f) => f));
      }
      return fn(mockPrismaService);
    }),

    message: {
      create: jest.fn(),
    },
    doctor: {
      findUnique: jest.fn(),
    },
    patient: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Clear all mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ===============================================
  // getOrCreateChat Tests
  // ===============================================
  describe('getOrCreateChat', () => {
    it('should throw NotFoundException if connection does not exist', async () => {
      mockPrismaService.doctorPatientConnection.findUnique.mockResolvedValue(
        null,
      );

      await expect(service.getOrCreateChat('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
      expect(
        mockPrismaService.doctorPatientConnection.findUnique,
      ).toHaveBeenCalledWith({
        where: { id: 'invalid-id' },
        select: connectionSelect,
      });
    });

    it('should throw BadRequestException if connection is not ACTIVE', async () => {
      const inactiveConnection = {
        ...mockConnection,
        status: ConnectionStatus.INACTIVE,
      };
      mockPrismaService.doctorPatientConnection.findUnique.mockResolvedValue(
        inactiveConnection,
      );

      await expect(service.getOrCreateChat('conn-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return existing chat if found', async () => {
      mockPrismaService.doctorPatientConnection.findUnique.mockResolvedValue(
        mockConnection,
      );
      mockPrismaService.chat.findUnique.mockResolvedValue(mockChat);

      const result = await service.getOrCreateChat('conn-123');

      expect(result).toEqual({
        chatId: 'chat-abc',
        connectionId: 'conn-123',
        doctor: { id: 'doc-456', name: 'Ahmed Mohamed' },
        patient: { id: 'pat-789', name: 'Ali Hassan' },
      });
      expect(mockPrismaService.chat.findUnique).toHaveBeenCalledWith({
        where: { connectionId: 'conn-123' },
        select: {
          id: true,
          connectionId: true,
        },
      });
      expect(mockPrismaService.chat.create).not.toHaveBeenCalled();
    });

    it('should create new chat if not found', async () => {
      mockPrismaService.doctorPatientConnection.findUnique.mockResolvedValue(
        mockConnection,
      );
      mockPrismaService.chat.findUnique.mockResolvedValue(null);
      mockPrismaService.chat.create.mockResolvedValue(mockChat);
      mockPrismaService.message.create.mockResolvedValue({
        id: 'msg-001',
        content: 'Chat started. You can now communicate securely.',
      });

      const result = await service.getOrCreateChat('conn-123');

      expect(result).toEqual({
        chatId: 'chat-abc',
        connectionId: 'conn-123',
        doctor: { id: 'doc-456', name: 'Ahmed Mohamed' },
        patient: { id: 'pat-789', name: 'Ali Hassan' },
      });
      expect(mockPrismaService.chat.create).toHaveBeenCalledWith({
        data: { connectionId: 'conn-123' },
      });
      expect(mockPrismaService.message.create).toHaveBeenCalledWith({
        data: {
          chatId: mockChat.id,
          senderId: mockConnection.doctor.userId,
          content: 'Chat started. You can now communicate securely.',
          messageType: 'SYSTEM',
          isRead: true,
        },
      });
    });
  });

  // ===============================================
  // getUserChats Tests
  // ===============================================
  describe('getUserChats', () => {
    const mockDoctorChats = [
      {
        id: 'conn-1',
        doctorId: 'doc-456',
        patientId: 'pat-1',
        status: ConnectionStatus.ACTIVE,
        lastMessageAt: new Date(),
        unreadCount: 2,
        patient: {
          id: 'pat-1',
          userId: 'user-pat-1',
          user: { firstName: 'Ali', lastName: 'Ahmed' },
        },
        doctor: {
          id: 'doc-456',
          userId: 'user-doc',
          user: { firstName: 'Dr', lastName: 'Ahmed' },
        },
        chat: {
          id: 'chat-1',
          messages: [{ id: 'msg-1', content: 'Last message' }],
        },
      },
    ];

    it('should throw NotFoundException if doctor profile not found', async () => {
      mockPrismaService.doctor.findUnique.mockResolvedValue(null);

      await expect(
        service.getUserChats('user-doc', UserRole.DOCTOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return doctor chats', async () => {
      mockPrismaService.doctor.findUnique.mockResolvedValue({ id: 'doc-456' });
      mockPrismaService.doctorPatientConnection.findMany.mockResolvedValue(
        mockDoctorChats,
      );

      const result = await service.getUserChats('user-doc', UserRole.DOCTOR);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        connectionId: 'conn-1',
        chatId: 'chat-1',
        unreadCount: 2,
        participant: {
          id: 'pat-1',
          userId: 'user-pat-1',
          name: 'Ali Ahmed',
          role: 'PATIENT',
        },
      });
    });

    it('should throw NotFoundException if patient profile not found', async () => {
      mockPrismaService.patient.findUnique.mockResolvedValue(null);

      await expect(
        service.getUserChats('user-pat', UserRole.PATIENT),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return patient chats', async () => {
      mockPrismaService.patient.findUnique.mockResolvedValue({ id: 'pat-789' });
      mockPrismaService.doctorPatientConnection.findMany.mockResolvedValue([
        {
          ...mockDoctorChats[0],
          patientId: 'pat-789',
        },
      ]);

      const result = await service.getUserChats('user-pat', UserRole.PATIENT);

      expect(result).toHaveLength(1);
      expect(result[0].participant.role).toBe('DOCTOR');
    });

    it('should throw ForbiddenException for admin role', async () => {
      await expect(
        service.getUserChats('user-admin', UserRole.ADMIN),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ===============================================
  // getChatDetails Tests
  // ===============================================
  describe('getChatDetails', () => {
    it('should throw NotFoundException if chat not found', async () => {
      mockPrismaService.chat.findUnique.mockResolvedValue(null);

      await expect(
        service.getChatDetails('invalid-chat', 'user-doc'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user does not have access', async () => {
      mockPrismaService.chat.findUnique.mockResolvedValue(mockChat);

      await expect(
        service.getChatDetails('chat-abc', 'unauthorized-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return chat details for doctor', async () => {
      mockPrismaService.chat.findUnique.mockResolvedValue(mockChat);

      const result = await service.getChatDetails('chat-abc', 'user-doc');

      expect(result).toEqual({
        chatId: 'chat-abc',
        connectionId: 'conn-123',
        doctor: {
          id: 'doc-456',
          userId: 'user-doc',
          name: 'Ahmed Mohamed',
          avatar: null,
        },
        patient: {
          id: 'pat-789',
          userId: 'user-pat',
          name: 'Ali Hassan',
          avatar: null,
        },
      });
    });

    it('should return chat details for patient', async () => {
      mockPrismaService.chat.findUnique.mockResolvedValue(mockChat);

      const result = await service.getChatDetails('chat-abc', 'user-pat');

      expect(result).toEqual({
        chatId: 'chat-abc',
        connectionId: 'conn-123',
        doctor: {
          id: 'doc-456',
          userId: 'user-doc',
          name: 'Ahmed Mohamed',
          avatar: null,
        },
        patient: {
          id: 'pat-789',
          userId: 'user-pat',
          name: 'Ali Hassan',
          avatar: null,
        },
      });
    });
  });

  // ===============================================
  // getUnreadCount Tests
  // ===============================================
  describe('getUnreadCount', () => {
    it('should throw NotFoundException if doctor not found', async () => {
      mockPrismaService.doctor.findUnique.mockResolvedValue(null);

      await expect(
        service.getUnreadCount('user-doc', UserRole.DOCTOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return total unread count for doctor', async () => {
      mockPrismaService.doctor.findUnique.mockResolvedValue({ id: 'doc-456' });
      mockPrismaService.doctorPatientConnection.aggregate.mockResolvedValue({
        _sum: { unreadCount: 15 },
      });

      const result = await service.getUnreadCount('user-doc', UserRole.DOCTOR);

      expect(result).toBe(15);
    });

    it('should return 0 if patient not found', async () => {
      mockPrismaService.patient.findUnique.mockResolvedValue(null);

      await expect(
        service.getUnreadCount('user-pat', UserRole.PATIENT),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return total unread count for patient', async () => {
      mockPrismaService.patient.findUnique.mockResolvedValue({ id: 'pat-789' });
      mockPrismaService.doctorPatientConnection.aggregate.mockResolvedValue({
        _sum: { unreadCount: 5 },
      });

      const result = await service.getUnreadCount('user-pat', UserRole.PATIENT);

      expect(result).toBe(5);
    });
  });

  // ===============================================
  // verifyUserAccess Tests
  // ===============================================
  describe('verifyUserAccess', () => {
    it('should throw NotFoundException if chat not found', async () => {
      mockPrismaService.chat.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyUserAccess('invalid-chat', 'user-doc'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return true if user is doctor in connection', async () => {
      mockPrismaService.chat.findUnique.mockResolvedValue(mockChat);

      const result = await service.verifyUserAccess('chat-abc', 'user-doc');

      expect(result).toBe(true);
    });

    it('should return true if user is patient in connection', async () => {
      mockPrismaService.chat.findUnique.mockResolvedValue(mockChat);

      const result = await service.verifyUserAccess('chat-abc', 'user-pat');

      expect(result).toBe(true);
    });

    it('should return false if user not in connection', async () => {
      mockPrismaService.chat.findUnique.mockResolvedValue(mockChat);

      const result = await service.verifyUserAccess('chat-abc', 'other-user');

      expect(result).toBe(false);
    });
  });

  // ===============================================
  // updateConnectionLastMessage Tests
  // ===============================================
  describe('updateConnectionLastMessage', () => {
    it('should update connection and chat last message info', async () => {
      const lastMessageAt = new Date();
      const preview = 'Hello, this is a test message';

      mockPrismaService.doctorPatientConnection.update.mockResolvedValue({});
      mockPrismaService.chat.update.mockResolvedValue({});

      await service.updateConnectionLastMessage(
        'conn-123',
        lastMessageAt,
        preview,
      );

      expect(
        mockPrismaService.doctorPatientConnection.update,
      ).toHaveBeenCalledWith({
        where: { id: 'conn-123' },
        data: {
          lastMessageAt,
          lastActivityAt: lastMessageAt,
        },
      });

      expect(mockPrismaService.chat.update).toHaveBeenCalledWith({
        where: { connectionId: 'conn-123' },
        data: {
          lastMessageAt,
          lastMessagePreview: preview.substring(0, 200),
        },
      });
    });

    it('should truncate preview to 200 characters', async () => {
      const longPreview = 'a'.repeat(300);
      mockPrismaService.doctorPatientConnection.update.mockResolvedValue({});
      mockPrismaService.chat.update.mockResolvedValue({});

      await service.updateConnectionLastMessage(
        'conn-123',
        new Date(),
        longPreview,
      );

      expect(mockPrismaService.chat.update).toHaveBeenCalledWith({
        where: { connectionId: 'conn-123' },
        data: expect.objectContaining({
          lastMessagePreview: longPreview.substring(0, 200),
        }),
      });
    });
  });

  // ===============================================
  // incrementUnreadCount Tests
  // ===============================================
  describe('incrementUnreadCount', () => {
    it('should increment unread count', async () => {
      mockPrismaService.doctorPatientConnection.update.mockResolvedValue({});

      await service.incrementUnreadCount('conn-123', UserRole.PATIENT);

      expect(
        mockPrismaService.doctorPatientConnection.update,
      ).toHaveBeenCalledWith({
        where: { id: 'conn-123' },
        data: {
          unreadCount: { increment: 1 },
        },
      });
    });
  });

  // ===============================================
  // resetUnreadCount Tests
  // ===============================================
  describe('resetUnreadCount', () => {
    it('should reset unread count to 0', async () => {
      mockPrismaService.chat.findUnique.mockResolvedValue(mockChat);
      mockPrismaService.doctorPatientConnection.update.mockResolvedValue({});

      await service.resetUnreadCount('chat-abc', 'user-doc');

      expect(
        mockPrismaService.doctorPatientConnection.update,
      ).toHaveBeenCalledWith({
        where: { id: 'conn-123' },
        data: {
          unreadCount: 0,
        },
      });
    });
  });
});

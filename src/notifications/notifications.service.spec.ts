import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { notificationRegistry } from './notification.registry';
import { NotificationsType } from './enums/notifications.enum';

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: PrismaService,
          useValue: {
            notification: {
              create: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              delete: jest.fn(),
              count: jest.fn(),
            },
          },
        },
        {
          provide: NotificationsGateway,
          useValue: {
            emitToUser: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('getUnreadCount should call prisma.notification.count with isRead=false', async () => {
    const prisma = (service as any).prisma;
    (prisma.notification.count as jest.Mock).mockResolvedValue(7);

    const result = await service.getUnreadCount('user-1');

    expect(result).toBe(7);
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRead: false },
    });
  });

  describe('createNotification', () => {
    it('should normalize metadata defaults (actionUrl, targetId, targetType) when not provided', async () => {
      const prisma = (service as any).prisma;
      const gateway = (service as any).notificationsGateway;

      (prisma.notification.create as jest.Mock).mockResolvedValue({
        id: 'n1',
        userId: 'user-1',
      });
      (prisma.notification.count as jest.Mock).mockResolvedValue(3);

      await service.createNotification({
        userId: 'user-1',
        type: NotificationsType.CONNECTION_REQUEST as any,
        // handler needs senderName/senderId for message/metadata
        metadata: {
          senderName: 'Ahmed',
          senderId: 'doc-9',
        },
      } as any);

      const createArg = (prisma.notification.create as jest.Mock).mock
        .calls[0][0];
      expect(createArg.data.title).toBe('New Connection Request');
      expect(createArg.data.message).toBe(
        'Ahmed sent you a connection request',
      );

      // normalized metadata should include handler metadata + defaults
      expect(createArg.data.metadata).toMatchObject({
        senderId: 'doc-9',
        actionUrl: '/notifications',
        targetId: 'user-1',
        targetType: 'user',
      });

      expect(gateway.emitToUser).toHaveBeenCalledWith(
        'user-1',
        'notification_created',
        {
          notification: { id: 'n1', userId: 'user-1' },
          unreadCount: 3,
        },
      );
    });

    it('should respect provided actionUrl/targetId/targetType overrides', async () => {
      const prisma = (service as any).prisma;
      const gateway = (service as any).notificationsGateway;

      (prisma.notification.create as jest.Mock).mockResolvedValue({
        id: 'n2',
        userId: 'user-1',
      });
      (prisma.notification.count as jest.Mock).mockResolvedValue(0);

      await service.createNotification({
        userId: 'user-1',
        type: NotificationsType.NEW_MESSAGE as any,
        metadata: {
          senderName: 'Sara',
          senderId: 'u-2',
          conversationId: 'c-1',
          actionUrl: '/chat/c-1',
          targetId: 'doctor-5',
          targetType: 'doctor',
        },
      } as any);

      const createArg = (prisma.notification.create as jest.Mock).mock
        .calls[0][0];
      expect(createArg.data.metadata).toMatchObject({
        senderId: 'u-2',
        conversationId: 'c-1',
        actionUrl: '/chat/c-1',
        targetId: 'doctor-5',
        targetType: 'doctor',
      });

      expect(gateway.emitToUser).toHaveBeenCalledWith(
        'user-1',
        'notification_created',
        {
          notification: { id: 'n2', userId: 'user-1' },
          unreadCount: 0,
        },
      );
    });

    it('should use handler fallback (SYSTEM_DEFAULT) when type is not present in registry', async () => {
      const prisma = (service as any).prisma;
      const gateway = (service as any).notificationsGateway;

      (prisma.notification.create as jest.Mock).mockResolvedValue({
        id: 'n3',
        userId: 'user-1',
      });
      (prisma.notification.count as jest.Mock).mockResolvedValue(1);

      // choose a type number that likely isn't in NotificationsType enum keys
      const unknownType = 999 as any;

      await service.createNotification({
        userId: 'user-1',
        type: unknownType,
        metadata: {
          eventType: 'SCAN_OK',
          scannerId: 'scanner-1',
        },
      } as any);

      const createArg = (prisma.notification.create as jest.Mock).mock
        .calls[0][0];

      expect(createArg.data.title).toBe('System Notification');
      expect(createArg.data.message).toBe('A system event occurred: SCAN_OK');
      expect(createArg.data.metadata).toMatchObject({
        scannerId: 'scanner-1',
        actionUrl: '/notifications',
        targetId: 'user-1',
        targetType: 'user',
      });

      expect(gateway.emitToUser).toHaveBeenCalled();
    });

    it('should throw when handler candidate exists but has no build function', async () => {
      const prisma = (service as any).prisma;
      const gateway = (service as any).notificationsGateway;

      // Temporarily inject a handler with missing build for this test
      const oldRegistry = notificationRegistry as any;
      const key = 1234 as any;

      oldRegistry[key] = {} as any;

      await expect(
        service.createNotification({
          userId: 'user-1',
          type: key,
          metadata: { eventType: 'X' },
        } as any),
      ).rejects.toThrow(/Notification handler not found/i);

      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(gateway.emitToUser).not.toHaveBeenCalled();
    });

    it('should surface prisma errors and not emit when create fails', async () => {
      const prisma = (service as any).prisma;
      const gateway = (service as any).notificationsGateway;

      (prisma.notification.create as jest.Mock).mockRejectedValue(
        new Error('DB error'),
      );

      await expect(
        service.createNotification({
          userId: 'user-1',
          type: NotificationsType.CONNECTION_ACCEPTED as any,
          metadata: { senderName: 'Ali', senderId: 'doc-1' },
        } as any),
      ).rejects.toThrow('DB error');

      expect(gateway.emitToUser).not.toHaveBeenCalled();
    });
  });

  describe('getUserNotifications', () => {
    it('should call prisma.notification.findMany with cursor-less pagination and limit', async () => {
      const prisma = (service as any).prisma;

      (prisma.notification.findMany as jest.Mock).mockResolvedValue([
        { id: 'n1', userId: 'user-1' },
      ]);

      const result = await service.getUserNotifications('user-1', { limit: 5 });

      expect(result).toEqual([{ id: 'n1', userId: 'user-1' }]);
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 5,
      });
    });

    it('should build cursor pagination where.OR with createdAt lt/equals and id lt', async () => {
      const prisma = (service as any).prisma;

      (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);

      const cursorDate = '2026-01-02T00:00:00.000Z';
      const cursorId = 'abc';

      await service.getUserNotifications('user-1', {
        limit: 10,
        cursor: { createdAt: cursorDate, id: cursorId },
      });

      const arg = (prisma.notification.findMany as jest.Mock).mock.calls[0][0];

      const expectedCreatedAt = new Date(cursorDate);

      expect(arg.where.userId).toBe('user-1');
      expect(arg.where.OR).toEqual([
        { createdAt: { lt: expectedCreatedAt } },
        {
          createdAt: { equals: expectedCreatedAt },
          id: { lt: cursorId },
        },
      ]);
      expect(arg.take).toBe(10);
    });
  });

  describe('mutations', () => {
    it('markAsRead should set isRead=true by id', async () => {
      const prisma = (service as any).prisma;
      (prisma.notification.update as jest.Mock).mockResolvedValue({
        id: 'n1',
        isRead: true,
      });

      await service.markAsRead('n1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: { isRead: true },
      });
    });

    it('markAllAsRead should updateMany user notifications where isRead=false', async () => {
      const prisma = (service as any).prisma;
      (prisma.notification.updateMany as jest.Mock).mockResolvedValue({
        count: 2,
      });

      await service.markAllAsRead('user-1');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
        data: { isRead: true },
      });
    });

    it('deleteNotification should delete by id', async () => {
      const prisma = (service as any).prisma;
      (prisma.notification.delete as jest.Mock).mockResolvedValue({ id: 'n1' });

      await service.deleteNotification('n1');

      expect(prisma.notification.delete).toHaveBeenCalledWith({
        where: { id: 'n1' },
      });
    });
  });

  describe('event listeners', () => {
    it('handleConnectionAccepted should call createNotification with CONNECTION_ACCEPTED and correct metadata', async () => {
      const spy = jest
        .spyOn(service, 'createNotification')
        .mockResolvedValue(undefined as any);

      await service.handleConnectionAccepted({
        userId: 'patient-1',
        type: 'CONNECTION_ACCEPTED',
        doctorEmail: 'doc@example.com',
      } as any);

      expect(spy).toHaveBeenCalledWith({
        userId: 'patient-1',
        type: 'CONNECTION_ACCEPTED',
        metadata: {
          doctorEmail: 'doc@example.com',
          actionUrl: '/doctor/profile',
          targetType: 'doctor',
        },
      } as any);
    });
  });
});

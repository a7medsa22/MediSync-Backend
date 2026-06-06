import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateNotificationDto } from './dto/notifications.dto';
import { NotificationsGateway } from './notifications.gateway';
import { notificationRegistry } from './notification.registry';
import { NotificationMetadata } from './interfaces/notification.metadata.interface';

type NotificationCursor = {
  createdAt: string;
  id: string;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
  ) { }

  /**
   * Normalize metadata to ensure UI-ready deep-linking
   */
  private normalizeMetadata(
    metadata: NotificationMetadata,
    userId: string,
    defaultActionUrl: string,
  ): Prisma.JsonObject {
    const safe =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? (metadata as unknown as Prisma.JsonObject)
        : {};

    const normalized: Prisma.JsonObject = {
      ...safe,
      actionUrl: metadata?.actionUrl || defaultActionUrl,
      targetId: metadata?.targetId || userId,
      targetType: metadata?.targetType || 'user',
    };

    return normalized;
  }

  /**
   * Core method to create, save and emit a notification
   */
  async createNotification(
    dto: Omit<CreateNotificationDto, 'title' | 'message'> &
      Partial<Pick<CreateNotificationDto, 'title' | 'message'>>,
  ) {
    try {
      const metadata = this.normalizeMetadata(
        dto.metadata as NotificationMetadata,
        dto.userId,
        '/notifications',
      );

      // Fallback to SYSTEM_DEFAULT if registry doesn't have a handler for the incoming type
      const handlerCandidate =
        (notificationRegistry as Record<string, unknown>)[dto.type as never] ??
        notificationRegistry.SYSTEM_DEFAULT;

      type NotificationHandlerLike = {
        build: (
          data: { [key: string]: unknown },
          type: CreateNotificationDto['type'],
        ) => {
          title: string;
          message: string;
          metadata?: unknown;
        };
      };

      const handler = handlerCandidate as NotificationHandlerLike;

      if (!handler || typeof handler !== 'object' || typeof handler.build !== 'function') {
        throw new Error(`Notification handler not found for type: ${String(dto.type)}`);
      }

      const content = handler.build(metadata as Record<string, unknown>, dto.type);

      const mergedMetadata: Prisma.JsonObject = {
        ...(metadata as Prisma.JsonObject),
        ...(content.metadata ?? {}),
      };

      const notification = await this.prisma.notification.create({
        data: {
          userId: dto.userId,
          type: dto.type,
          title: content.title,
          message: content.message,
          metadata: mergedMetadata as Prisma.InputJsonValue,
          isRead: false,
        },
      });

      // Push Real-time
      const unreadCount = await this.getUnreadCount(dto.userId).catch(() => 0);
      this.notificationsGateway.emitToUser(dto.userId, 'notification_created', {
        notification,
        unreadCount,
      });

      return notification;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to create notification for user ${dto.userId}: ${message}`);
      throw error;
    }
  }

  // --- Event Listeners (Decoupling) ---

  // Backward-compatible listener used by unit tests
  async handleConnectionAccepted(payload: {
    userId: string;
    type: NotificationType | string;
    doctorEmail: string;
  }) {
    return this.createNotification({
      userId: payload.userId,
      type: payload.type as any,
      metadata: {
        doctorEmail: payload.doctorEmail,
        actionUrl: '/doctor/profile',
        targetType: 'doctor',
      } as any,
    } as any);
  }

  @OnEvent('notification.trigger')
  async handleNotificationTrigger(payload: { userId: string; type: NotificationType; data: any }) {
    return this.createNotification({
      userId: payload.userId,
      type: payload.type,
      metadata: payload.data,
    });
  }

  // --- Queries ---

  async getUserNotifications(
    userId: string,
    params?: { limit?: number; cursor?: NotificationCursor },
  ) {
    const limit = params?.limit ?? 10;
    const cursor = params?.cursor;
    
    const where: Prisma.NotificationWhereInput = { userId };

    if (cursor) {
      const createdAt = new Date(cursor.createdAt);
      where.OR = [
        { createdAt: { lt: createdAt } },
        {
          createdAt: { equals: createdAt },
          id: { lt: cursor.id },
        },
      ];
    }

    return this.prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  // --- Mutations ---

  async markAsRead(notificationId: string) {
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async deleteNotification(notificationId: string) {
    return this.prisma.notification.delete({
      where: { id: notificationId },
    });
  }
}

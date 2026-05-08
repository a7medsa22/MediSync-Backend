import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateNotificationDto } from './dto/notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async createNotification(dto:CreateNotificationDto) {
    const {userId,type,title,message,metadata} = dto
    return this.prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        metadata,
        isRead: false,
      },
    });
  }

  /**
   * Notify patient of successful connection
   */
  async notifyPatientConnectionSuccess(
    patientUserId: string,
    doctorName: string,
    doctorEmail: string,
  ) {
    return this.createNotification({
      userId:patientUserId,
      type:NotificationType.CONNECTION_ACCEPTED,
      title:'Connection Successful',
      message:`You are now connected with Dr. ${doctorName}`,
      metadata:{ doctorEmail },
    }
    );
  }
  /**
   * Notify doctor of new patient connection
   */
  async notifyDoctorNewConnection(
    doctorUserId: string,
    patientName: string,
    patientEmail: string,
  ) {
    return this.createNotification({
      userId:doctorUserId,
      type:NotificationType.NEW_CONNECTION,
      title:'New Patient Connection',
      message:`${patientName} has connected with you via QR.`,
      metadata:{ patientEmail },
  });
  }
  /**
   * Get user notifications
   */
  async getUserNotifications(userId: string, limit = 10) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string) {
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string) {
    return this.prisma.notification.delete({
      where: { id: notificationId },
    });
  }
}

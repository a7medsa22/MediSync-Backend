import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { ApiAuth } from 'src/common/decorators/api-auth.decorator';

@Controller('notifications')
@ApiAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // 1. جلب قائمة الإشعارات (للقائمة المنسدلة أو صفحة الإشعارات)
  @Get()
  async getMyNotifications(
    @CurrentUser('sub') userId: string,
    @Query('limit') limit?: string,
    @Query('cursor_id') cursorId?: string,
    @Query('cursor_date') cursorDate?: string,
  ) {
    const paginationParams =
      cursorId && cursorDate
        ? {
            cursor: { id: cursorId, createdAt: cursorDate },
            limit: limit ? +limit : 10,
          }
        : { limit: limit ? +limit : 10 };

    return this.notificationsService.getUserNotifications(
      userId,
      paginationParams,
    );
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser('sub') userId: string) {
    const count = await this.notificationsService.getUnreadCount(userId);
    return { count };
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string) {
    await this.notificationsService.markAsRead(id);
    return { success: true, message: 'Notification marked as read' };
  }

  @Patch('read-all')
  async markAllAsRead(@CurrentUser('sub') userId: string) {
    await this.notificationsService.markAllAsRead(userId);
    return { success: true, message: 'All notifications marked as read' };
  }

  @Delete(':id')
  async deleteNotification(@Param('id') id: string) {
    await this.notificationsService.deleteNotification(id);
    return { success: true, message: 'Notification deleted' };
  }
}

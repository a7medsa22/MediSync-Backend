import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './service/chat.service';
import { MessageService } from './message.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { RedisService } from '../common/redis/redis.service';
import { SendMessageDto } from './dto';
import { WsJwtGuard } from 'src/auth/guards/ws-Jwt.guard';
import { ActiveUsersService } from './service/active-users.service';
import { ChatEventsService } from './service/chat-events.service';
@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/chat',
})
@Injectable()
@UseGuards(WsJwtGuard)
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly messageService: MessageService,
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => NotificationsService))
    private notificationsService: NotificationsService,
    private readonly activeUsersService: ActiveUsersService,
    private readonly chatEvents: ChatEventsService,
  ) {}
  afterInit() {
    this.logger.log('Chat Gateway Initialized');
  }

  /**
   * Handle connection
   */
  async handleConnection(client: Socket) {
    const userId = client.data.userId;
    if (!userId) {
      client.disconnect();
      return;
    }
    await this.activeUsersService.setOnline(userId, client.id);
    this.logger.log(`User ${userId} connected`);
    client.broadcast.emit('user_online', { userId });
  }

  // Handle disconnection
  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;

    await this.activeUsersService.unsetOnline(userId);

    await this.redisService.del(`typing:*:${userId}`);

    client.broadcast.emit('user_offline', { userId });
    this.logger.warn(`User ${userId} disconnected`);
  }

  // Join chat room
  @SubscribeMessage('join_chat')
  async joinChat(
    @ConnectedSocket() client: Socket,
    @MessageBody(new ValidationPipe({ transform: true, whitelist: true }))
    data: { chatId: string },
  ) {
    try {
      const userId = client.data.userId;
      const { chatId } = data;

      // Verify access
      if (!this.chatService.verifyUserAccess(chatId, userId)) {
        return client.emit('error', { message: 'Access Denied' });
      }

      this.joinChatRoom(client, chatId);

      // Mark all messages as read
      await this.messageService.markAllAsRead(chatId, userId);
      await this.chatService.resetUnreadCount(chatId, userId);

      client.emit('joined_chat', { chatId });
      this.logger.log(`✅ User ${userId} joined chat ${chatId}`);
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  /**
   * Leave chat room
   */
  @SubscribeMessage('leave_chat')
  leaveChat(
    @ConnectedSocket() client: Socket,
    @MessageBody(new ValidationPipe({ transform: true, whitelist: true }))
    data: { chatId: string },
  ) {
    client.leave(this.getRoom(data.chatId));
    this.stopTyping(client, data);
    client.emit('left_chat', { chatId: data.chatId });
  }
  /**
   * Send message (real-time)
   */
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    data: SendMessageDto,
  ) {
    try {
      const userId = client.data.userId;
      const { chatId, content } = data;
      const rateKey = `msg_rate:${userId}`;
      const current = await this.redisService.get<number>(rateKey);
      const next = current ? current + 1 : 1;
      await this.redisService.set(rateKey, next, 1);
      if (next > 3) {
        client.emit('error', { message: 'Too many messages — slow down' });
        return;
      }

      const message = await this.chatEvents.sendMessage(
        chatId,
        userId,
        content,
      );

      this.server.to(this.getRoom(chatId)).emit('new_message', message);
      client.emit('message_sent', { message });
      await this.stopTyping(client, { chatId });
    } catch (error: any) {
      client.emit('error', {
        message: error.message || 'Failed to send message',
      });
    }
  }

  /**
   * Mark message as read
   */
  @SubscribeMessage('mark_as_read')
  async handleMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody(new ValidationPipe({ transform: true, whitelist: true }))
    data: { messageId: string },
  ) {
    try {
      const userId = client.data.userId;
      const { messageId } = data;

      const message = await this.messageService.markAsRead(messageId, userId);

      // Emit to chat room
      this.server.to(this.getRoom(message.chatId)).emit('message_read', {
        messageId,
        readAt: message.readAt,
        readBy: userId,
      });
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  /**
   * Typing indicator - start
   */
  @SubscribeMessage('typing_start')
  async startTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody(new ValidationPipe({ transform: true, whitelist: true }))
    data: { chatId: string },
  ) {
    const userId = client.data.userId;
    const { chatId } = data;
    const key = this.throttleTypingKey(userId, chatId);

    const already = await this.redisService.get(key);
    if (already) return;

    await this.redisService.set(key, '1', 5);
    // Emit to others in chat
    client.to(this.getRoom(chatId)).emit('user_typing', { userId, chatId });
  }

  /**
   * Typing indicator - stop
   */
  @SubscribeMessage('typing_stop')
  async stopTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody(new ValidationPipe({ transform: true, whitelist: true }))
    data: { chatId: string },
  ) {
    const userId = client.data.userId;
    const { chatId } = data;
    const key = this.throttleTypingKey(userId, chatId);
    await this.redisService.del(key);

    // Emit to others in chat
    client
      .to(this.getRoom(chatId))
      .emit('user_stopped_typing', { userId, chatId });
  }

  /**
   * Get online status
   */
  @SubscribeMessage('check_online')
  handleCheckOnline(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string },
  ) {
    const { userId } = data;
    this.isOnline(userId).then((isOnline) => {
      client.emit('user_status', { userId, isOnline });
    });
  }

  /**
   * Helper: Check if user is online
   */
  isUserOnline(userId: string): boolean {
    return false;
  }

  /**
   * Helper: Get online users count
   */

  /**
   * Helper: Get chat room name
   */
  private getRoom(chatId: string): string {
    return `chat:${chatId}`;
  }
  private joinChatRoom(client: Socket, chatId: string) {
    client.join(this.getRoom(chatId));
  }
  private async isOnline(userId: string): Promise<boolean> {
    return this.activeUsersService.isOnline(userId);
  }
  private throttleTypingKey(userId: string, chatId: string) {
    return `typing:${userId}:${chatId}`;
  }
}

import { Logger, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from 'src/auth/guards/ws-Jwt.guard';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/notifications',
})
@UseGuards(WsJwtGuard)
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(NotificationsGateway.name);

  private getUserRoom(userId: string): string {
    return `user:${userId}`;
  }

  handleConnection(@ConnectedSocket() client: Socket) {
    const userId = client.data?.userId as string | undefined;
    if (!userId) {
      client.disconnect();
      return;
    }

    client.join(this.getUserRoom(userId));
    this.logger.log(`✅ User ${userId} connected to notifications gateway`);
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    const userId = client.data?.userId as string | undefined;
    if (!userId) return;

    this.logger.log(
      `🔌 User ${userId} disconnected from notifications gateway`,
    );
  }

  /**
   * Emit an event to a specific user.
   * Room is: user:<userId>
   */
  emitToUser<TPayload>(userId: string, event: string, payload: TPayload) {
    this.server.to(this.getUserRoom(userId)).emit(event, payload);
  }

  /**
   * Optional debug endpoint: client can ask server for its joined userId.
   * Not required by UI; kept minimal.
   */
  @SubscribeMessage('ping')
  ping(@ConnectedSocket() client: Socket, @MessageBody() _data: unknown) {
    const userId = client.data?.userId as string | undefined;
    return { ok: true, userId };
  }
}

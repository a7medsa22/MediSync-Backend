import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConnectionStatus, UserRole } from '@prisma/client';
import {
  chatDetailsSelect,
  connectionSelect,
  lastMessageSelect,
} from 'src/common/selects/chat.select';
import { ChatDetailsResponseDto } from '../dto';
import { RedisService } from 'src/common/redis/redis.service';
import { ChatMapper } from 'src/common/mappers/chat.mapper';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getOrCreateChat(connectionId: string) {
    type ConnectionResult = {
      id: string;
      status: string;
      lastMessageAt: Date | null;
      unreadCount: number;
      doctor: {
        id: string;
        userId: string;
        user: { id: string; firstName: string; lastName: string };
      };
      patient: {
        id: string;
        userId: string;
        user: { id: string; firstName: string; lastName: string };
      };
    };
    const connection = await this.prisma.doctorPatientConnection.findUnique({
      where: { id: connectionId },
      select: connectionSelect,
    }) as ConnectionResult | null;

    if (!connection) throw new NotFoundException('Connection not found');
    if (connection.status !== ConnectionStatus.ACTIVE)
      throw new BadRequestException('Connection is not active');

    let chat = await this.prisma.chat.findUnique({
      where: { connectionId: connection.id },
      select: {
        id: true,
        connectionId: true,
      },
    });

    if (!chat) {
      chat = await this.prisma.$transaction(async (prisma) => {
        const newChat = await prisma.chat.create({
          data: { connectionId },
        });

        await prisma.message.create({
          data: {
            chatId: newChat.id,
            senderId: connection.doctor.userId,
            content: 'Chat started. You can now communicate securely.',
            messageType: 'SYSTEM',
            isRead: true,
          },
        });
        return newChat;
      }); 
    }

    return {
      chatId: chat.id,
      connectionId: connection.id,
      doctor: {
        id: connection.doctor.id,
        name: `${connection.doctor.user.firstName} ${connection.doctor.user.lastName}`,
      },
      patient: {
        id: connection.patient.id,
        name: `${connection.patient.user.firstName} ${connection.patient.user.lastName}`,
      },
    };
  }

  async getUserChats(userId: string, role: UserRole) {
    const cacheKey = `chat:user-chats:${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    let profileId: string;

    if (role === UserRole.DOCTOR) {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!doctor) throw new NotFoundException('Doctor profile not found');
      profileId = doctor.id;
    } else if (role === UserRole.PATIENT) {
      const patient = await this.prisma.patient.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('Patient profile not found');
      profileId = patient.id;
    } else {
      throw new ForbiddenException(
        'Only doctors and patients can access chats',
      );
    }

    const connections = await this.prisma.doctorPatientConnection.findMany({
      where:
        role === UserRole.DOCTOR
          ? { doctorId: profileId, status: ConnectionStatus.ACTIVE }
          : { patientId: profileId, status: ConnectionStatus.ACTIVE },

      select: {
        ...connectionSelect,

        chat: {
          select: {
            id: true,
            messages: lastMessageSelect.messages,
          },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    return connections.map((c) => ChatMapper.toConnectionListItem(c, role));
  }

  async getChatDetails(chatId: string, userId: string) {
    const cacheKey = `chat:details:${chatId}`;
    const cached = await this.redis.get<ChatDetailsResponseDto>(cacheKey);
    if (cached) {
      // still verify access quickly if you want extra safety
      if (
        !(cached.doctor.userId === userId || cached.patient.userId === userId)
      ) {
        throw new ForbiddenException('You do not have access to this chat');
      }
      return cached;
    }

    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: chatDetailsSelect,
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    if (
      !(
        chat.connection.doctor.user.id === userId ||
        chat.connection.patient.user.id === userId
      )
    ) {
      throw new ForbiddenException('You do not have access to this chat');
    }

    if (!this.hasAccess(chat, userId)) {
      throw new ForbiddenException('No access');
    }

    const dto = ChatMapper.toChatDetailsDto(chat);

    await this.redis.set(cacheKey, dto, 300); // cache for 5 minutes

    return dto;
  }

  async getUnreadCount(userId: string, role: UserRole) {
    const profile = await this.getProfile(userId, role);
    if (!profile) throw new NotFoundException('Profile not found');

    const filterField = role === UserRole.DOCTOR ? 'doctorId' : 'patientId';

    // Aggregate unread counts
    const result = await this.prisma.doctorPatientConnection.aggregate({
      where: {
        [filterField]: profile.id,
        status: ConnectionStatus.ACTIVE,
      },
      _sum: {
        unreadCount: true,
      },
    });

    return result._sum.unreadCount || 0;
  }

  async verifyUserAccess(chatId: string, userId: string) {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: chatDetailsSelect,
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    return (
      chat.connection.doctor.user.id === userId ||
      chat.connection.patient.user.id === userId
    );
  }

  async updateConnectionLastMessage(
    connectionId: string,
    lastMessageAt: Date,
    preview: string,
  ) {
    const previewText = this.shortenPreview(preview);

    await this.prisma.$transaction([
      this.prisma.doctorPatientConnection.update({
        where: { id: connectionId },
        data: { lastMessageAt, lastActivityAt: lastMessageAt },
      }),
      this.prisma.chat.update({
        where: { connectionId },
        data: { lastMessageAt, lastMessagePreview: previewText },
      }),
    ]);

    return true;
  }

  async incrementUnreadCount(connectionId: string, recipientRole: UserRole) {
    await this.prisma.doctorPatientConnection.update({
      where: { id: connectionId },
      data: {
        unreadCount: { increment: 1 },
      },
    });
  }

  async resetUnreadCount(chatId: string, userId: string) {
    const chat = await this.getChatDetails(chatId, userId);

    await this.prisma.doctorPatientConnection.update({
      where: { id: chat.connectionId },
      data: {
        unreadCount: 0,
      },
    });
  }

  // Fetch minimal chat header info with caching
  async getChatHeader(chatId: string) {
    const cacheKey = `chat:header:${chatId}`;

    // 1) Try cache
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    // 2) Fetch minimal data
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        id: true,
        connection: {
          select: {
            status: true,
            doctor: { select: { userId: true } },
            patient: { select: { userId: true } },
          },
        },
      },
    });

    if (!chat) throw new NotFoundException('Chat not found');

    // 3) Cache
    await this.redis.set(cacheKey, chat, 300);

    return chat;
  }

  private async getProfile(userId: string, role: UserRole) {
    return role === UserRole.DOCTOR
      ? this.prisma.doctor.findUnique({ where: { userId } })
      : this.prisma.patient.findUnique({ where: { userId } });
  }
  private shortenPreview(text: string) {
    return text.length > 200 ? text.slice(0, 200) : text;
  }
  canAccessChat(chatHeader: any, userId: string) {
    return (
      chatHeader.doctor.userId === userId ||
      chatHeader.patient.userId === userId
    );
  }
  hasAccess(chat: any, userId: string) {
    return (
      chat.connection.doctor.user.id === userId ||
      chat.connection.patient.user.id === userId
    );
  }
}

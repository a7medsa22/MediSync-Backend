import { Test, TestingModule } from '@nestjs/testing';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './service/chat.service';
import { MessageService } from './message.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { RedisService } from 'src/common/redis/redis.service';
import { ActiveUsersService } from './service/active-users.service';
import { ChatEventsService } from './service/chat-events.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

describe('ChatGateway', () => {
  let gateway: ChatGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        { provide: ChatService, useValue: {} },
        { provide: MessageService, useValue: {} },
        { provide: RedisService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: ActiveUsersService, useValue: {} },
        { provide: ChatEventsService, useValue: {} },
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: {} },
      ],
    }).compile();

    gateway = module.get<ChatGateway>(ChatGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});

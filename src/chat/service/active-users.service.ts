import { Injectable } from '@nestjs/common';
import { RedisService } from 'src/common/redis/redis.service';

@Injectable()
export class ActiveUsersService {
  constructor(private readonly redis: RedisService) {}

  async setOnline(userId: string, socketId: string) {
    await this.redis.set(`user:${userId}:online`, socketId, 60 * 5); // 5 minutes
  }

  async unsetOnline(userId: string) {
    await this.redis.del(`user:${userId}:online`);
  }

  async isOnline(userId: string): Promise<boolean> {
    return (await this.redis.get<string>(`user:${userId}:online`)) !== null;
  }
}

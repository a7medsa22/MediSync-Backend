import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CacheKeys } from './cache-keys.util';

@Injectable()
export class NotificationCacheService {
  private readonly TTL = 3600; // 1 hour

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getUnreadCount(userId: string) {
    const key = CacheKeys.notification.unreadCount(userId);
    const cached = await this.redis.get<number>(key);
    
    if (cached !== null) return cached;

    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });

    await this.redis.set(key, count, this.TTL);
    return count;
  }

  async incrementUnreadCount(userId: string) {
    const key = CacheKeys.notification.unreadCount(userId);
    const client = this.redis.getClient();
    await client.incr(key);
  }

  async invalidateUnreadCount(userId: string) {
    const key = CacheKeys.notification.unreadCount(userId);
    await this.redis.del(key);
  }
}

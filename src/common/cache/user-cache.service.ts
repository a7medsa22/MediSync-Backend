import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CacheKeys } from './cache-keys.util';

@Injectable()
export class UserCacheService {
  private readonly TTL = 3600; // 1 hour

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Business-oriented method to get a user snapshot.
   * Encapsulates cache keys and data fetching logic.
   */
  async getUserSnapshot(userId: string) {
    const key = CacheKeys.user.snapshot(userId);

    // 1. Try cache
    const cached = await this.redis.get<{
      id: string;
      firstName: string;
      lastName: string;
      role: string;
    }>(key);

    if (cached) return cached;

    // 2. Fetch from DB
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });

    if (!user) return null;

    // 3. Cache results
    await this.redis.set(key, user, this.TTL);

    return user;
  }

  /**
   * Invalidate user cache when data changes
   */
  async invalidateUser(userId: string) {
    const keys = [
      CacheKeys.user.snapshot(userId),
      CacheKeys.user.profile(userId),
    ];
    await this.redis.del(...keys);
  }
}

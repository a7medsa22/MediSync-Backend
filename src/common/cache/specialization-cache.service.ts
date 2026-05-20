import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CacheKeys } from './cache-keys.util';

@Injectable()
export class SpecializationCacheService {
  private readonly TTL = 86400; // 24 hours

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getAllSpecializations() {
    const key = CacheKeys.specialization.list();
    const cached = await this.redis.get<any[]>(key);
    if (cached) return cached;

    const specializations = await this.prisma.specialization.findMany({
      include: {
        _count: { select: { doctors: true } },
      },
      orderBy: { name: 'asc' },
    });

    await this.redis.set(key, specializations, this.TTL);
    return specializations;
  }

  async invalidateAll() {
    await this.redis.del(CacheKeys.specialization.list());
  }
}

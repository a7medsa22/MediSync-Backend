import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { CacheKeys } from './cache-keys.util';

@Injectable()
export class AnalyticsCacheService {
  private readonly TTL = 300; // 5 minutes

  constructor(private readonly redis: RedisService) {}

  async getSystemStats() {
    const key = CacheKeys.analytics.systemStats();
    return this.redis.get(key);
  }

  async cacheSystemStats(stats: any) {
    const key = CacheKeys.analytics.systemStats();
    await this.redis.set(key, stats, this.TTL);
  }

  async getDoctorDailyStats(doctorId: string, date: string) {
    const key = CacheKeys.analytics.doctorDaily(doctorId, date);
    return this.redis.get(key);
  }

  async cacheDoctorDailyStats(doctorId: string, date: string, stats: any) {
    const key = CacheKeys.analytics.doctorDaily(doctorId, date);
    await this.redis.set(key, stats, this.TTL);
  }
}

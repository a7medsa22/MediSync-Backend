import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { CacheKeys } from './cache-keys.util';

@Injectable()
export class DoctorCacheService {
  private readonly PROFILE_TTL = 3600; // 1 hour
  private readonly REVIEWS_TTL = 1800; // 30 mins

  constructor(private readonly redis: RedisService) {}

  async getDoctorProfile(doctorId: string): Promise<any | null> {
    const key = CacheKeys.doctor.profile(doctorId);
    return this.redis.get<any>(key);
  }

  async cacheDoctorProfile(doctorId: string, profile: any): Promise<void> {
    const key = CacheKeys.doctor.profile(doctorId);
    await this.redis.set(key, profile, this.PROFILE_TTL);
  }

  async getDoctorReviews(doctorId: string): Promise<any | null> {
    const key = CacheKeys.doctor.reviews(doctorId);
    return this.redis.get<any>(key);
  }

  async cacheDoctorReviews(doctorId: string, reviewsData: any): Promise<void> {
    const key = CacheKeys.doctor.reviews(doctorId);
    await this.redis.set(key, reviewsData, this.REVIEWS_TTL);
  }

  async invalidateDoctorProfile(doctorId: string): Promise<void> {
    const key = CacheKeys.doctor.profile(doctorId);
    await this.redis.del(key);
  }

  async invalidateDoctorReviews(doctorId: string): Promise<void> {
    const key = CacheKeys.doctor.reviews(doctorId);
    await this.redis.del(key);
  }

  async invalidateAllDoctorCache(doctorId: string): Promise<void> {
    const keys = [
      CacheKeys.doctor.profile(doctorId),
      CacheKeys.doctor.reviews(doctorId),
    ];
    await this.redis.del(...keys);
  }
}

import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { CacheKeys } from './cache-keys.util';

@Injectable()
export class ClinicCacheService {
  private readonly CLINIC_TTL = 3600; // 1 hour

  constructor(private readonly redis: RedisService) {}

  async getClinicDetails(clinicId: string): Promise<any | null> {
    const key = CacheKeys.clinic.details(clinicId);
    return this.redis.get<any>(key);
  }

  async cacheClinicDetails(clinicId: string, clinicData: any): Promise<void> {
    const key = CacheKeys.clinic.details(clinicId);
    await this.redis.set(key, clinicData, this.CLINIC_TTL);
  }

  async invalidateClinicDetails(clinicId: string): Promise<void> {
    const key = CacheKeys.clinic.details(clinicId);
    await this.redis.del(key);
  }

  async getClinicSearchResults(query: any): Promise<any | null> {
    const key = CacheKeys.clinic.search(query);
    return this.redis.get<any>(key);
  }

  async cacheClinicSearchResults(query: any, results: any): Promise<void> {
    const key = CacheKeys.clinic.search(query);
    await this.redis.set(key, results, this.CLINIC_TTL);
  }

  async invalidateClinicSearchCache(): Promise<void> {
    const pattern = CacheKeys.clinic.searchPattern();
    await this.redis.delPattern(pattern);
  }
}

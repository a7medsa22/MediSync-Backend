import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { CacheKeys } from './cache-keys.util';

@Injectable()
export class AppointmentCacheService {
  private readonly DEFAULT_TTL = 1800; // 30 minutes

  constructor(private readonly redis: RedisService) {}

  async getAppointmentDetails(appointmentId: string) {
    const key = CacheKeys.appointment.details(appointmentId);
    return this.redis.get(key);
  }

  async cacheAppointmentDetails(appointmentId: string, data: any) {
    const key = CacheKeys.appointment.details(appointmentId);
    await this.redis.set(key, data, this.DEFAULT_TTL);
  }

  async invalidateAppointment(appointmentId: string) {
    const key = CacheKeys.appointment.details(appointmentId);
    await this.redis.del(key);
  }

  /**
   * Example of batch invalidation for a doctor's list
   */
  async invalidateDoctorSchedule(doctorId: string) {
    const pattern = `appointment:list:dr:${doctorId}:*`;
    const keys = await this.redis.scan(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

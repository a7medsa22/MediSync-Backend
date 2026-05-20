import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { CacheKeys } from './cache-keys.util';

export interface DrugInteraction {
  drugName: string;
  interactions: Array<{
    drugName: string;
    severity: 'LOW' | 'MODERATE' | 'HIGH' | 'CONTRAINDICATED';
    description: string;
    recommendation: string;
  }>;
}

@Injectable()
export class PrescriptionCacheService {
  private readonly TTL = 604800; // 7 days (medical data doesn't change daily)

  constructor(private readonly redis: RedisService) {}

  async getDrugInteraction(drugName: string): Promise<DrugInteraction | null> {
    const key = CacheKeys.prescription.interaction(drugName);
    return this.redis.get<DrugInteraction>(key);
  }

  async cacheDrugInteraction(interaction: DrugInteraction): Promise<void> {
    const key = CacheKeys.prescription.interaction(interaction.drugName);
    await this.redis.set(key, interaction, this.TTL);
  }

  async getPatientPrescriptions(patientId: string): Promise<any[] | null> {
    const key = CacheKeys.prescription.patientList(patientId);
    return this.redis.get<any[]>(key);
  }

  async cachePatientPrescriptions(patientId: string, prescriptions: any[]): Promise<void> {
    const key = CacheKeys.prescription.patientList(patientId);
    await this.redis.set(key, prescriptions, 3600); // 1 hour TTL
  }

  async invalidatePatientPrescriptions(patientId: string): Promise<void> {
    const key = CacheKeys.prescription.patientList(patientId);
    await this.redis.del(key);
  }
}

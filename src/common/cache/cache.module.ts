import { Global, Module } from '@nestjs/common';
import { UserCacheService } from './user-cache.service';
import { AppointmentCacheService } from './appointment-cache.service';
import { NotificationCacheService } from './notification-cache.service';
import { SpecializationCacheService } from './specialization-cache.service';
import { AnalyticsCacheService } from './analytics-cache.service';
import { PrescriptionCacheService } from './prescription-cache.service';
import { DoctorCacheService } from './doctor-cache.service';
import { ClinicCacheService } from './clinic-cache.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';

@Global()
@Module({
  imports: [PrismaModule, RedisModule],
  providers: [
    UserCacheService,
    AppointmentCacheService,
    NotificationCacheService,
    SpecializationCacheService,
    AnalyticsCacheService,
    PrescriptionCacheService,
    DoctorCacheService,
    ClinicCacheService,
  ],
  exports: [
    UserCacheService,
    AppointmentCacheService,
    NotificationCacheService,
    SpecializationCacheService,
    AnalyticsCacheService,
    PrescriptionCacheService,
    DoctorCacheService,
    ClinicCacheService,
  ],
})
export class CacheModule {}


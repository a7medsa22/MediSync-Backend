import { Global, Module } from '@nestjs/common';
import { RedisLockService } from './redis-lock.service';
import { RedisModule } from '../redis/redis.module';

@Global()
@Module({
  imports: [RedisModule],
  providers: [RedisLockService],
  exports: [RedisLockService],
})
export class RedisLockModule {}

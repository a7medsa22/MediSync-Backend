import { Global, Module } from '@nestjs/common';
import { RedisPubSubService } from './redis-pubsub.service';
import { RedisModule } from '../redis/redis.module';

@Global()
@Module({
  imports: [RedisModule],
  providers: [RedisPubSubService],
  exports: [RedisPubSubService],
})
export class RedisPubSubModule {}

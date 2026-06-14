import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class RedisPubSubService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisPubSubService.name);
  private subscriberClient: Redis | null = null;

  constructor(private readonly redis: RedisService) {}

  /**
   * Publish a message to a channel
   */
  async publish(channel: string, message: any): Promise<number> {
    const payload =
      typeof message === 'string' ? message : JSON.stringify(message);
    return this.redis.getClient().publish(channel, payload);
  }

  /**
   * Subscribe to a channel
   */
  async subscribe(
    channel: string,
    callback: (message: string) => void,
  ): Promise<void> {
    if (!this.subscriberClient) {
      this.subscriberClient = this.redis.getClient().duplicate();
      this.subscriberClient.on('error', (err) =>
        this.logger.error('Subscriber Redis error', err),
      );
    }

    await this.subscriberClient.subscribe(channel);
    this.subscriberClient.on('message', (chan, msg) => {
      if (chan === channel) {
        callback(msg);
      }
    });
  }

  async onModuleDestroy() {
    if (this.subscriberClient) {
      await this.subscriberClient.quit();
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RedisLockService {
  private readonly logger = new Logger(RedisLockService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Acquire a distributed lock
   * @param resource The resource key to lock
   * @param ttl Lock duration in milliseconds
   * @param retries Number of retries if lock is held
   * @param delay Delay between retries in milliseconds
   * @returns Lock token if acquired, null otherwise
   */
  async acquire(
    resource: string,
    ttl: number = 5000,
    retries: number = 3,
    delay: number = 100,
  ): Promise<string | null> {
    const lockKey = `lock:${resource}`;
    const token = uuidv4();
    const client = this.redis.getClient();

    let attempt = 0;
    while (attempt <= retries) {
      const result = await client.set(lockKey, token, 'PX', ttl, 'NX');
      if (result === 'OK') {
        return token;
      }

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      attempt++;
    }

    return null;
  }

  /**
   * Release a distributed lock safely using Lua script
   * Ensures only the owner of the lock can release it
   */
  async release(resource: string, token: string): Promise<boolean> {
    const lockKey = `lock:${resource}`;
    const client = this.redis.getClient();

    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const result = await client.eval(script, 1, lockKey, token);
      return result === 1;
    } catch (error) {
      this.logger.error(`Failed to release lock for ${resource}`, error);
      return false;
    }
  }

  /**
   * Execute a function within a lock
   */
  async runWithLock<T>(
    resource: string,
    work: () => Promise<T>,
    ttl: number = 5000,
  ): Promise<T> {
    const token = await this.acquire(resource, ttl);
    if (!token) {
      throw new Error(`Could not acquire lock for resource: ${resource}`);
    }

    try {
      return await work();
    } finally {
      await this.release(resource, token);
    }
  }
}

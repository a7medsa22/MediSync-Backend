import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;
  private metrics = {
    hits: 0,
    misses: 0,
    errors: 0,
  };

  async onModuleInit() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        this.logger.warn(`Retrying Redis connection in ${delay}ms (attempt ${times})`);
        return delay;
      },
    });

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) => this.logger.error('Redis error', err));
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  /**
   * Get the underlying ioredis client for advanced operations
   */
  getClient(): Redis {
    return this.client;
  }

  // --- Basic Operations ---

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.client.get(key);
      if (data) {
        this.metrics.hits++;
        return JSON.parse(data) as T;
      }
      this.metrics.misses++;
      return null;
    } catch (error) {
      this.metrics.errors++;
      this.logger.error(`Failed to get key: ${key}`, error);
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    try {
      const payload = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.set(key, payload, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, payload);
      }
    } catch (error) {
      this.logger.error(`Failed to set key: ${key}`, error);
    }
  }

  async del(...keys: string[]): Promise<void> {
    try {
      if (keys.length === 0) return;
      await this.client.del(...keys);
    } catch (error) {
      this.logger.error(`Failed to delete keys: ${keys}`, error);
    }
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  // --- Batch Operations ---

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    try {
      const results = await this.client.mget(keys);
      return results.map((data) => (data ? (JSON.parse(data) as T) : null));
    } catch (error) {
      this.logger.error(`Failed to mget keys: ${keys}`, error);
      return keys.map(() => null);
    }
  }

  /**
   * Atomic multi/pipeline helper
   */
  async pipeline(callback: (pipe: any) => void): Promise<any[]> {
    const pipe = this.client.pipeline();
    callback(pipe);
    return (await pipe.exec()) ?? [];
  }

  // --- Health & Maintenance ---

  async ping(): Promise<string> {
    return this.client.ping();
  }

  /**
   * Scan keys using a pattern (Production-safe alternative to KEYS *)
   */
  async scan(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [newCursor, foundKeys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = newCursor;
      keys.push(...foundKeys);
    } while (cursor !== '0');
    return keys;
  }

  // --- Metrics & Health ---

  getMetrics() {
    return { ...this.metrics };
  }

  async getHealth() {
    try {
      const status = await this.client.ping();
      return {
        status: 'up',
        redisStatus: status,
      };
    } catch (error) {
      return {
        status: 'down',
        error: error,
      };
    }
  }
}

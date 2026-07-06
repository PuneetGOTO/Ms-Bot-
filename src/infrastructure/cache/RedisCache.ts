import Redis from "ioredis";

import type { Cache, MusicCache } from "../../application/ports/Cache";
import type { Logger } from "../../application/ports/Logger";
import type { QueueSnapshot, TrackResolveResult } from "../../domain/music/types";

/**
 * Redis JSON cache for hot metadata, queues, searches, lyrics, and rate-limit state.
 */
export class RedisCache implements Cache, MusicCache {
  public constructor(
    private readonly redis: Redis,
    private readonly logger: Logger,
    private readonly ttl: {
      readonly track: number;
      readonly search: number;
    }
  ) {}

  public static create(
    url: string,
    logger: Logger,
    ttl: { readonly track: number; readonly search: number }
  ): RedisCache {
    return new RedisCache(
      new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        enableAutoPipelining: true
      }),
      logger,
      ttl
    );
  }

  public async connect(): Promise<void> {
    await this.redis.connect();
    this.logger.info({}, "Redis connected.");
  }

  public async disconnect(): Promise<void> {
    await this.redis.quit();
  }

  public async ping(): Promise<string> {
    return this.redis.ping();
  }

  public async getJson<TValue>(key: string): Promise<TValue | null> {
    const raw = await this.redis.get(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as TValue;
  }

  public async setJson<TValue>(key: string, value: TValue, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  }

  public async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  public async rememberJson<TValue>(
    key: string,
    ttlSeconds: number,
    factory: () => Promise<TValue>
  ): Promise<TValue> {
    const cached = await this.getJson<TValue>(key);
    if (cached) {
      return cached;
    }
    const value = await factory();
    await this.setJson(key, value, ttlSeconds);
    return value;
  }

  public async getTrackResolve(identifier: string): Promise<TrackResolveResult | null> {
    return this.getJson<TrackResolveResult>(`track:${identifier}`);
  }

  public async setTrackResolve(identifier: string, result: TrackResolveResult): Promise<void> {
    await this.setJson(`track:${identifier}`, result, this.ttl.track);
  }

  public async getQueue(guildId: string): Promise<QueueSnapshot | null> {
    return this.getJson<QueueSnapshot>(`queue:${guildId}`);
  }

  public async setQueue(snapshot: QueueSnapshot): Promise<void> {
    await this.setJson(`queue:${snapshot.guildId}`, snapshot, this.ttl.search);
  }

  public async deleteQueue(guildId: string): Promise<void> {
    await this.delete(`queue:${guildId}`);
  }
}

import type { QueueSnapshot, TrackResolveResult } from "../../domain/music/types";

export interface Cache {
  getJson<TValue>(key: string): Promise<TValue | null>;
  setJson<TValue>(key: string, value: TValue, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  rememberJson<TValue>(
    key: string,
    ttlSeconds: number,
    factory: () => Promise<TValue>
  ): Promise<TValue>;
}

export interface MusicCache {
  getTrackResolve(identifier: string): Promise<TrackResolveResult | null>;
  setTrackResolve(identifier: string, result: TrackResolveResult): Promise<void>;
  getQueue(guildId: string): Promise<QueueSnapshot | null>;
  setQueue(snapshot: QueueSnapshot): Promise<void>;
  deleteQueue(guildId: string): Promise<void>;
}

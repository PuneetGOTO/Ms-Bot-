import type { GuildSettings } from "../../domain/guild/GuildSettings";
import type {
  NodeStatusSnapshot,
  QueueSnapshot,
  QueueTrack,
  SourceType
} from "../../domain/music/types";

export interface GuildSettingsRepository {
  getOrCreate(guildId: string): Promise<GuildSettings>;
  save(settings: GuildSettings): Promise<GuildSettings>;
}

export interface QueueSnapshotRepository {
  get(guildId: string): Promise<QueueSnapshot | null>;
  save(snapshot: QueueSnapshot): Promise<void>;
  delete(guildId: string): Promise<void>;
}

export interface HistoryRecord {
  readonly guildId: string;
  readonly userId: string;
  readonly track: QueueTrack;
  readonly eventType: "PLAY" | "PAUSE" | "RESUME" | "STOP" | "SKIP" | "SEEK" | "FINISH" | "ERROR";
  readonly positionMs?: number;
}

export interface HistoryRepository {
  add(record: HistoryRecord): Promise<void>;
  list(guildId: string, limit: number): Promise<readonly QueueTrack[]>;
}

export interface FavoriteRepository {
  add(userId: string, track: QueueTrack): Promise<void>;
  remove(userId: string, identifier: string): Promise<void>;
  list(userId: string, limit: number): Promise<readonly QueueTrack[]>;
}

export interface PlaylistTrackInput {
  readonly source: SourceType;
  readonly identifier: string;
  readonly encoded: string | null;
  readonly title: string;
  readonly uri: string | null;
  readonly author: string | null;
  readonly durationMs: number | null;
  readonly artworkUrl: string | null;
  readonly addedById: string;
}

export interface PlaylistReadModel {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly isPublic: boolean;
  readonly tracks: readonly PlaylistTrackInput[];
}

export interface PlaylistRepository {
  create(input: {
    readonly ownerId: string;
    readonly guildId: string | null;
    readonly name: string;
    readonly description: string | null;
    readonly isPublic: boolean;
  }): Promise<PlaylistReadModel>;
  addTracks(playlistId: string, tracks: readonly PlaylistTrackInput[]): Promise<void>;
  getByName(ownerId: string, name: string): Promise<PlaylistReadModel | null>;
  list(ownerId: string): Promise<readonly PlaylistReadModel[]>;
  delete(ownerId: string, name: string): Promise<void>;
}

export interface PremiumRepository {
  hasPremium(userId: string): Promise<boolean>;
}

export interface AnalyticsRepository {
  record(input: {
    readonly guildId: string;
    readonly eventType: "PLAY" | "PAUSE" | "RESUME" | "STOP" | "SKIP" | "SEEK" | "FINISH" | "ERROR";
    readonly source?: SourceType;
    readonly durationMs?: number;
    readonly latencyMs?: number;
    readonly nodeName?: string;
  }): Promise<void>;
}

export interface NodeStatusRepository {
  saveMany(nodes: readonly NodeStatusSnapshot[]): Promise<void>;
}

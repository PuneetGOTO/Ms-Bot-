import type {
  AudioFilters,
  NodeStatusSnapshot,
  Track,
  TrackResolveResult
} from "../../domain/music/types";

export interface ConnectPlayerOptions {
  readonly guildId: string;
  readonly voiceChannelId: string;
  readonly shardId: number;
  readonly deaf: boolean;
  readonly mute: boolean;
}

export interface PlayerHandle {
  readonly guildId: string;
  readonly nodeName: string;
  play(
    track: Track,
    options?: { readonly startTimeMs?: number; readonly endTimeMs?: number }
  ): Promise<void>;
  stop(): Promise<void>;
  pause(paused: boolean): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  setFilters(filters: AudioFilters): Promise<void>;
  moveNode(nodeName?: string): Promise<boolean>;
  destroy(): Promise<void>;
}

export interface MusicGateway {
  connect(options: ConnectPlayerOptions): Promise<PlayerHandle>;
  getPlayer(guildId: string): PlayerHandle | null;
  resolve(identifier: string, requesterId: string): Promise<TrackResolveResult>;
  destroy(guildId: string): Promise<void>;
  getNodeStatuses(): Promise<readonly NodeStatusSnapshot[]>;
}

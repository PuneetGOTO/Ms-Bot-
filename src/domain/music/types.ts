export type SourceType =
  | "YOUTUBE"
  | "SPOTIFY"
  | "APPLE_MUSIC"
  | "SOUNDCLOUD"
  | "DEEZER"
  | "HTTP"
  | "LOCAL"
  | "RADIO"
  | "UNKNOWN";

export type PlaybackStatus = "idle" | "connecting" | "playing" | "paused" | "stopped";

export type LoopMode = "OFF" | "TRACK" | "QUEUE";

export type TrackEndReason = "finished" | "loadFailed" | "stopped" | "replaced" | "cleanup";

export type EffectPreset =
  | "off"
  | "bassboost"
  | "treble"
  | "nightcore"
  | "vaporwave"
  | "karaoke"
  | "rotation"
  | "echo"
  | "reverb";

export interface EqualizerBand {
  readonly band: number;
  readonly gain: number;
}

export interface AudioFilters {
  readonly volume?: number;
  readonly equalizer?: readonly EqualizerBand[];
  readonly karaoke?: {
    readonly level?: number;
    readonly monoLevel?: number;
    readonly filterBand?: number;
    readonly filterWidth?: number;
  } | null;
  readonly timescale?: {
    readonly speed?: number;
    readonly pitch?: number;
    readonly rate?: number;
  } | null;
  readonly tremolo?: {
    readonly frequency?: number;
    readonly depth?: number;
  } | null;
  readonly vibrato?: {
    readonly frequency?: number;
    readonly depth?: number;
  } | null;
  readonly rotation?: {
    readonly rotationHz?: number;
  } | null;
  readonly distortion?: {
    readonly sinOffset?: number;
    readonly sinScale?: number;
    readonly cosOffset?: number;
    readonly cosScale?: number;
    readonly tanOffset?: number;
    readonly tanScale?: number;
    readonly offset?: number;
    readonly scale?: number;
  } | null;
  readonly channelMix?: {
    readonly leftToLeft?: number;
    readonly leftToRight?: number;
    readonly rightToLeft?: number;
    readonly rightToRight?: number;
  } | null;
  readonly lowPass?: {
    readonly smoothing?: number;
  } | null;
}

export interface Track {
  readonly encoded: string;
  readonly identifier: string;
  readonly source: SourceType;
  readonly title: string;
  readonly author: string;
  readonly durationMs: number | null;
  readonly uri: string | null;
  readonly artworkUrl: string | null;
  readonly isSeekable: boolean;
  readonly isStream: boolean;
  readonly requesterId: string;
  readonly requestedAt: Date;
}

export interface QueueTrack extends Track {
  readonly queueId: string;
}

export interface PlaylistInfo {
  readonly name: string;
  readonly selectedTrack: number;
}

export type TrackResolveResult =
  | {
      readonly type: "track";
      readonly tracks: readonly Track[];
    }
  | {
      readonly type: "playlist";
      readonly playlist: PlaylistInfo;
      readonly tracks: readonly Track[];
    }
  | {
      readonly type: "search";
      readonly tracks: readonly Track[];
    }
  | {
      readonly type: "empty";
      readonly tracks: readonly [];
    };

export interface QueueSnapshot {
  readonly guildId: string;
  readonly voiceChannelId: string | null;
  readonly textChannelId: string | null;
  readonly status: PlaybackStatus;
  readonly loopMode: LoopMode;
  readonly autoplay: boolean;
  readonly volume: number;
  readonly positionMs: number;
  readonly current: QueueTrack | null;
  readonly tracks: readonly QueueTrack[];
  readonly history: readonly QueueTrack[];
  readonly filters: AudioFilters;
  readonly updatedAt: string;
}

export interface QueueSummary {
  readonly guildId: string;
  readonly status: PlaybackStatus;
  readonly loopMode: LoopMode;
  readonly autoplay: boolean;
  readonly volume: number;
  readonly positionMs: number;
  readonly current: QueueTrack | null;
  readonly upcoming: readonly QueueTrack[];
  readonly history: readonly QueueTrack[];
}

export interface PlayRequest {
  readonly guildId: string;
  readonly voiceChannelId: string;
  readonly textChannelId: string | null;
  readonly shardId: number;
  readonly requesterId: string;
  readonly query: string;
  readonly searchOnly?: boolean;
}

export interface NodeStatusSnapshot {
  readonly name: string;
  readonly connected: boolean;
  readonly sessionId: string | null;
  readonly players: number;
  readonly playingPlayers: number;
  readonly cpuLoad: number | null;
  readonly memoryUsedBytes: bigint | null;
  readonly frameDeficit: number | null;
  readonly frameNulled: number | null;
  readonly pingMs: number | null;
  readonly lastError: string | null;
}

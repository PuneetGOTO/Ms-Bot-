import type {
  NodeStatusSnapshot,
  QueueSnapshot,
  QueueTrack,
  TrackEndReason
} from "../../domain/music/types";

export interface AppEvents {
  "music.track.started": {
    readonly guildId: string;
    readonly track: QueueTrack;
    readonly nodeName: string;
  };
  "music.track.ended": {
    readonly guildId: string;
    readonly reason: TrackEndReason;
  };
  "music.track.exception": {
    readonly guildId: string;
    readonly message: string;
  };
  "music.player.updated": {
    readonly guildId: string;
    readonly positionMs: number;
    readonly pingMs: number;
  };
  "music.queue.changed": {
    readonly guildId: string;
    readonly snapshot: QueueSnapshot;
  };
  "music.node.status": {
    readonly nodes: readonly NodeStatusSnapshot[];
  };
}

export type AppEventName = keyof AppEvents;

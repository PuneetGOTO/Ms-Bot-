import { randomUUID } from "node:crypto";

import { AppError } from "../errors/AppError";
import type {
  AudioFilters,
  LoopMode,
  QueueSnapshot,
  QueueSummary,
  QueueTrack,
  Track
} from "./types";

export interface QueueManagerOptions {
  readonly guildId: string;
  readonly maxQueueSize: number;
  readonly defaultVolume: number;
}

/**
 * Pure domain queue state machine. It has no Discord, Lavalink, Redis, or database dependency.
 */
export class QueueManager {
  private readonly guildId: string;
  private readonly maxQueueSize: number;
  private voiceChannelId: string | null = null;
  private textChannelId: string | null = null;
  private currentTrack: QueueTrack | null = null;
  private upcomingTracks: QueueTrack[] = [];
  private playedHistory: QueueTrack[] = [];
  private loopModeValue: LoopMode = "OFF";
  private autoplayValue = false;
  private volumeValue: number;
  private positionValue = 0;
  private statusValue: QueueSummary["status"] = "idle";
  private filtersValue: AudioFilters = {};

  public constructor(options: QueueManagerOptions) {
    this.guildId = options.guildId;
    this.maxQueueSize = options.maxQueueSize;
    this.volumeValue = options.defaultVolume;
  }

  /** Restores a queue from a persisted snapshot after process or shard recovery. */
  public static fromSnapshot(snapshot: QueueSnapshot, maxQueueSize: number): QueueManager {
    const manager = new QueueManager({
      guildId: snapshot.guildId,
      maxQueueSize,
      defaultVolume: snapshot.volume
    });
    manager.voiceChannelId = snapshot.voiceChannelId;
    manager.textChannelId = snapshot.textChannelId;
    manager.statusValue = snapshot.status;
    manager.loopModeValue = snapshot.loopMode;
    manager.autoplayValue = snapshot.autoplay;
    manager.volumeValue = snapshot.volume;
    manager.positionValue = snapshot.positionMs;
    manager.currentTrack = snapshot.current;
    manager.upcomingTracks = [...snapshot.tracks];
    manager.playedHistory = [...snapshot.history];
    manager.filtersValue = snapshot.filters;
    return manager;
  }

  /** Updates the active Discord channel context for recovery and audit logs. */
  public setChannelContext(voiceChannelId: string, textChannelId: string | null): void {
    this.voiceChannelId = voiceChannelId;
    this.textChannelId = textChannelId;
  }

  /** Adds one or more tracks and returns the queue records created for them. */
  public enqueue(tracks: readonly Track[]): readonly QueueTrack[] {
    if (tracks.length === 0) {
      return [];
    }

    if (this.size + tracks.length > this.maxQueueSize) {
      throw new AppError("VALIDATION_FAILED", "Queue size limit exceeded.", {
        details: { guildId: this.guildId, maxQueueSize: this.maxQueueSize, incoming: tracks.length }
      });
    }

    const queued = tracks.map((track) => ({ ...track, queueId: randomUUID() }));
    this.upcomingTracks.push(...queued);
    return queued;
  }

  /** Returns the next track that should be played according to loop mode. */
  public next(): QueueTrack | null {
    if (this.currentTrack && this.loopModeValue === "TRACK") {
      this.positionValue = 0;
      return this.currentTrack;
    }

    if (this.currentTrack) {
      this.playedHistory.unshift(this.currentTrack);
      this.playedHistory = this.playedHistory.slice(0, 100);
    }

    if (this.upcomingTracks.length === 0 && this.loopModeValue === "QUEUE") {
      this.upcomingTracks = this.playedHistory.reverse();
      this.playedHistory = [];
    }

    this.currentTrack = this.upcomingTracks.shift() ?? null;
    this.positionValue = 0;
    this.statusValue = this.currentTrack ? "playing" : "idle";
    return this.currentTrack;
  }

  /** Moves back to the most recent track in playback history. */
  public previous(): QueueTrack | null {
    const previousTrack = this.playedHistory.shift() ?? null;
    if (!previousTrack) {
      return null;
    }

    if (this.currentTrack) {
      this.upcomingTracks.unshift(this.currentTrack);
    }

    this.currentTrack = previousTrack;
    this.positionValue = 0;
    this.statusValue = "playing";
    return previousTrack;
  }

  /** Jumps to a one-based queue position and returns the selected track. */
  public jump(position: number): QueueTrack {
    this.assertQueuePosition(position);
    const [track] = this.upcomingTracks.splice(position - 1, 1);
    if (!track) {
      throw new AppError("NOT_FOUND", "Track not found at requested queue position.");
    }

    if (this.currentTrack) {
      this.playedHistory.unshift(this.currentTrack);
    }

    this.currentTrack = track;
    this.positionValue = 0;
    this.statusValue = "playing";
    return track;
  }

  /** Removes a one-based queue position from the upcoming queue. */
  public remove(position: number): QueueTrack {
    this.assertQueuePosition(position);
    const [removed] = this.upcomingTracks.splice(position - 1, 1);
    if (!removed) {
      throw new AppError("NOT_FOUND", "Track not found at requested queue position.");
    }
    return removed;
  }

  /** Moves an upcoming track from one one-based position to another. */
  public move(from: number, to: number): QueueTrack {
    this.assertQueuePosition(from);
    this.assertInsertPosition(to);
    const [track] = this.upcomingTracks.splice(from - 1, 1);
    if (!track) {
      throw new AppError("NOT_FOUND", "Track not found at requested queue position.");
    }
    this.upcomingTracks.splice(to - 1, 0, track);
    return track;
  }

  /** Clears upcoming tracks without touching the current track or history. */
  public clear(): void {
    this.upcomingTracks = [];
  }

  /** Shuffles upcoming tracks using Fisher-Yates. */
  public shuffle(seedRandom: () => number = Math.random): void {
    for (let index = this.upcomingTracks.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(seedRandom() * (index + 1));
      const current = this.upcomingTracks[index];
      const swap = this.upcomingTracks[swapIndex];
      if (!current || !swap) {
        continue;
      }
      this.upcomingTracks[index] = swap;
      this.upcomingTracks[swapIndex] = current;
    }
  }

  /** Marks the player state as paused. */
  public markPaused(): void {
    this.statusValue = "paused";
  }

  /** Marks the player state as playing. */
  public markPlaying(): void {
    this.statusValue = "playing";
  }

  /** Marks the player state as connecting. */
  public markConnecting(): void {
    this.statusValue = "connecting";
  }

  /** Marks the player state as stopped and resets the current track. */
  public stop(): void {
    if (this.currentTrack) {
      this.playedHistory.unshift(this.currentTrack);
      this.playedHistory = this.playedHistory.slice(0, 100);
    }
    this.currentTrack = null;
    this.positionValue = 0;
    this.statusValue = "stopped";
  }

  /** Updates current playback position from Lavalink player updates. */
  public setPosition(positionMs: number): void {
    this.positionValue = Math.max(0, Math.floor(positionMs));
  }

  /** Updates volume after validation. */
  public setVolume(volume: number, maxVolume: number): void {
    if (!Number.isInteger(volume) || volume < 0 || volume > maxVolume) {
      throw new AppError("VALIDATION_FAILED", "Volume is out of range.", {
        details: { volume, maxVolume }
      });
    }
    this.volumeValue = volume;
  }

  /** Sets loop mode. */
  public setLoopMode(loopMode: LoopMode): void {
    this.loopModeValue = loopMode;
  }

  /** Enables or disables autoplay. */
  public setAutoplay(enabled: boolean): void {
    this.autoplayValue = enabled;
  }

  /** Stores the active audio filters for snapshot and REST visibility. */
  public setFilters(filters: AudioFilters): void {
    this.filtersValue = filters;
  }

  /** Returns a serializable snapshot suitable for Redis or PostgreSQL. */
  public snapshot(): QueueSnapshot {
    return {
      guildId: this.guildId,
      voiceChannelId: this.voiceChannelId,
      textChannelId: this.textChannelId,
      status: this.statusValue,
      loopMode: this.loopModeValue,
      autoplay: this.autoplayValue,
      volume: this.volumeValue,
      positionMs: this.positionValue,
      current: this.currentTrack,
      tracks: [...this.upcomingTracks],
      history: [...this.playedHistory],
      filters: this.filtersValue,
      updatedAt: new Date().toISOString()
    };
  }

  /** Returns a read model for commands and API responses. */
  public summary(): QueueSummary {
    return {
      guildId: this.guildId,
      status: this.statusValue,
      loopMode: this.loopModeValue,
      autoplay: this.autoplayValue,
      volume: this.volumeValue,
      positionMs: this.positionValue,
      current: this.currentTrack,
      upcoming: [...this.upcomingTracks],
      history: [...this.playedHistory]
    };
  }

  public get size(): number {
    return this.upcomingTracks.length + (this.currentTrack ? 1 : 0);
  }

  public get current(): QueueTrack | null {
    return this.currentTrack;
  }

  public get filters(): AudioFilters {
    return this.filtersValue;
  }

  private assertQueuePosition(position: number): void {
    if (!Number.isInteger(position) || position < 1 || position > this.upcomingTracks.length) {
      throw new AppError("VALIDATION_FAILED", "Queue position is out of range.", {
        details: { position, queueLength: this.upcomingTracks.length }
      });
    }
  }

  private assertInsertPosition(position: number): void {
    if (!Number.isInteger(position) || position < 1 || position > this.upcomingTracks.length) {
      throw new AppError("VALIDATION_FAILED", "Queue insert position is out of range.", {
        details: { position, queueLength: this.upcomingTracks.length }
      });
    }
  }
}

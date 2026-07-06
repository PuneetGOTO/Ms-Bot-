import { AppError, toError } from "../../domain/errors/AppError";
import { filtersForPreset } from "../../domain/music/effects";
import { QueueManager } from "../../domain/music/QueueManager";
import type {
  AudioFilters,
  EffectPreset,
  LoopMode,
  PlayRequest,
  QueueSummary,
  QueueTrack,
  Track,
  TrackResolveResult
} from "../../domain/music/types";
import type { EventBus, EventSubscription } from "../ports/EventBus";
import type { Logger } from "../ports/Logger";
import type { MusicGateway, PlayerHandle } from "../ports/MusicGateway";
import type {
  AnalyticsRepository,
  GuildSettingsRepository,
  HistoryRepository,
  QueueSnapshotRepository
} from "../ports/Repositories";
import type { TrackResolver } from "./TrackResolver";

export interface MusicServiceOptions {
  readonly idleTimeoutSeconds: number;
  readonly defaultVolume: number;
  readonly maxVolume: number;
  readonly maxQueueSize: number;
}

interface GuildSession {
  readonly queue: QueueManager;
  voiceChannelId: string | null;
  textChannelId: string | null;
  shardId: number;
  idleTimer: NodeJS.Timeout | null;
}

/**
 * Coordinates queue state, track resolution, Lavalink playback, persistence, and recovery.
 */
export class MusicService {
  private readonly sessions = new Map<string, GuildSession>();
  private readonly subscriptions: EventSubscription[];

  public constructor(
    private readonly resolver: TrackResolver,
    private readonly gateway: MusicGateway,
    private readonly settingsRepository: GuildSettingsRepository,
    private readonly snapshotRepository: QueueSnapshotRepository,
    private readonly historyRepository: HistoryRepository,
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly eventBus: EventBus,
    private readonly logger: Logger,
    private readonly options: MusicServiceOptions
  ) {
    this.subscriptions = [
      this.eventBus.subscribe("music.track.ended", (payload) =>
        this.handleTrackEnded(payload.guildId)
      ),
      this.eventBus.subscribe("music.track.exception", (payload) =>
        this.handleTrackException(payload.guildId, payload.message)
      ),
      this.eventBus.subscribe("music.player.updated", (payload) => {
        const session = this.sessions.get(payload.guildId);
        session?.queue.setPosition(payload.positionMs);
      })
    ];
  }

  /** Releases event subscriptions and idle timers. */
  public dispose(): void {
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
    for (const session of this.sessions.values()) {
      if (session.idleTimer) {
        clearTimeout(session.idleTimer);
      }
    }
    this.sessions.clear();
  }

  /** Resolves and enqueues tracks; starts playback when the guild is idle. */
  public async play(request: PlayRequest): Promise<QueueSummary> {
    const session = await this.getOrCreateSession(request.guildId);
    this.clearIdleTimer(session);
    session.voiceChannelId = request.voiceChannelId;
    session.textChannelId = request.textChannelId;
    session.shardId = request.shardId;
    session.queue.setChannelContext(request.voiceChannelId, request.textChannelId);

    const result = await this.resolver.resolve(request.query, request.requesterId);
    const tracks = this.pickTracksForPlay(result);
    const queued = session.queue.enqueue(tracks);

    if (!session.queue.current) {
      await this.startNext(request.guildId);
    } else if (!this.gateway.getPlayer(request.guildId)) {
      await this.startCurrent(request.guildId, session);
    } else {
      await this.persist(session);
    }

    this.logger.info(
      { guildId: request.guildId, userId: request.requesterId, count: queued.length },
      "Tracks enqueued."
    );

    return session.queue.summary();
  }

  /** Performs a search without mutating queue state. */
  public async search(query: string, requesterId: string): Promise<TrackResolveResult> {
    return this.resolver.resolve(query, requesterId);
  }

  /** Pauses the active player. */
  public async pause(guildId: string): Promise<QueueSummary> {
    const session = await this.requireSession(guildId);
    const player = this.requirePlayer(guildId);
    await player.pause(true);
    session.queue.markPaused();
    await this.persist(session);
    await this.analyticsRepository.record({ guildId, eventType: "PAUSE" });
    return session.queue.summary();
  }

  /** Resumes a paused player. */
  public async resume(guildId: string): Promise<QueueSummary> {
    const session = await this.requireSession(guildId);
    const player = this.requirePlayer(guildId);
    await player.pause(false);
    session.queue.markPlaying();
    await this.persist(session);
    await this.analyticsRepository.record({ guildId, eventType: "RESUME" });
    return session.queue.summary();
  }

  /** Stops playback and clears the Lavalink player. */
  public async stop(guildId: string): Promise<QueueSummary> {
    const session = await this.requireSession(guildId);
    const player = this.gateway.getPlayer(guildId);
    if (player) {
      await player.stop();
    }
    session.queue.stop();
    this.scheduleIdleDestroy(guildId, session);
    await this.persist(session);
    await this.analyticsRepository.record({ guildId, eventType: "STOP" });
    return session.queue.summary();
  }

  /** Skips the current track and starts the next track if available. */
  public async skip(guildId: string): Promise<QueueSummary> {
    const session = await this.requireSession(guildId);
    const player = this.gateway.getPlayer(guildId);
    if (player) {
      await player.stop();
    }
    await this.startNext(guildId);
    await this.analyticsRepository.record({ guildId, eventType: "SKIP" });
    return session.queue.summary();
  }

  /** Replays the previous track from history. */
  public async previous(guildId: string): Promise<QueueSummary> {
    const session = await this.requireSession(guildId);
    const previousTrack = session.queue.previous();
    if (!previousTrack) {
      throw new AppError("MUSIC_EMPTY_QUEUE", "No previous track is available.");
    }
    const player = await this.ensurePlayer(guildId, session);
    await player.play(previousTrack);
    await player.setVolume(session.queue.summary().volume);
    await this.persist(session);
    return session.queue.summary();
  }

  /** Removes an upcoming track by one-based queue position. */
  public async remove(guildId: string, position: number): Promise<QueueSummary> {
    const session = await this.requireSession(guildId);
    session.queue.remove(position);
    await this.persist(session);
    return session.queue.summary();
  }

  /** Moves an upcoming track between one-based queue positions. */
  public async move(guildId: string, from: number, to: number): Promise<QueueSummary> {
    const session = await this.requireSession(guildId);
    session.queue.move(from, to);
    await this.persist(session);
    return session.queue.summary();
  }

  /** Clears upcoming tracks. */
  public async clear(guildId: string): Promise<QueueSummary> {
    const session = await this.requireSession(guildId);
    session.queue.clear();
    await this.persist(session);
    return session.queue.summary();
  }

  /** Shuffles upcoming tracks. */
  public async shuffle(guildId: string): Promise<QueueSummary> {
    const session = await this.requireSession(guildId);
    session.queue.shuffle();
    await this.persist(session);
    return session.queue.summary();
  }

  /** Updates loop mode. */
  public async setLoopMode(guildId: string, loopMode: LoopMode): Promise<QueueSummary> {
    const session = await this.requireSession(guildId);
    session.queue.setLoopMode(loopMode);
    await this.persist(session);
    return session.queue.summary();
  }

  /** Enables or disables autoplay. */
  public async setAutoplay(guildId: string, enabled: boolean): Promise<QueueSummary> {
    const session = await this.requireSession(guildId);
    session.queue.setAutoplay(enabled);
    await this.persist(session);
    return session.queue.summary();
  }

  /** Updates player volume. */
  public async setVolume(guildId: string, volume: number): Promise<QueueSummary> {
    const session = await this.requireSession(guildId);
    session.queue.setVolume(volume, this.options.maxVolume);
    const player = this.gateway.getPlayer(guildId);
    if (player) {
      await player.setVolume(volume);
    }
    await this.persist(session);
    return session.queue.summary();
  }

  /** Seeks inside the current track. */
  public async seek(guildId: string, positionMs: number): Promise<QueueSummary> {
    const session = await this.requireSession(guildId);
    if (!session.queue.current?.isSeekable) {
      throw new AppError("VALIDATION_FAILED", "Current track is not seekable.");
    }
    const player = this.requirePlayer(guildId);
    await player.seek(positionMs);
    session.queue.setPosition(positionMs);
    await this.persist(session);
    await this.analyticsRepository.record({ guildId, eventType: "SEEK", durationMs: positionMs });
    return session.queue.summary();
  }

  /** Jumps to an upcoming queue position and starts it immediately. */
  public async jump(guildId: string, position: number): Promise<QueueSummary> {
    const session = await this.requireSession(guildId);
    const track = session.queue.jump(position);
    const player = await this.ensurePlayer(guildId, session);
    await player.play(track);
    await this.persist(session);
    return session.queue.summary();
  }

  /** Applies raw Lavalink filters. */
  public async setFilters(guildId: string, filters: AudioFilters): Promise<QueueSummary> {
    const session = await this.requireSession(guildId);
    const player = this.gateway.getPlayer(guildId);
    session.queue.setFilters(filters);
    if (player) {
      await player.setFilters(filters);
    }
    await this.persist(session);
    return session.queue.summary();
  }

  /** Applies a named effect preset. */
  public async applyPreset(guildId: string, preset: EffectPreset): Promise<QueueSummary> {
    return this.setFilters(guildId, filtersForPreset(preset));
  }

  /** Returns the current queue summary, restoring from storage when possible. */
  public async getQueue(guildId: string): Promise<QueueSummary> {
    const session = await this.getOrCreateSession(guildId);
    return session.queue.summary();
  }

  /** Returns the current track or null. */
  public async getCurrent(guildId: string): Promise<QueueTrack | null> {
    const session = await this.getOrCreateSession(guildId);
    return session.queue.current;
  }

  /** Restores all known queue snapshots into memory on boot. */
  public async restore(guildId: string): Promise<void> {
    await this.getOrCreateSession(guildId);
  }

  private async handleTrackEnded(guildId: string): Promise<void> {
    const session = this.sessions.get(guildId);
    if (!session) {
      return;
    }

    const finishedTrack = session.queue.current;
    if (finishedTrack) {
      await this.historyRepository.add({
        guildId,
        userId: finishedTrack.requesterId,
        track: finishedTrack,
        eventType: "FINISH"
      });
    }

    await this.startNext(guildId);
  }

  private async handleTrackException(guildId: string, message: string): Promise<void> {
    this.logger.warn({ guildId, message }, "Track exception received; skipping to next track.");
    await this.analyticsRepository.record({ guildId, eventType: "ERROR" });
    await this.startNext(guildId);
  }

  private async startNext(guildId: string): Promise<void> {
    const session = await this.requireSession(guildId);
    const nextTrack = session.queue.next();

    if (!nextTrack) {
      const autoplayTrack = await this.tryAutoplay(guildId, session);
      if (!autoplayTrack) {
        session.queue.stop();
        this.scheduleIdleDestroy(guildId, session);
        await this.persist(session);
        return;
      }
    }

    const track = session.queue.current;
    if (!track) {
      throw new AppError("MUSIC_EMPTY_QUEUE", "No track is available to play.");
    }

    await this.startCurrent(guildId, session);
  }

  private async startCurrent(guildId: string, session: GuildSession): Promise<void> {
    const track = session.queue.current;
    if (!track) {
      throw new AppError("MUSIC_EMPTY_QUEUE", "No track is available to play.");
    }

    const player = await this.ensurePlayer(guildId, session);
    await player.play(track);
    await this.eventBus.publish("music.track.started", {
      guildId,
      track,
      nodeName: player.nodeName
    });
    await player.setVolume(session.queue.summary().volume);
    if (Object.keys(session.queue.filters).length > 0) {
      await player.setFilters(session.queue.filters);
    }
    session.queue.markPlaying();
    await this.historyRepository.add({
      guildId,
      userId: track.requesterId,
      track,
      eventType: "PLAY"
    });
    const analyticsRecord = {
      guildId,
      eventType: "PLAY" as const,
      source: track.source,
      nodeName: player.nodeName
    };
    await this.analyticsRepository.record(
      track.durationMs === null
        ? analyticsRecord
        : { ...analyticsRecord, durationMs: track.durationMs }
    );
    await this.persist(session);
  }

  private async tryAutoplay(guildId: string, session: GuildSession): Promise<QueueTrack | null> {
    if (!session.queue.summary().autoplay) {
      return null;
    }

    const lastTrack = session.queue.summary().history[0];
    if (!lastTrack) {
      return null;
    }

    try {
      const result = await this.resolver.resolve(
        `${lastTrack.author} ${lastTrack.title}`,
        lastTrack.requesterId
      );
      const tracks = this.pickTracksForPlay(result)
        .filter((track) => track.identifier !== lastTrack.identifier)
        .slice(0, 1);
      session.queue.enqueue(tracks);
      return session.queue.next();
    } catch (error) {
      this.logger.warn({ guildId, error: toError(error) }, "Autoplay failed.");
      return null;
    }
  }

  private async ensurePlayer(guildId: string, session: GuildSession): Promise<PlayerHandle> {
    const existing = this.gateway.getPlayer(guildId);
    if (existing) {
      return existing;
    }

    if (!session.voiceChannelId) {
      throw new AppError("MUSIC_NOT_CONNECTED", "Voice channel is not known for this guild.");
    }

    session.queue.markConnecting();
    return this.gateway.connect({
      guildId,
      voiceChannelId: session.voiceChannelId,
      shardId: session.shardId,
      deaf: true,
      mute: false
    });
  }

  private requirePlayer(guildId: string): PlayerHandle {
    const player = this.gateway.getPlayer(guildId);
    if (!player) {
      throw new AppError("MUSIC_NOT_CONNECTED", "No active player for this guild.");
    }
    return player;
  }

  private async getOrCreateSession(guildId: string): Promise<GuildSession> {
    const existing = this.sessions.get(guildId);
    if (existing) {
      return existing;
    }

    const settings = await this.settingsRepository.getOrCreate(guildId);
    const snapshot = await this.snapshotRepository.get(guildId);
    const queue = snapshot
      ? QueueManager.fromSnapshot(snapshot, settings.maxQueueSize)
      : new QueueManager({
          guildId,
          maxQueueSize: settings.maxQueueSize || this.options.maxQueueSize,
          defaultVolume: settings.defaultVolume || this.options.defaultVolume
        });

    const session: GuildSession = {
      queue,
      voiceChannelId: snapshot?.voiceChannelId ?? null,
      textChannelId: snapshot?.textChannelId ?? null,
      shardId: 0,
      idleTimer: null
    };
    this.sessions.set(guildId, session);
    return session;
  }

  private async requireSession(guildId: string): Promise<GuildSession> {
    const session = await this.getOrCreateSession(guildId);
    return session;
  }

  private async persist(session: GuildSession): Promise<void> {
    const snapshot = session.queue.snapshot();
    await this.snapshotRepository.save(snapshot);
    await this.eventBus.publish("music.queue.changed", { guildId: snapshot.guildId, snapshot });
  }

  private pickTracksForPlay(result: TrackResolveResult): readonly Track[] {
    const tracks =
      result.type === "playlist"
        ? result.tracks
        : result.tracks.length > 0
          ? result.tracks.slice(0, 1)
          : [];
    return tracks;
  }

  private scheduleIdleDestroy(guildId: string, session: GuildSession): void {
    this.clearIdleTimer(session);
    session.idleTimer = setTimeout(() => {
      void this.gateway.destroy(guildId).catch((error: unknown) => {
        this.logger.warn({ guildId, error: toError(error) }, "Failed to destroy idle player.");
      });
      this.sessions.delete(guildId);
    }, this.options.idleTimeoutSeconds * 1000);
    session.idleTimer.unref();
  }

  private clearIdleTimer(session: GuildSession): void {
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }
  }
}

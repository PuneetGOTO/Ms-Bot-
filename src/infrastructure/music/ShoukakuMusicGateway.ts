import type { Client } from "discord.js";
import {
  Connectors,
  Constants,
  LoadType,
  Shoukaku,
  type Band,
  type FilterOptions,
  type NodeOption,
  type Player,
  type Track as LavalinkTrack
} from "shoukaku";

import type { EventBus } from "../../application/ports/EventBus";
import type { Logger } from "../../application/ports/Logger";
import type {
  ConnectPlayerOptions,
  MusicGateway,
  PlayerHandle
} from "../../application/ports/MusicGateway";
import { AppError } from "../../domain/errors/AppError";
import type {
  AudioFilters,
  NodeStatusSnapshot,
  SourceType,
  Track,
  TrackResolveResult
} from "../../domain/music/types";

export interface ShoukakuGatewayOptions {
  readonly resumeTimeoutSeconds: number;
  readonly reconnectTries: number;
  readonly reconnectIntervalSeconds: number;
}

/**
 * Shoukaku-backed Lavalink gateway with resume, node failover, and load-balanced node selection.
 */
export class ShoukakuMusicGateway implements MusicGateway {
  private readonly shoukaku: Shoukaku;
  private readonly handles = new Map<string, ShoukakuPlayerHandle>();
  private readonly playerCleanups = new Map<string, () => void>();
  private readonly nodeErrors = new Map<string, string>();

  public constructor(
    client: Client,
    nodes: readonly NodeOption[],
    private readonly eventBus: EventBus,
    private readonly logger: Logger,
    options: ShoukakuGatewayOptions
  ) {
    this.shoukaku = new Shoukaku(new Connectors.DiscordJS(client), [...nodes], {
      resume: true,
      resumeByLibrary: true,
      resumeTimeout: options.resumeTimeoutSeconds,
      reconnectTries: options.reconnectTries,
      reconnectInterval: options.reconnectIntervalSeconds,
      restTimeout: 30,
      moveOnDisconnect: true,
      voiceConnectionTimeout: 15,
      userAgent: "enterprise-discord-music-bot/1.0.0"
    });

    this.registerNodeEvents();
  }

  public async connect(options: ConnectPlayerOptions): Promise<PlayerHandle> {
    try {
      this.logger.info(
        {
          guildId: options.guildId,
          voiceChannelId: options.voiceChannelId,
          shardId: options.shardId
        },
        "Joining voice channel."
      );
      const player = await this.shoukaku.joinVoiceChannel({
        guildId: options.guildId,
        channelId: options.voiceChannelId,
        shardId: options.shardId,
        deaf: options.deaf,
        mute: options.mute
      });
      this.attachPlayerEvents(player);
      const handle = new ShoukakuPlayerHandle(player);
      this.handles.set(options.guildId, handle);
      this.logger.info(
        {
          guildId: options.guildId,
          voiceChannelId: options.voiceChannelId,
          nodeName: handle.nodeName
        },
        "Voice player connected."
      );
      return handle;
    } catch (error) {
      throw new AppError("MUSIC_GATEWAY_FAILED", "Failed to connect to voice channel.", {
        cause: error,
        details: { guildId: options.guildId, voiceChannelId: options.voiceChannelId },
        expose: true
      });
    }
  }

  public getPlayer(guildId: string): PlayerHandle | null {
    return this.handles.get(guildId) ?? null;
  }

  public async resolve(identifier: string, requesterId: string): Promise<TrackResolveResult> {
    const node = this.shoukaku.getIdealNode();
    if (!node) {
      throw new AppError("MUSIC_GATEWAY_FAILED", "No available Lavalink node.", { expose: true });
    }

    try {
      const response = await node.rest.resolve(identifier);
      if (!response) {
        return { type: "empty", tracks: [] };
      }

      switch (response.loadType) {
        case LoadType.TRACK:
          return { type: "track", tracks: [toDomainTrack(response.data, requesterId)] };
        case LoadType.PLAYLIST:
          return {
            type: "playlist",
            playlist: {
              name: response.data.info.name,
              selectedTrack: response.data.info.selectedTrack
            },
            tracks: response.data.tracks.map((track) => toDomainTrack(track, requesterId))
          };
        case LoadType.SEARCH:
          return {
            type: "search",
            tracks: response.data.map((track) => toDomainTrack(track, requesterId))
          };
        case LoadType.EMPTY:
          return { type: "empty", tracks: [] };
        case LoadType.ERROR:
          throw new AppError("MUSIC_RESOLVE_FAILED", response.data.message, {
            details: { severity: response.data.severity, cause: response.data.cause },
            expose: true
          });
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("MUSIC_GATEWAY_FAILED", "Lavalink resolve failed.", {
        cause: error,
        details: { identifier },
        expose: true
      });
    }
  }

  public async destroy(guildId: string): Promise<void> {
    this.cleanupPlayerEvents(guildId);
    this.handles.delete(guildId);
    await this.shoukaku.leaveVoiceChannel(guildId);
  }

  public getNodeStatuses(): Promise<readonly NodeStatusSnapshot[]> {
    return Promise.resolve(
      [...this.shoukaku.nodes.values()].map((node) => ({
        name: node.name,
        connected: node.state === Constants.State.CONNECTED,
        sessionId: node.sessionId,
        players: node.stats?.players ?? 0,
        playingPlayers: node.stats?.playingPlayers ?? 0,
        cpuLoad: node.stats?.cpu.lavalinkLoad ?? null,
        memoryUsedBytes: node.stats ? BigInt(node.stats.memory.used) : null,
        frameDeficit: node.stats?.frameStats?.deficit ?? null,
        frameNulled: node.stats?.frameStats?.nulled ?? null,
        pingMs: null,
        lastError: this.nodeErrors.get(node.name) ?? null
      }))
    );
  }

  private registerNodeEvents(): void {
    this.shoukaku.on("ready", (name, lavalinkResume, libraryResume) => {
      this.logger.info({ nodeName: name, lavalinkResume, libraryResume }, "Lavalink node ready.");
      this.nodeErrors.delete(name);
    });
    this.shoukaku.on("error", (name, error) => {
      this.nodeErrors.set(name, error.message);
      this.logger.error({ nodeName: name, error }, "Lavalink node error.");
    });
    this.shoukaku.on("close", (name, code, reason) => {
      this.nodeErrors.set(name, `${code}:${reason}`);
      this.logger.warn({ nodeName: name, code, reason }, "Lavalink websocket closed.");
    });
    this.shoukaku.on("disconnect", (name, count) => {
      this.logger.warn({ nodeName: name, count }, "Lavalink node disconnected.");
    });
    this.shoukaku.on("reconnecting", (name, reconnectsLeft, reconnectInterval) => {
      this.logger.warn(
        { nodeName: name, reconnectsLeft, reconnectInterval },
        "Reconnecting Lavalink node."
      );
    });
    this.shoukaku.on("debug", (name, info) => {
      this.logger.debug({ nodeName: name, info }, "Shoukaku debug.");
    });
  }

  private attachPlayerEvents(player: Player): void {
    this.cleanupPlayerEvents(player.guildId);

    const onEnd = (event: { readonly reason: string }): void => {
      void this.eventBus.publish("music.track.ended", {
        guildId: player.guildId,
        reason: normalizeTrackEndReason(event.reason)
      });
    };
    const onException = (event: { readonly exception: { readonly message: string } }): void => {
      void this.eventBus.publish("music.track.exception", {
        guildId: player.guildId,
        message: event.exception.message
      });
    };
    const onStuck = (): void => {
      void this.eventBus.publish("music.track.exception", {
        guildId: player.guildId,
        message: "Track stuck threshold exceeded."
      });
    };
    const onClosed = (event: { readonly code: number; readonly reason: string }): void => {
      this.logger.warn(
        { guildId: player.guildId, code: event.code, reason: event.reason },
        "Voice websocket closed."
      );
    };
    const onUpdate = (event: {
      readonly state: { readonly position: number; readonly ping: number };
    }): void => {
      void this.eventBus.publish("music.player.updated", {
        guildId: player.guildId,
        positionMs: event.state.position,
        pingMs: event.state.ping
      });
    };

    player.on("end", onEnd);
    player.on("exception", onException);
    player.on("stuck", onStuck);
    player.on("closed", onClosed);
    player.on("update", onUpdate);

    this.playerCleanups.set(player.guildId, () => {
      player.off("end", onEnd);
      player.off("exception", onException);
      player.off("stuck", onStuck);
      player.off("closed", onClosed);
      player.off("update", onUpdate);
    });
  }

  private cleanupPlayerEvents(guildId: string): void {
    const cleanup = this.playerCleanups.get(guildId);
    if (cleanup) {
      cleanup();
      this.playerCleanups.delete(guildId);
    }
  }
}

class ShoukakuPlayerHandle implements PlayerHandle {
  public constructor(private readonly player: Player) {}

  public get guildId(): string {
    return this.player.guildId;
  }

  public get nodeName(): string {
    return this.player.node.name;
  }

  public async play(
    track: Track,
    options: { readonly startTimeMs?: number; readonly endTimeMs?: number } = {}
  ): Promise<void> {
    const playerOptions: Parameters<Player["playTrack"]>[0] = {
      track: { encoded: track.encoded }
    };
    if (options.startTimeMs !== undefined) {
      playerOptions.position = options.startTimeMs;
    }
    if (options.endTimeMs !== undefined) {
      playerOptions.endTime = options.endTimeMs;
    }
    await this.player.playTrack(playerOptions);
  }

  public async stop(): Promise<void> {
    await this.player.stopTrack();
  }

  public async pause(paused: boolean): Promise<void> {
    await this.player.setPaused(paused);
  }

  public async seek(positionMs: number): Promise<void> {
    await this.player.seekTo(positionMs);
  }

  public async setVolume(volume: number): Promise<void> {
    await this.player.setGlobalVolume(volume);
  }

  public async setFilters(filters: AudioFilters): Promise<void> {
    await this.player.setFilters(toShoukakuFilters(filters));
  }

  public async moveNode(nodeName?: string): Promise<boolean> {
    return this.player.move(nodeName);
  }

  public async destroy(): Promise<void> {
    await this.player.destroy();
  }
}

function toDomainTrack(track: LavalinkTrack, requesterId: string): Track {
  const source = mapSource(track.info.sourceName, track.info.isStream, track.info.uri ?? null);
  return {
    encoded: track.encoded,
    identifier: track.info.identifier,
    source,
    title: track.info.title,
    author: track.info.author,
    durationMs: track.info.isStream ? null : track.info.length,
    uri: track.info.uri ?? null,
    artworkUrl: track.info.artworkUrl ?? null,
    isSeekable: track.info.isSeekable,
    isStream: track.info.isStream,
    requesterId,
    requestedAt: new Date()
  };
}

function mapSource(sourceName: string, isStream: boolean, uri: string | null): SourceType {
  const normalized = sourceName.toLowerCase();
  if (normalized.includes("spotify")) return "SPOTIFY";
  if (normalized.includes("apple")) return "APPLE_MUSIC";
  if (normalized.includes("soundcloud")) return "SOUNDCLOUD";
  if (normalized.includes("deezer")) return "DEEZER";
  if (normalized.includes("youtube")) return "YOUTUBE";
  if (normalized.includes("local")) return "LOCAL";
  if (normalized.includes("http")) return isStream ? "RADIO" : "HTTP";
  if (uri?.startsWith("http")) return isStream ? "RADIO" : "HTTP";
  return "UNKNOWN";
}

function toShoukakuFilters(filters: AudioFilters): FilterOptions {
  const result: FilterOptions = {};
  if (filters.volume !== undefined) result.volume = filters.volume;
  if (filters.equalizer) result.equalizer = filters.equalizer.map((band): Band => ({ ...band }));
  if (filters.karaoke !== undefined) result.karaoke = filters.karaoke;
  if (filters.timescale !== undefined) result.timescale = filters.timescale;
  if (filters.tremolo !== undefined) result.tremolo = filters.tremolo;
  if (filters.vibrato !== undefined) result.vibrato = filters.vibrato;
  if (filters.rotation !== undefined) result.rotation = filters.rotation;
  if (filters.distortion !== undefined) result.distortion = filters.distortion;
  if (filters.channelMix !== undefined) result.channelMix = filters.channelMix;
  if (filters.lowPass !== undefined) result.lowPass = filters.lowPass;
  return result;
}

function normalizeTrackEndReason(
  reason: string
): "finished" | "loadFailed" | "stopped" | "replaced" | "cleanup" {
  if (
    reason === "finished" ||
    reason === "loadFailed" ||
    reason === "stopped" ||
    reason === "replaced" ||
    reason === "cleanup"
  ) {
    return reason;
  }
  return "cleanup";
}

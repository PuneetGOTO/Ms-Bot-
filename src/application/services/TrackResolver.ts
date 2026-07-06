import { AppError } from "../../domain/errors/AppError";
import type { Track, TrackResolveResult } from "../../domain/music/types";
import type { Cache } from "../ports/Cache";
import type { Logger } from "../ports/Logger";
import type { MusicGateway } from "../ports/MusicGateway";

export interface TrackResolverOptions {
  readonly searchTtlSeconds: number;
}

/**
 * Resolves user input into playable Lavalink tracks while keeping source-specific syntax isolated.
 */
export class TrackResolver {
  public constructor(
    private readonly gateway: MusicGateway,
    private readonly cache: Cache,
    private readonly logger: Logger,
    private readonly options: TrackResolverOptions
  ) {}

  /** Resolves a query, URL, or provider URI into Lavalink tracks. */
  public async resolve(query: string, requesterId: string): Promise<TrackResolveResult> {
    const identifier = this.toLavalinkIdentifier(query);
    const cacheKey = `resolve:${identifier}`;

    const result = normalizeResolveResult(
      await this.cache.rememberJson(cacheKey, this.options.searchTtlSeconds, async () => {
        const resolved = await this.gateway.resolve(identifier, requesterId);
        this.logger.debug({ identifier, loadType: resolved.type }, "Track resolved.");
        return resolved;
      })
    );

    if (result.type === "empty" || result.tracks.length === 0) {
      throw new AppError("MUSIC_RESOLVE_FAILED", "No playable tracks found.", {
        details: { query },
        expose: true
      });
    }

    return result;
  }

  /** Normalizes supported platform input to Lavalink identifiers or search prefixes. */
  public toLavalinkIdentifier(query: string): string {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      throw new AppError("VALIDATION_FAILED", "Search query cannot be empty.");
    }

    if (/^https?:\/\//iu.test(trimmed)) {
      return trimmed;
    }

    if (/^[a-zA-Z]:\\/u.test(trimmed) || trimmed.startsWith("/")) {
      return trimmed;
    }

    if (trimmed.startsWith("spotify:")) {
      return trimmed;
    }

    if (trimmed.startsWith("applemusic:") || trimmed.startsWith("amsearch:")) {
      return trimmed;
    }

    if (trimmed.startsWith("deezer:") || trimmed.startsWith("dzsearch:")) {
      return trimmed;
    }

    if (trimmed.startsWith("scsearch:") || trimmed.startsWith("ytsearch:")) {
      return trimmed;
    }

    return `ytsearch:${trimmed}`;
  }
}

function normalizeResolveResult(result: TrackResolveResult): TrackResolveResult {
  if (result.type === "empty") {
    return result;
  }

  if (result.type === "playlist") {
    return {
      ...result,
      tracks: result.tracks.map(normalizeTrackDates)
    };
  }

  return {
    ...result,
    tracks: result.tracks.map(normalizeTrackDates)
  };
}

function normalizeTrackDates(track: Track): Track {
  return {
    ...track,
    requestedAt: normalizeDate(track.requestedAt)
  };
}

function normalizeDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return new Date();
}

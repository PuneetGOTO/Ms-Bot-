import { z } from "zod";

import type { QueueSnapshot, QueueTrack } from "../../domain/music/types";

const sourceTypeSchema = z.enum([
  "YOUTUBE",
  "SPOTIFY",
  "APPLE_MUSIC",
  "SOUNDCLOUD",
  "DEEZER",
  "HTTP",
  "LOCAL",
  "RADIO",
  "UNKNOWN"
]);

const serializedTrackSchema = z.object({
  queueId: z.string(),
  encoded: z.string(),
  identifier: z.string(),
  source: sourceTypeSchema,
  title: z.string(),
  author: z.string(),
  durationMs: z.number().int().nullable(),
  uri: z.string().nullable(),
  artworkUrl: z.string().nullable(),
  isSeekable: z.boolean(),
  isStream: z.boolean(),
  requesterId: z.string(),
  requestedAt: z.iso.datetime()
});

const snapshotSchema = z.object({
  guildId: z.string(),
  voiceChannelId: z.string().nullable(),
  textChannelId: z.string().nullable(),
  status: z.enum(["idle", "connecting", "playing", "paused", "stopped"]),
  loopMode: z.enum(["OFF", "TRACK", "QUEUE"]),
  autoplay: z.boolean(),
  volume: z.number().int(),
  positionMs: z.number().int(),
  current: serializedTrackSchema.nullable(),
  tracks: z.array(serializedTrackSchema),
  history: z.array(serializedTrackSchema),
  filters: z.record(z.string(), z.unknown()),
  updatedAt: z.iso.datetime()
});

type SerializedTrack = z.infer<typeof serializedTrackSchema>;
export type SerializedQueueSnapshot = z.infer<typeof snapshotSchema>;

/** Converts domain queue snapshots to JSON-safe storage payloads. */
export function encodeQueueSnapshot(snapshot: QueueSnapshot): SerializedQueueSnapshot {
  return {
    ...snapshot,
    filters: snapshot.filters as Record<string, unknown>,
    current: snapshot.current ? encodeTrack(snapshot.current) : null,
    tracks: snapshot.tracks.map(encodeTrack),
    history: snapshot.history.map(encodeTrack)
  };
}

/** Validates and restores JSON payloads into domain queue snapshots. */
export function decodeQueueSnapshot(value: unknown): QueueSnapshot {
  const parsed = snapshotSchema.parse(value);
  return {
    ...parsed,
    filters: parsed.filters,
    current: parsed.current ? decodeTrack(parsed.current) : null,
    tracks: parsed.tracks.map(decodeTrack),
    history: parsed.history.map(decodeTrack)
  };
}

function encodeTrack(track: QueueTrack): SerializedTrack {
  return {
    ...track,
    requestedAt: toIsoDate(track.requestedAt)
  };
}

function decodeTrack(track: SerializedTrack): QueueTrack {
  return {
    ...track,
    source: track.source,
    requestedAt: new Date(track.requestedAt)
  };
}

function toIsoDate(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString();
  }

  return new Date().toISOString();
}

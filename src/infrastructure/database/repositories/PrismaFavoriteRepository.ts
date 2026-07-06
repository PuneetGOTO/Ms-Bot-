import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import type { FavoriteRepository } from "../../../application/ports/Repositories";
import type { QueueTrack } from "../../../domain/music/types";

export class PrismaFavoriteRepository implements FavoriteRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async add(userId: string, track: QueueTrack): Promise<void> {
    await this.prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId }
    });
    await this.prisma.favorite.upsert({
      where: { userId_identifier: { userId, identifier: track.identifier } },
      update: {
        source: track.source,
        title: track.title,
        uri: track.uri,
        author: track.author,
        durationMs: track.durationMs,
        artworkUrl: track.artworkUrl
      },
      create: {
        userId,
        source: track.source,
        identifier: track.identifier,
        title: track.title,
        uri: track.uri,
        author: track.author,
        durationMs: track.durationMs,
        artworkUrl: track.artworkUrl
      }
    });
  }

  public async remove(userId: string, identifier: string): Promise<void> {
    await this.prisma.favorite.deleteMany({ where: { userId, identifier } });
  }

  public async list(userId: string, limit: number): Promise<readonly QueueTrack[]> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit
    });

    return rows.map((row) => ({
      queueId: randomUUID(),
      encoded: "",
      identifier: row.identifier,
      source: row.source,
      title: row.title,
      author: row.author ?? "Unknown",
      durationMs: row.durationMs,
      uri: row.uri,
      artworkUrl: row.artworkUrl,
      isSeekable: true,
      isStream: false,
      requesterId: row.userId,
      requestedAt: row.createdAt
    }));
  }
}

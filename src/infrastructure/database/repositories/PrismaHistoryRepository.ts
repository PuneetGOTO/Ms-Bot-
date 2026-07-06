import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import type { HistoryRecord, HistoryRepository } from "../../../application/ports/Repositories";
import type { QueueTrack } from "../../../domain/music/types";

export class PrismaHistoryRepository implements HistoryRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async add(record: HistoryRecord): Promise<void> {
    await this.prisma.guild.upsert({
      where: { id: record.guildId },
      update: {},
      create: { id: record.guildId }
    });
    await this.prisma.user.upsert({
      where: { id: record.userId },
      update: {},
      create: { id: record.userId }
    });
    await this.prisma.history.create({
      data: {
        guildId: record.guildId,
        userId: record.userId,
        source: record.track.source,
        identifier: record.track.identifier,
        title: record.track.title,
        uri: record.track.uri,
        author: record.track.author,
        durationMs: record.track.durationMs,
        eventType: record.eventType,
        positionMs: record.positionMs ?? null
      }
    });
  }

  public async list(guildId: string, limit: number): Promise<readonly QueueTrack[]> {
    const rows = await this.prisma.history.findMany({
      where: { guildId },
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
      artworkUrl: null,
      isSeekable: true,
      isStream: false,
      requesterId: row.userId,
      requestedAt: row.createdAt
    }));
  }
}

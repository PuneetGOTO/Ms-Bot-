import type { Prisma, PrismaClient } from "@prisma/client";

import type { QueueSnapshotRepository } from "../../../application/ports/Repositories";
import type { QueueSnapshot } from "../../../domain/music/types";
import { decodeQueueSnapshot, encodeQueueSnapshot } from "../../serializers/QueueSnapshotCodec";

export class PrismaQueueSnapshotRepository implements QueueSnapshotRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async get(guildId: string): Promise<QueueSnapshot | null> {
    const snapshot = await this.prisma.queueSnapshot.findUnique({ where: { guildId } });
    if (!snapshot) {
      return null;
    }
    return decodeQueueSnapshot(snapshot.payload);
  }

  public async save(snapshot: QueueSnapshot): Promise<void> {
    await this.prisma.guild.upsert({
      where: { id: snapshot.guildId },
      update: {},
      create: { id: snapshot.guildId }
    });
    const payload = encodeQueueSnapshot(snapshot) as unknown as Prisma.InputJsonValue;
    await this.prisma.queueSnapshot.upsert({
      where: { guildId: snapshot.guildId },
      update: {
        voiceChannelId: snapshot.voiceChannelId,
        textChannelId: snapshot.textChannelId,
        payload
      },
      create: {
        guildId: snapshot.guildId,
        voiceChannelId: snapshot.voiceChannelId,
        textChannelId: snapshot.textChannelId,
        payload
      }
    });
  }

  public async delete(guildId: string): Promise<void> {
    await this.prisma.queueSnapshot.deleteMany({ where: { guildId } });
  }
}

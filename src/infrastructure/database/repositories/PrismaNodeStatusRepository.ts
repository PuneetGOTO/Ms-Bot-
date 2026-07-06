import type { PrismaClient } from "@prisma/client";

import type { NodeStatusRepository } from "../../../application/ports/Repositories";
import type { NodeStatusSnapshot } from "../../../domain/music/types";

export class PrismaNodeStatusRepository implements NodeStatusRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async saveMany(nodes: readonly NodeStatusSnapshot[]): Promise<void> {
    await this.prisma.$transaction(
      nodes.map((node) =>
        this.prisma.nodeStatus.upsert({
          where: { name: node.name },
          update: {
            connected: node.connected,
            sessionId: node.sessionId,
            players: node.players,
            playingPlayers: node.playingPlayers,
            cpuLoad: node.cpuLoad,
            memoryUsedBytes: node.memoryUsedBytes,
            frameDeficit: node.frameDeficit,
            frameNulled: node.frameNulled,
            pingMs: node.pingMs,
            lastError: node.lastError
          },
          create: {
            name: node.name,
            connected: node.connected,
            sessionId: node.sessionId,
            players: node.players,
            playingPlayers: node.playingPlayers,
            cpuLoad: node.cpuLoad,
            memoryUsedBytes: node.memoryUsedBytes,
            frameDeficit: node.frameDeficit,
            frameNulled: node.frameNulled,
            pingMs: node.pingMs,
            lastError: node.lastError
          }
        })
      )
    );
  }
}

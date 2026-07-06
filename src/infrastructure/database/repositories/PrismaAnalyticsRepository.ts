import type { PrismaClient } from "@prisma/client";

import type { AnalyticsRepository } from "../../../application/ports/Repositories";

export class PrismaAnalyticsRepository implements AnalyticsRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async record(input: {
    readonly guildId: string;
    readonly eventType: "PLAY" | "PAUSE" | "RESUME" | "STOP" | "SKIP" | "SEEK" | "FINISH" | "ERROR";
    readonly source?:
      | "YOUTUBE"
      | "SPOTIFY"
      | "APPLE_MUSIC"
      | "SOUNDCLOUD"
      | "DEEZER"
      | "HTTP"
      | "LOCAL"
      | "RADIO"
      | "UNKNOWN";
    readonly durationMs?: number;
    readonly latencyMs?: number;
    readonly nodeName?: string;
  }): Promise<void> {
    await this.prisma.guild.upsert({
      where: { id: input.guildId },
      update: {},
      create: { id: input.guildId }
    });
    await this.prisma.analytics.create({ data: input });
  }
}

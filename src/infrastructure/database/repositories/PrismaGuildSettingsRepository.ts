import type { PrismaClient } from "@prisma/client";

import type { GuildSettings } from "../../../domain/guild/GuildSettings";
import { defaultGuildSettings } from "../../../domain/guild/GuildSettings";
import type { GuildSettingsRepository } from "../../../application/ports/Repositories";

export class PrismaGuildSettingsRepository implements GuildSettingsRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async getOrCreate(guildId: string): Promise<GuildSettings> {
    await this.prisma.guild.upsert({
      where: { id: guildId },
      update: {},
      create: { id: guildId }
    });

    const settings = await this.prisma.guildSettings.upsert({
      where: { guildId },
      update: {},
      create: toPrismaData(defaultGuildSettings(guildId))
    });

    return {
      guildId: settings.guildId,
      locale: settings.locale,
      djModeEnabled: settings.djModeEnabled,
      djRoleIds: settings.djRoleIds,
      allowedRoleIds: settings.allowedRoleIds,
      blockedRoleIds: settings.blockedRoleIds,
      allowedTextChannelIds: settings.allowedTextChannelIds,
      allowedVoiceChannelIds: settings.allowedVoiceChannelIds,
      defaultVolume: settings.defaultVolume,
      maxQueueSize: settings.maxQueueSize,
      announceNowPlaying: settings.announceNowPlaying,
      autoplayEnabled: settings.autoplayEnabled,
      premiumOnlyEffects: settings.premiumOnlyEffects
    };
  }

  public async save(settings: GuildSettings): Promise<GuildSettings> {
    await this.prisma.guild.upsert({
      where: { id: settings.guildId },
      update: {},
      create: { id: settings.guildId }
    });

    const saved = await this.prisma.guildSettings.upsert({
      where: { guildId: settings.guildId },
      update: toPrismaData(settings),
      create: toPrismaData(settings)
    });

    return {
      guildId: saved.guildId,
      locale: saved.locale,
      djModeEnabled: saved.djModeEnabled,
      djRoleIds: saved.djRoleIds,
      allowedRoleIds: saved.allowedRoleIds,
      blockedRoleIds: saved.blockedRoleIds,
      allowedTextChannelIds: saved.allowedTextChannelIds,
      allowedVoiceChannelIds: saved.allowedVoiceChannelIds,
      defaultVolume: saved.defaultVolume,
      maxQueueSize: saved.maxQueueSize,
      announceNowPlaying: saved.announceNowPlaying,
      autoplayEnabled: saved.autoplayEnabled,
      premiumOnlyEffects: saved.premiumOnlyEffects
    };
  }
}

function toPrismaData(settings: GuildSettings) {
  return {
    guildId: settings.guildId,
    locale: settings.locale,
    djModeEnabled: settings.djModeEnabled,
    djRoleIds: [...settings.djRoleIds],
    allowedRoleIds: [...settings.allowedRoleIds],
    blockedRoleIds: [...settings.blockedRoleIds],
    allowedTextChannelIds: [...settings.allowedTextChannelIds],
    allowedVoiceChannelIds: [...settings.allowedVoiceChannelIds],
    defaultVolume: settings.defaultVolume,
    maxQueueSize: settings.maxQueueSize,
    announceNowPlaying: settings.announceNowPlaying,
    autoplayEnabled: settings.autoplayEnabled,
    premiumOnlyEffects: settings.premiumOnlyEffects
  };
}

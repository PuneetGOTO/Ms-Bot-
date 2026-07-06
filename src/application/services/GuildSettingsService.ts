import type { GuildSettings } from "../../domain/guild/GuildSettings";
import type { GuildSettingsRepository } from "../ports/Repositories";

export interface GuildSettingsPatch {
  locale?: string;
  djModeEnabled?: boolean;
  djRoleIds?: readonly string[];
  allowedRoleIds?: readonly string[];
  blockedRoleIds?: readonly string[];
  allowedTextChannelIds?: readonly string[];
  allowedVoiceChannelIds?: readonly string[];
  defaultVolume?: number;
  maxQueueSize?: number;
  announceNowPlaying?: boolean;
  autoplayEnabled?: boolean;
  premiumOnlyEffects?: boolean;
}

/**
 * Application service for guild and global music configuration.
 */
export class GuildSettingsService {
  public constructor(private readonly repository: GuildSettingsRepository) {}

  public async get(guildId: string): Promise<GuildSettings> {
    return this.repository.getOrCreate(guildId);
  }

  public async update(guildId: string, patch: GuildSettingsPatch): Promise<GuildSettings> {
    const current = await this.repository.getOrCreate(guildId);
    return this.repository.save({ ...current, ...patch, guildId });
  }
}

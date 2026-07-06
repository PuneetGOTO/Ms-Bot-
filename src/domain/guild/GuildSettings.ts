export interface GuildSettings {
  readonly guildId: string;
  readonly locale: string;
  readonly djModeEnabled: boolean;
  readonly djRoleIds: readonly string[];
  readonly allowedRoleIds: readonly string[];
  readonly blockedRoleIds: readonly string[];
  readonly allowedTextChannelIds: readonly string[];
  readonly allowedVoiceChannelIds: readonly string[];
  readonly defaultVolume: number;
  readonly maxQueueSize: number;
  readonly announceNowPlaying: boolean;
  readonly autoplayEnabled: boolean;
  readonly premiumOnlyEffects: boolean;
}

export const defaultGuildSettings = (guildId: string): GuildSettings => ({
  guildId,
  locale: "zh-TW",
  djModeEnabled: false,
  djRoleIds: [],
  allowedRoleIds: [],
  blockedRoleIds: [],
  allowedTextChannelIds: [],
  allowedVoiceChannelIds: [],
  defaultVolume: 80,
  maxQueueSize: 1000,
  announceNowPlaying: true,
  autoplayEnabled: false,
  premiumOnlyEffects: false
});

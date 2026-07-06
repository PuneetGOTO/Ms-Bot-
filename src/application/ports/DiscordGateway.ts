export interface VoiceMemberContext {
  readonly guildId: string;
  readonly userId: string;
  readonly voiceChannelId: string | null;
  readonly textChannelId: string | null;
  readonly shardId: number;
  readonly roleIds: readonly string[];
  readonly isAdministrator: boolean;
}

export interface DiscordGateway {
  getVoiceMemberContext(guildId: string, userId: string): Promise<VoiceMemberContext | null>;
}

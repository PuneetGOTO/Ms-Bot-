import { ChannelType, type Client, PermissionsBitField } from "discord.js";

import type { DiscordGateway, VoiceMemberContext } from "../../application/ports/DiscordGateway";

/**
 * Discord.js adapter for guild member voice, role, channel, and shard context.
 */
export class DiscordVoiceContextGateway implements DiscordGateway {
  public constructor(private readonly client: Client) {}

  public async getVoiceMemberContext(
    guildId: string,
    userId: string
  ): Promise<VoiceMemberContext | null> {
    const guild =
      this.client.guilds.cache.get(guildId) ?? (await this.client.guilds.fetch(guildId));
    const member = await guild.members.fetch(userId);
    const me = guild.members.me ?? (await guild.members.fetchMe());
    const textChannel = guild.channels.cache.find(
      (channel) =>
        channel.type === ChannelType.GuildText && channel.permissionsFor(me).has("SendMessages")
    );

    return {
      guildId,
      userId,
      voiceChannelId: member.voice.channelId,
      textChannelId: textChannel?.id ?? null,
      shardId: guild.shardId,
      roleIds: member.roles.cache.map((role) => role.id),
      isAdministrator: member.permissions.has(PermissionsBitField.Flags.Administrator)
    };
  }
}

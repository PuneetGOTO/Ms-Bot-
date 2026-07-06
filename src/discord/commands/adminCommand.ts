import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction
} from "discord.js";

import { AppError } from "../../domain/errors/AppError";
import type { GuildSettings } from "../../domain/guild/GuildSettings";
import { formatEnabled } from "../localization/discordMessages";
import type { CommandContext, DiscordCommand } from "./Command";

const builder = new SlashCommandBuilder()
  .setName("admin")
  .setDescription("管理伺服器音樂設定。")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((subcommand) => subcommand.setName("settings").setDescription("查看伺服器設定。"))
  .addSubcommand((subcommand) =>
    subcommand
      .setName("djmode")
      .setDescription("切換 DJ 模式。")
      .addBooleanOption((option) =>
        option.setName("enabled").setDescription("是否啟用").setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("default-volume")
      .setDescription("設定預設音量。")
      .addIntegerOption((option) =>
        option
          .setName("value")
          .setDescription("音量數值")
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(150)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("max-queue")
      .setDescription("設定播放佇列上限。")
      .addIntegerOption((option) =>
        option
          .setName("value")
          .setDescription("歌曲數量")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(5000)
      )
  );

export const adminCommand: DiscordCommand = {
  name: "admin",
  data: builder.toJSON(),
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    const guildId = requireGuildId(interaction);
    const memberContext = await context.discordGateway.getVoiceMemberContext(
      guildId,
      interaction.user.id
    );
    if (!memberContext) {
      throw new AppError("PERMISSION_DENIED", "Guild member context not found.");
    }
    await context.authorization.assertAllowed(memberContext, "ADMIN");

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "settings") {
      const settings = await context.guildSettings.get(guildId);
      await interaction.reply({ content: formatGuildSettings(settings), ephemeral: true });
      return;
    }
    if (subcommand === "djmode") {
      const settings = await context.guildSettings.update(guildId, {
        djModeEnabled: interaction.options.getBoolean("enabled", true)
      });
      await interaction.reply({
        content: `DJ 模式：${formatEnabled(settings.djModeEnabled)}`,
        ephemeral: true
      });
      return;
    }
    if (subcommand === "default-volume") {
      const settings = await context.guildSettings.update(guildId, {
        defaultVolume: interaction.options.getInteger("value", true)
      });
      await interaction.reply({
        content: `預設音量：${settings.defaultVolume}`,
        ephemeral: true
      });
      return;
    }
    if (subcommand === "max-queue") {
      const settings = await context.guildSettings.update(guildId, {
        maxQueueSize: interaction.options.getInteger("value", true)
      });
      await interaction.reply({
        content: `播放佇列上限：${settings.maxQueueSize} 首`,
        ephemeral: true
      });
    }
  }
};

function formatGuildSettings(settings: GuildSettings): string {
  return [
    "**伺服器音樂設定**",
    `語言：${settings.locale}`,
    `DJ 模式：${formatEnabled(settings.djModeEnabled)}`,
    `預設音量：${settings.defaultVolume}`,
    `播放佇列上限：${settings.maxQueueSize} 首`,
    `播放公告：${formatEnabled(settings.announceNowPlaying)}`,
    `自動播放：${formatEnabled(settings.autoplayEnabled)}`,
    `Premium 音效限制：${formatEnabled(settings.premiumOnlyEffects)}`,
    `DJ 身分組：${formatRoleList(settings.djRoleIds)}`,
    `允許身分組：${formatRoleList(settings.allowedRoleIds)}`,
    `封鎖身分組：${formatRoleList(settings.blockedRoleIds)}`,
    `允許文字頻道：${formatChannelList(settings.allowedTextChannelIds)}`,
    `允許語音頻道：${formatChannelList(settings.allowedVoiceChannelIds)}`
  ].join("\n");
}

function formatRoleList(roleIds: readonly string[]): string {
  return roleIds.length > 0 ? roleIds.map((roleId) => `<@&${roleId}>`).join("、") : "未設定";
}

function formatChannelList(channelIds: readonly string[]): string {
  return channelIds.length > 0
    ? channelIds.map((channelId) => `<#${channelId}>`).join("、")
    : "未設定";
}

function requireGuildId(interaction: { readonly guildId: string | null }): string {
  if (!interaction.guildId) {
    throw new AppError("VALIDATION_FAILED", "This command can only be used in a guild.");
  }
  return interaction.guildId;
}

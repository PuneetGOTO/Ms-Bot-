import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction
} from "discord.js";

import { AppError } from "../../domain/errors/AppError";
import type { EffectPreset } from "../../domain/music/types";
import type { CommandContext, ComponentHandler, DiscordCommand } from "./Command";
import { effectsSelect, queueEmbed } from "../presenters/musicEmbeds";

const effectChoices = [
  { name: "關閉", value: "off" },
  { name: "低音增強", value: "bassboost" },
  { name: "高音增強", value: "treble" },
  { name: "Nightcore", value: "nightcore" },
  { name: "蒸氣波", value: "vaporwave" },
  { name: "卡拉 OK", value: "karaoke" },
  { name: "旋轉", value: "rotation" },
  { name: "回音", value: "echo" },
  { name: "混響", value: "reverb" }
] as const;

const builder = new SlashCommandBuilder()
  .setName("effects")
  .setNameLocalizations({ "zh-TW": "音效" })
  .setDescription("套用 Lavalink 音效。")
  .addStringOption((option) =>
    option
      .setName("preset")
      .setDescription("音效預設")
      .setRequired(false)
      .addChoices(...effectChoices)
  );

export const effectsCommand: DiscordCommand = {
  name: "effects",
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
    await context.authorization.assertAllowed(memberContext, "EFFECTS");

    const preset = interaction.options.getString("preset", false) as EffectPreset | null;
    if (!preset) {
      await interaction.reply({
        content: "請選擇一個音效預設。",
        components: [effectsSelect()],
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const queue = await context.music.applyPreset(guildId, preset);
    await interaction.editReply({ embeds: [queueEmbed(queue)] });
  }
};

export const effectsComponents: ComponentHandler = {
  canHandle(customId: string): boolean {
    return customId.startsWith("effects:");
  },
  async handleSelect(
    interaction: StringSelectMenuInteraction,
    context: CommandContext
  ): Promise<void> {
    const guildId = requireGuildId(interaction);
    const memberContext = await context.discordGateway.getVoiceMemberContext(
      guildId,
      interaction.user.id
    );
    if (!memberContext) {
      throw new AppError("PERMISSION_DENIED", "Guild member context not found.");
    }
    await context.authorization.assertAllowed(memberContext, "EFFECTS");
    const preset = interaction.values[0] as EffectPreset | undefined;
    if (!preset) {
      throw new AppError("VALIDATION_FAILED", "Effect preset is required.");
    }
    await interaction.update({
      embeds: [queueEmbed(await context.music.applyPreset(guildId, preset))],
      components: []
    });
  }
};

function requireGuildId(interaction: { readonly guildId: string | null }): string {
  if (!interaction.guildId) {
    throw new AppError("VALIDATION_FAILED", "This command can only be used in a guild.");
  }
  return interaction.guildId;
}

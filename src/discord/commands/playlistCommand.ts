import {
  ActionRowBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction
} from "discord.js";

import { AppError } from "../../domain/errors/AppError";
import type { CommandContext, ComponentHandler, DiscordCommand } from "./Command";

const builder = new SlashCommandBuilder()
  .setName("playlist")
  .setNameLocalizations({ "zh-TW": "播放清單" })
  .setDescription("管理播放清單。")
  .addSubcommand((subcommand) =>
    subcommand.setName("import").setDescription("從網址匯入播放清單。")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("export")
      .setDescription("匯出播放清單。")
      .addStringOption((option) =>
        option.setName("name").setDescription("播放清單名稱").setRequired(true)
      )
  )
  .addSubcommand((subcommand) => subcommand.setName("list").setDescription("列出你的播放清單。"))
  .addSubcommand((subcommand) =>
    subcommand
      .setName("play")
      .setDescription("播放你的其中一份播放清單。")
      .addStringOption((option) =>
        option.setName("name").setDescription("播放清單名稱").setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("delete")
      .setDescription("刪除播放清單。")
      .addStringOption((option) =>
        option.setName("name").setDescription("播放清單名稱").setRequired(true)
      )
  );

export const playlistCommand: DiscordCommand = {
  name: "playlist",
  data: builder.toJSON(),
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    const guildId = requireGuildId(interaction);

    if (subcommand === "import") {
      await interaction.showModal(importModal());
      return;
    }

    if (subcommand === "export") {
      const exported = await context.playlists.export(
        interaction.user.id,
        interaction.options.getString("name", true)
      );
      await interaction.reply({
        content: `\`\`\`\n${exported.slice(0, 1900)}\n\`\`\``,
        ephemeral: true
      });
      return;
    }

    if (subcommand === "list") {
      const playlists = await context.playlists.list(interaction.user.id);
      await interaction.reply({
        content:
          playlists.length > 0
            ? playlists
                .map((playlist) => `${playlist.name}（${playlist.tracks.length} 首）`)
                .join("\n")
            : "目前沒有播放清單。",
        ephemeral: true
      });
      return;
    }

    if (subcommand === "play") {
      const memberContext = await context.discordGateway.getVoiceMemberContext(
        guildId,
        interaction.user.id
      );
      if (!memberContext?.voiceChannelId) {
        throw new AppError("PERMISSION_DENIED", "Join a voice channel first.");
      }
      await context.authorization.assertAllowed(memberContext, "PLAY");
      await interaction.deferReply();
      await context.playlists.play({
        ownerId: interaction.user.id,
        guildId,
        voiceChannelId: memberContext.voiceChannelId,
        textChannelId: memberContext.textChannelId,
        shardId: memberContext.shardId,
        playlistName: interaction.options.getString("name", true)
      });
      await interaction.editReply("已將播放清單加入佇列。");
      return;
    }

    if (subcommand === "delete") {
      await context.playlists.delete(
        interaction.user.id,
        interaction.options.getString("name", true)
      );
      await interaction.reply({ content: "已刪除播放清單。", ephemeral: true });
    }
  }
};

export const playlistComponents: ComponentHandler = {
  canHandle(customId: string): boolean {
    return customId === "playlist:import";
  },
  async handleModal(interaction: ModalSubmitInteraction, context: CommandContext): Promise<void> {
    const guildId = requireGuildId(interaction);
    await interaction.deferReply({ ephemeral: true });
    const playlist = await context.playlists.importFromText({
      ownerId: interaction.user.id,
      guildId,
      name: interaction.fields.getTextInputValue("name"),
      description: interaction.fields.getTextInputValue("description") || null,
      isPublic: false,
      text: interaction.fields.getTextInputValue("tracks")
    });
    await interaction.editReply(
      `已匯入播放清單「${playlist.name}」，共 ${playlist.tracks.length} 首。`
    );
  }
};

function importModal(): ModalBuilder {
  /* eslint-disable @typescript-eslint/no-deprecated -- Discord.js 14.26 still exposes TextInputBuilder as the stable modal input path in this package build. */
  return new ModalBuilder()
    .setCustomId("playlist:import")
    .setTitle("匯入播放清單")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("name")
          .setLabel("名稱")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("描述")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(160)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("tracks")
          .setLabel("網址或搜尋關鍵字，每行一首")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );
  /* eslint-enable @typescript-eslint/no-deprecated */
}

function requireGuildId(interaction: { readonly guildId: string | null }): string {
  if (!interaction.guildId) {
    throw new AppError("VALIDATION_FAILED", "This command can only be used in a guild.");
  }
  return interaction.guildId;
}

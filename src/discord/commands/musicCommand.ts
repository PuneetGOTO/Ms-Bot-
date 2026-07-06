import { SlashCommandBuilder } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";

import { AppError } from "../../domain/errors/AppError";
import type { LoopMode } from "../../domain/music/types";
import type { CommandContext, ComponentHandler, DiscordCommand } from "./Command";
import { playerControls, queueEmbed, trackEmbed } from "../presenters/musicEmbeds";

const builder = new SlashCommandBuilder()
  .setName("music")
  .setNameLocalizations({ "zh-TW": "音樂" })
  .setDescription("控制高音質音樂播放。")
  .setDescriptionLocalizations({ "zh-TW": "控制高音質音樂播放。" })
  .addSubcommand((subcommand) =>
    subcommand
      .setName("play")
      .setDescription("播放搜尋、網址、播放清單、串流或本機檔案。")
      .addStringOption((option) =>
        option.setName("query").setDescription("歌曲、網址或播放清單").setRequired(true)
      )
  )
  .addSubcommand((subcommand) => subcommand.setName("pause").setDescription("暫停播放。"))
  .addSubcommand((subcommand) => subcommand.setName("resume").setDescription("繼續播放。"))
  .addSubcommand((subcommand) => subcommand.setName("stop").setDescription("停止播放。"))
  .addSubcommand((subcommand) => subcommand.setName("skip").setDescription("跳過目前歌曲。"))
  .addSubcommand((subcommand) => subcommand.setName("previous").setDescription("播放上一首。"))
  .addSubcommand((subcommand) =>
    subcommand
      .setName("remove")
      .setDescription("移除待播歌曲。")
      .addIntegerOption((option) =>
        option.setName("position").setDescription("佇列位置").setRequired(true).setMinValue(1)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("move")
      .setDescription("移動待播歌曲。")
      .addIntegerOption((option) =>
        option.setName("from").setDescription("原本位置").setRequired(true).setMinValue(1)
      )
      .addIntegerOption((option) =>
        option.setName("to").setDescription("目標位置").setRequired(true).setMinValue(1)
      )
  )
  .addSubcommand((subcommand) => subcommand.setName("clear").setDescription("清空待播佇列。"))
  .addSubcommand((subcommand) => subcommand.setName("shuffle").setDescription("隨機打亂待播佇列。"))
  .addSubcommand((subcommand) =>
    subcommand
      .setName("loop")
      .setDescription("設定循環模式。")
      .addStringOption((option) =>
        option
          .setName("mode")
          .setDescription("循環模式")
          .setRequired(true)
          .addChoices(
            { name: "關閉", value: "OFF" },
            { name: "單曲循環", value: "TRACK" },
            { name: "佇列循環", value: "QUEUE" }
          )
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("autoplay")
      .setDescription("切換自動播放。")
      .addBooleanOption((option) =>
        option.setName("enabled").setDescription("自動播放狀態").setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("volume")
      .setDescription("設定音量。")
      .addIntegerOption((option) =>
        option
          .setName("value")
          .setDescription("0-150")
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(150)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("seek")
      .setDescription("跳轉到指定秒數。")
      .addIntegerOption((option) =>
        option.setName("seconds").setDescription("秒數").setRequired(true).setMinValue(0)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("jump")
      .setDescription("跳轉到待播佇列位置。")
      .addIntegerOption((option) =>
        option.setName("position").setDescription("佇列位置").setRequired(true).setMinValue(1)
      )
  )
  .addSubcommand((subcommand) => subcommand.setName("queue").setDescription("查看播放佇列。"))
  .addSubcommand((subcommand) => subcommand.setName("now").setDescription("查看目前播放歌曲。"))
  .addSubcommand((subcommand) => subcommand.setName("history").setDescription("查看播放紀錄。"))
  .addSubcommand((subcommand) => subcommand.setName("favorite").setDescription("收藏目前歌曲。"));

export const musicCommand: DiscordCommand = {
  name: "music",
  data: builder.toJSON(),
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    const guildId = requireGuildId(interaction);
    const memberContext = await context.discordGateway.getVoiceMemberContext(
      guildId,
      interaction.user.id
    );
    if (!memberContext) {
      throw new AppError("PERMISSION_DENIED", "Guild member context not found.");
    }

    const start = performance.now();
    try {
      if (subcommand === "play") {
        await context.authorization.assertAllowed(memberContext, "PLAY");
        await interaction.deferReply();
        if (!memberContext.voiceChannelId)
          throw new AppError("PERMISSION_DENIED", "Join a voice channel first.");
        const queue = await context.music.play({
          guildId,
          voiceChannelId: memberContext.voiceChannelId,
          textChannelId: memberContext.textChannelId,
          shardId: memberContext.shardId,
          requesterId: interaction.user.id,
          query: interaction.options.getString("query", true)
        });
        await interaction.editReply({
          embeds: [queueEmbed(queue)],
          components: [playerControls()]
        });
        return;
      }

      await context.authorization.assertAllowed(memberContext, controlAction(subcommand));
      await interaction.deferReply({ ephemeral: subcommand !== "queue" && subcommand !== "now" });
      const queue = await executeControl(subcommand, interaction, context, guildId);
      await interaction.editReply({ embeds: [queueEmbed(queue)], components: [playerControls()] });
    } finally {
      context.metrics.observeCommand(`music.${subcommand}`, performance.now() - start);
    }
  }
};

export const musicComponents: ComponentHandler = {
  canHandle(customId: string): boolean {
    return customId.startsWith("music:");
  },
  async handleButton(
    interaction: ButtonInteraction,
    context: CommandContext,
    customId: string
  ): Promise<void> {
    const guildId = requireGuildId(interaction);
    const memberContext = await context.discordGateway.getVoiceMemberContext(
      guildId,
      interaction.user.id
    );
    if (!memberContext) {
      throw new AppError("PERMISSION_DENIED", "Guild member context not found.");
    }
    await context.authorization.assertAllowed(
      memberContext,
      customId === "music:favorite" ? "PLAY" : "CONTROL"
    );
    await interaction.deferReply({ ephemeral: true });

    if (customId === "music:pause") {
      await interaction.editReply({ embeds: [queueEmbed(await context.music.pause(guildId))] });
      return;
    }
    if (customId === "music:skip") {
      await interaction.editReply({ embeds: [queueEmbed(await context.music.skip(guildId))] });
      return;
    }
    if (customId === "music:stop") {
      await interaction.editReply({ embeds: [queueEmbed(await context.music.stop(guildId))] });
      return;
    }
    if (customId === "music:favorite") {
      const track = await context.favorites.addCurrent(guildId, interaction.user.id);
      await interaction.editReply({ embeds: [trackEmbed(track)] });
    }
  }
};

async function executeControl(
  subcommand: string,
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
  guildId: string
) {
  switch (subcommand) {
    case "pause":
      return context.music.pause(guildId);
    case "resume":
      return context.music.resume(guildId);
    case "stop":
      return context.music.stop(guildId);
    case "skip":
      return context.music.skip(guildId);
    case "previous":
      return context.music.previous(guildId);
    case "remove":
      return context.music.remove(guildId, interaction.options.getInteger("position", true));
    case "move":
      return context.music.move(
        guildId,
        interaction.options.getInteger("from", true),
        interaction.options.getInteger("to", true)
      );
    case "clear":
      return context.music.clear(guildId);
    case "shuffle":
      return context.music.shuffle(guildId);
    case "loop":
      return context.music.setLoopMode(
        guildId,
        interaction.options.getString("mode", true) as LoopMode
      );
    case "autoplay":
      return context.music.setAutoplay(guildId, interaction.options.getBoolean("enabled", true));
    case "volume":
      return context.music.setVolume(guildId, interaction.options.getInteger("value", true));
    case "seek":
      return context.music.seek(guildId, interaction.options.getInteger("seconds", true) * 1000);
    case "jump":
      return context.music.jump(guildId, interaction.options.getInteger("position", true));
    case "queue":
    case "now":
      return context.music.getQueue(guildId);
    case "history":
      return {
        ...(await context.music.getQueue(guildId)),
        upcoming: await context.history.list(guildId, 10)
      };
    case "favorite":
      await context.favorites.addCurrent(guildId, interaction.user.id);
      return context.music.getQueue(guildId);
    default:
      throw new AppError("VALIDATION_FAILED", "Unknown music subcommand.");
  }
}

function controlAction(subcommand: string): "CONTROL" | "QUEUE_MANAGE" | "EFFECTS" | "PLAY" {
  if (
    subcommand === "remove" ||
    subcommand === "move" ||
    subcommand === "clear" ||
    subcommand === "shuffle"
  ) {
    return "QUEUE_MANAGE";
  }
  return "CONTROL";
}

function requireGuildId(interaction: { readonly guildId: string | null }): string {
  if (!interaction.guildId) {
    throw new AppError("VALIDATION_FAILED", "This command can only be used in a guild.");
  }
  return interaction.guildId;
}

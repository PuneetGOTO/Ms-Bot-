import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";

import type { CommandContext, DiscordCommand } from "./Command";

const builder = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("查看機器人延遲。")
  .setDescriptionLocalizations({
    "zh-TW": "查看機器人延遲。"
  });

/**
 * Reports Discord interaction latency and gateway heartbeat latency.
 */
export const pingCommand: DiscordCommand = {
  name: "ping",
  data: builder.toJSON(),
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    const startedAt = performance.now();
    const interactionLatencyMs = Math.max(0, Date.now() - interaction.createdTimestamp);
    const websocketLatencyMs = Math.round(interaction.client.ws.ping);

    await interaction.reply({
      content: `Pong! 機器人延遲：${interactionLatencyMs}ms | WebSocket：${websocketLatencyMs}ms`,
      ephemeral: true
    });

    context.metrics.observeCommand("ping.latency", performance.now() - startedAt);
  }
};

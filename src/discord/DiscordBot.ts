import type { Client, Interaction } from "discord.js";

import type { CommandContext, DiscordCommand } from "./commands/Command";
import { componentHandlers, commands } from "./commands";
import { formatDiscordErrorMessage } from "./localization/discordMessages";
import { AppError, toError } from "../domain/errors/AppError";
import type { Logger } from "../application/ports/Logger";

interface CooldownRecord {
  readonly expiresAt: number;
}

/**
 * Discord runtime that owns the Client lifecycle and dispatches interactions.
 */
export class DiscordBot {
  public readonly client: Client;
  private readonly cooldowns = new Map<string, CooldownRecord>();
  private readonly commandMap: Map<string, DiscordCommand>;

  public constructor(
    client: Client,
    private readonly token: string,
    private readonly context: CommandContext,
    private readonly logger: Logger
  ) {
    this.client = client;
    this.commandMap = new Map(commands.map((command) => [command.name, command]));
    this.registerEvents();
  }

  public async start(): Promise<void> {
    await this.client.login(this.token);
  }

  public async stop(): Promise<void> {
    this.client.removeAllListeners();
    await this.client.destroy();
  }

  private registerEvents(): void {
    this.client.once("clientReady", (client: Client<true>) => {
      this.logger.info({ botId: client.user.id, tag: client.user.tag }, "Discord bot ready.");
    });
    this.client.on("interactionCreate", (interaction) => {
      void this.handleInteraction(interaction);
    });
    this.client.on("error", (error) => {
      this.logger.error({ error }, "Discord client error.");
    });
    this.client.on("warn", (message) => {
      this.logger.warn({ message }, "Discord client warning.");
    });
  }

  private async handleInteraction(interaction: Interaction): Promise<void> {
    const startedAt = performance.now();
    try {
      if (interaction.isChatInputCommand()) {
        this.assertCooldown(`${interaction.commandName}:${interaction.user.id}`, 2_000);
        const command = this.commandMap.get(interaction.commandName);
        if (!command) {
          throw new AppError("NOT_FOUND", "Command not found.");
        }
        await command.execute(interaction, this.context);
        this.context.metrics.observeCommand(interaction.commandName, performance.now() - startedAt);
        return;
      }

      if (interaction.isAutocomplete()) {
        const command = this.commandMap.get(interaction.commandName);
        await command?.autocomplete?.(interaction, this.context);
        return;
      }

      if (interaction.isButton()) {
        const handler = componentHandlers.find((candidate) =>
          candidate.canHandle(interaction.customId)
        );
        await handler?.handleButton?.(interaction, this.context, interaction.customId);
        return;
      }

      if (interaction.isStringSelectMenu()) {
        const handler = componentHandlers.find((candidate) =>
          candidate.canHandle(interaction.customId)
        );
        await handler?.handleSelect?.(interaction, this.context, interaction.customId);
        return;
      }

      if (interaction.isModalSubmit()) {
        const handler = componentHandlers.find((candidate) =>
          candidate.canHandle(interaction.customId)
        );
        await handler?.handleModal?.(interaction, this.context, interaction.customId);
      }
    } catch (error) {
      await this.replyWithError(interaction, error);
    }
  }

  private assertCooldown(key: string, durationMs: number): void {
    const now = Date.now();
    const existing = this.cooldowns.get(key);
    if (existing && existing.expiresAt > now) {
      throw new AppError("RATE_LIMITED", "Command cooldown is still active.");
    }
    this.cooldowns.set(key, { expiresAt: now + durationMs });

    if (this.cooldowns.size > 10_000) {
      for (const [cooldownKey, value] of this.cooldowns.entries()) {
        if (value.expiresAt <= now) {
          this.cooldowns.delete(cooldownKey);
        }
      }
    }
  }

  private async replyWithError(interaction: Interaction, error: unknown): Promise<void> {
    const appError =
      error instanceof AppError
        ? error
        : new AppError("INFRASTRUCTURE_FAILED", "Unexpected Discord interaction error.", {
            cause: error,
            expose: false
          });
    this.logger.error(
      {
        code: appError.code,
        interactionId: interaction.id,
        ...(interaction.guildId ? { guildId: interaction.guildId } : {}),
        userId: interaction.user.id,
        error: toError(appError)
      },
      "Discord interaction failed."
    );

    const message = formatDiscordErrorMessage(appError);
    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: message, ephemeral: true });
      } else {
        await interaction.reply({ content: message, ephemeral: true });
      }
    }
  }
}

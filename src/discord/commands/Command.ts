import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  StringSelectMenuInteraction
} from "discord.js";

import type { AuthorizationService } from "../../application/services/AuthorizationService";
import type { FavoriteService } from "../../application/services/FavoriteService";
import type { GuildSettingsService } from "../../application/services/GuildSettingsService";
import type { MusicService } from "../../application/services/MusicService";
import type { PlaylistService } from "../../application/services/PlaylistService";
import type { DiscordGateway } from "../../application/ports/DiscordGateway";
import type { HistoryRepository } from "../../application/ports/Repositories";
import type { Logger } from "../../application/ports/Logger";
import type { MetricsRegistry } from "../../infrastructure/monitoring/MetricsRegistry";

export interface CommandContext {
  readonly music: MusicService;
  readonly authorization: AuthorizationService;
  readonly favorites: FavoriteService;
  readonly playlists: PlaylistService;
  readonly guildSettings: GuildSettingsService;
  readonly discordGateway: DiscordGateway;
  readonly history: HistoryRepository;
  readonly metrics: MetricsRegistry;
  readonly logger: Logger;
}

export interface DiscordCommand {
  readonly name: string;
  readonly data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction, context: CommandContext): Promise<void>;
}

export interface ComponentHandler {
  canHandle(customId: string): boolean;
  handleButton?(
    interaction: ButtonInteraction,
    context: CommandContext,
    customId: string
  ): Promise<void>;
  handleSelect?(
    interaction: StringSelectMenuInteraction,
    context: CommandContext,
    customId: string
  ): Promise<void>;
  handleModal?(
    interaction: ModalSubmitInteraction,
    context: CommandContext,
    customId: string
  ): Promise<void>;
}

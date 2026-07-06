import { AppError } from "../../domain/errors/AppError";
import type { GuildSettingsRepository, PremiumRepository } from "../ports/Repositories";
import type { VoiceMemberContext } from "../ports/DiscordGateway";

export type MusicAction =
  "PLAY" | "CONTROL" | "QUEUE_MANAGE" | "EFFECTS" | "ADMIN" | "PREMIUM_EFFECTS";

/**
 * Central permission policy for DJ mode, role restrictions, channel restrictions, and premium gates.
 */
export class AuthorizationService {
  public constructor(
    private readonly guildSettingsRepository: GuildSettingsRepository,
    private readonly premiumRepository: PremiumRepository
  ) {}

  /** Throws when a member is not allowed to run an action. */
  public async assertAllowed(context: VoiceMemberContext, action: MusicAction): Promise<void> {
    const settings = await this.guildSettingsRepository.getOrCreate(context.guildId);

    if (action === "ADMIN" && !context.isAdministrator) {
      throw new AppError("PERMISSION_DENIED", "Administrator permission is required.");
    }

    if (!context.voiceChannelId && action !== "ADMIN") {
      throw new AppError("PERMISSION_DENIED", "You must join a voice channel first.");
    }

    if (
      context.voiceChannelId &&
      settings.allowedVoiceChannelIds.length > 0 &&
      !settings.allowedVoiceChannelIds.includes(context.voiceChannelId)
    ) {
      throw new AppError("PERMISSION_DENIED", "This voice channel is not allowed.");
    }

    if (
      context.textChannelId &&
      settings.allowedTextChannelIds.length > 0 &&
      !settings.allowedTextChannelIds.includes(context.textChannelId)
    ) {
      throw new AppError("PERMISSION_DENIED", "This text channel is not allowed.");
    }

    if (context.roleIds.some((roleId) => settings.blockedRoleIds.includes(roleId))) {
      throw new AppError(
        "PERMISSION_DENIED",
        "One of your roles is blocked from using music commands."
      );
    }

    if (
      settings.allowedRoleIds.length > 0 &&
      !context.roleIds.some((roleId) => settings.allowedRoleIds.includes(roleId)) &&
      !context.isAdministrator
    ) {
      throw new AppError("PERMISSION_DENIED", "You do not have an allowed role.");
    }

    const djAction = action === "CONTROL" || action === "QUEUE_MANAGE" || action === "EFFECTS";
    if (
      settings.djModeEnabled &&
      djAction &&
      !context.isAdministrator &&
      !context.roleIds.some((roleId) => settings.djRoleIds.includes(roleId))
    ) {
      throw new AppError("PERMISSION_DENIED", "DJ role is required for this action.");
    }

    if (settings.premiumOnlyEffects && action === "PREMIUM_EFFECTS") {
      const premium = await this.premiumRepository.hasPremium(context.userId);
      if (!premium) {
        throw new AppError("PERMISSION_DENIED", "Premium is required for this effect.");
      }
    }
  }
}

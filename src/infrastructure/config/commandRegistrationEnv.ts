import "dotenv/config";
import { z } from "zod";

import { AppError } from "../../domain/errors/AppError";

const commandRegistrationSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().optional().default("")
});

export type CommandRegistrationConfig = z.infer<typeof commandRegistrationSchema>;

/** Loads only the Discord configuration needed to register slash commands. */
export function loadCommandRegistrationConfig(): CommandRegistrationConfig {
  const parsed = commandRegistrationSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new AppError("CONFIG_INVALID", "Discord command registration configuration is invalid.", {
      details: z.flattenError(parsed.error),
      expose: false
    });
  }
  return parsed.data;
}

import { REST, Routes } from "discord.js";

import { commands } from "../discord/commands";
import { loadCommandRegistrationConfig } from "../infrastructure/config/commandRegistrationEnv";

const config = loadCommandRegistrationConfig();
const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);
const body = commands.map((command) => command.data);

if (config.DISCORD_GUILD_ID) {
  await rest.put(
    Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID),
    { body }
  );
  console.log(`Registered ${body.length} guild commands.`);
} else {
  await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), { body });
  console.log(`Registered ${body.length} global commands.`);
}

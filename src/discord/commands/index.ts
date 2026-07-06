import { adminCommand } from "./adminCommand";
import { effectsCommand, effectsComponents } from "./effectsCommand";
import { musicCommand, musicComponents } from "./musicCommand";
import { playlistCommand, playlistComponents } from "./playlistCommand";
import type { ComponentHandler, DiscordCommand } from "./Command";

export const commands: readonly DiscordCommand[] = [
  musicCommand,
  effectsCommand,
  playlistCommand,
  adminCommand
];
export const componentHandlers: readonly ComponentHandler[] = [
  musicComponents,
  effectsComponents,
  playlistComponents
];

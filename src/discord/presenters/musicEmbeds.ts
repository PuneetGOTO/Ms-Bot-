import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} from "discord.js";

import type { QueueSummary, QueueTrack } from "../../domain/music/types";
import {
  formatEnabled,
  formatLoopMode,
  formatPlaybackStatus
} from "../localization/discordMessages";

const embedTitleLimit = 256;
const embedDescriptionLimit = 4096;
const embedFieldValueLimit = 1024;
const embedUrlLimit = 2048;
const queueLineLimit = 240;

export function queueEmbed(queue: QueueSummary): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x2f7d6d)
    .setTitle(queue.current ? "正在播放" : "播放佇列")
    .setDescription(
      queue.current
        ? truncate(trackLine(queue.current, embedDescriptionLimit), embedDescriptionLimit)
        : "目前沒有播放中的歌曲。"
    )
    .addFields(
      {
        name: "狀態",
        value: truncate(
          `${formatPlaybackStatus(queue.status)} | 循環：${formatLoopMode(queue.loopMode)} | 自動播放：${formatEnabled(queue.autoplay)}`,
          embedFieldValueLimit
        ),
        inline: false
      },
      {
        name: "待播清單",
        value: formatUpcoming(queue.upcoming),
        inline: false
      }
    )
    .setFooter({ text: `音量 ${queue.volume}% | 位置 ${formatDuration(queue.positionMs)}` })
    .setTimestamp();

  if (queue.current?.artworkUrl) {
    embed.setThumbnail(queue.current.artworkUrl);
  }

  return embed;
}

export function trackEmbed(track: QueueTrack): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(truncate(track.title, embedTitleLimit))
    .setDescription(truncate(track.author, embedDescriptionLimit))
    .addFields(
      { name: "來源", value: track.source, inline: true },
      {
        name: "長度",
        value: track.durationMs ? formatDuration(track.durationMs) : "直播",
        inline: true
      }
    )
    .setTimestamp(track.requestedAt);
  if (track.uri && isSafeUrl(track.uri)) {
    embed.setURL(track.uri);
  }
  if (track.artworkUrl && isSafeUrl(track.artworkUrl)) {
    embed.setThumbnail(track.artworkUrl);
  }
  return embed;
}

export function playerControls(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("music:pause").setStyle(ButtonStyle.Secondary).setLabel("暫停"),
    new ButtonBuilder().setCustomId("music:skip").setStyle(ButtonStyle.Primary).setLabel("跳過"),
    new ButtonBuilder().setCustomId("music:stop").setStyle(ButtonStyle.Danger).setLabel("停止"),
    new ButtonBuilder().setCustomId("music:favorite").setStyle(ButtonStyle.Success).setLabel("收藏")
  );
}

export function effectsSelect(): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("effects:preset")
      .setPlaceholder("選擇音效")
      .addOptions(
        { label: "關閉", value: "off" },
        { label: "低音增強", value: "bassboost" },
        { label: "高音增強", value: "treble" },
        { label: "Nightcore", value: "nightcore" },
        { label: "蒸氣波", value: "vaporwave" },
        { label: "卡拉 OK", value: "karaoke" },
        { label: "旋轉", value: "rotation" },
        { label: "回音", value: "echo" },
        { label: "混響", value: "reverb" }
      )
  );
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatUpcoming(tracks: readonly QueueTrack[]): string {
  if (tracks.length === 0) {
    return "佇列是空的。";
  }

  const lines = tracks
    .slice(0, 10)
    .map((track, index) => `${index + 1}. ${trackLine(track, queueLineLimit)}`);
  return truncate(lines.join("\n"), embedFieldValueLimit);
}

function trackLine(track: QueueTrack, limit: number): string {
  const duration = track.durationMs ? formatDuration(track.durationMs) : "直播";
  const title = truncate(track.title, 120);
  const author = truncate(track.author, 80);
  const plain = `${title} - ${author} (${duration})`;
  if (!track.uri || !isSafeUrl(track.uri)) {
    return truncate(plain, limit);
  }

  const linked = `[${title}](${track.uri}) - ${author} (${duration})`;
  return linked.length <= limit ? linked : truncate(plain, limit);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function isSafeUrl(value: string): boolean {
  if (value.length > embedUrlLimit) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

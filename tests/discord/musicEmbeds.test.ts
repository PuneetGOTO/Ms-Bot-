import { describe, expect, it } from "vitest";

import { playerControls, queueEmbed, trackEmbed } from "../../src/discord/presenters/musicEmbeds";
import type { QueueSummary, QueueTrack } from "../../src/domain/music/types";

describe("music embeds", () => {
  it("keeps queue embeds within Discord limits for long track metadata", () => {
    const queue: QueueSummary = {
      guildId: "guild",
      status: "playing",
      loopMode: "OFF",
      autoplay: false,
      volume: 80,
      positionMs: 0,
      current: track("current"),
      upcoming: Array.from({ length: 10 }, (_value, index) => track(`upcoming-${index}`)),
      history: []
    };

    const json = queueEmbed(queue).toJSON();
    const fields = json.fields ?? [];

    expect(json.description?.length ?? 0).toBeLessThanOrEqual(4096);
    expect(fields.every((field) => field.value.length <= 1024)).toBe(true);
  });

  it("keeps track embeds within Discord limits for long track metadata", () => {
    const json = trackEmbed(track("standalone")).toJSON();

    expect(json.title?.length ?? 0).toBeLessThanOrEqual(256);
    expect(json.description?.length ?? 0).toBeLessThanOrEqual(4096);
  });

  it("renders the full playback control button row", () => {
    const json = playerControls().toJSON();

    expect(json.components).toEqual([
      expect.objectContaining({ custom_id: "music:pause", label: "暫停" }),
      expect.objectContaining({ custom_id: "music:resume", label: "繼續" }),
      expect.objectContaining({ custom_id: "music:skip", label: "跳過" }),
      expect.objectContaining({ custom_id: "music:stop", label: "停止" }),
      expect.objectContaining({ custom_id: "music:favorite", label: "收藏" })
    ]);
  });
});

function track(identifier: string): QueueTrack {
  const longTitle = `${identifier} ${"超長歌名".repeat(100)}`;
  const longAuthor = `Artist ${"Very Long Author ".repeat(100)}`;
  const longUrl = `https://example.com/${identifier}/${"segment/".repeat(400)}`;

  return {
    encoded: `encoded-${identifier}`,
    identifier,
    source: "SOUNDCLOUD",
    title: longTitle,
    author: longAuthor,
    durationMs: 115_000,
    uri: longUrl,
    artworkUrl: longUrl,
    isSeekable: true,
    isStream: false,
    requesterId: "user",
    requestedAt: new Date("2026-01-01T00:00:00.000Z"),
    queueId: `queue-${identifier}`
  };
}

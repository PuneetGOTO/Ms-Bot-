import { describe, expect, it } from "vitest";

import { QueueManager } from "../../src/domain/music/QueueManager";
import type { Track } from "../../src/domain/music/types";

describe("QueueManager", () => {
  it("enqueues, advances, and records history", () => {
    const queue = new QueueManager({ guildId: "guild", maxQueueSize: 10, defaultVolume: 80 });
    queue.enqueue([track("1"), track("2")]);

    expect(queue.next()?.identifier).toBe("1");
    expect(queue.next()?.identifier).toBe("2");
    expect(queue.summary().history.map((item) => item.identifier)).toEqual(["1"]);
  });

  it("supports track loop without consuming upcoming tracks", () => {
    const queue = new QueueManager({ guildId: "guild", maxQueueSize: 10, defaultVolume: 80 });
    queue.enqueue([track("1"), track("2")]);
    expect(queue.next()?.identifier).toBe("1");

    queue.setLoopMode("TRACK");

    expect(queue.next()?.identifier).toBe("1");
    expect(queue.summary().upcoming.map((item) => item.identifier)).toEqual(["2"]);
  });

  it("moves, removes, and jumps using one-based positions", () => {
    const queue = new QueueManager({ guildId: "guild", maxQueueSize: 10, defaultVolume: 80 });
    queue.enqueue([track("1"), track("2"), track("3")]);

    queue.move(1, 3);
    expect(queue.summary().upcoming.map((item) => item.identifier)).toEqual(["2", "3", "1"]);

    queue.remove(2);
    expect(queue.summary().upcoming.map((item) => item.identifier)).toEqual(["2", "1"]);

    expect(queue.jump(2).identifier).toBe("1");
    expect(queue.current?.identifier).toBe("1");
  });

  it("restores from snapshot", () => {
    const queue = new QueueManager({ guildId: "guild", maxQueueSize: 10, defaultVolume: 80 });
    queue.enqueue([track("1")]);
    queue.next();
    queue.setVolume(90, 150);
    const restored = QueueManager.fromSnapshot(queue.snapshot(), 10);

    expect(restored.summary().volume).toBe(90);
    expect(restored.current?.identifier).toBe("1");
  });
});

function track(identifier: string): Track {
  return {
    encoded: `encoded-${identifier}`,
    identifier,
    source: "YOUTUBE",
    title: `Track ${identifier}`,
    author: "Artist",
    durationMs: 120_000,
    uri: `https://example.com/${identifier}`,
    artworkUrl: null,
    isSeekable: true,
    isStream: false,
    requesterId: "user",
    requestedAt: new Date("2026-01-01T00:00:00.000Z")
  };
}

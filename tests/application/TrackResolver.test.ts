import { describe, expect, it } from "vitest";

import { TrackResolver } from "../../src/application/services/TrackResolver";
import type { Cache } from "../../src/application/ports/Cache";
import type { Logger } from "../../src/application/ports/Logger";
import type { MusicGateway, PlayerHandle } from "../../src/application/ports/MusicGateway";
import type { NodeStatusSnapshot, Track, TrackResolveResult } from "../../src/domain/music/types";

describe("TrackResolver", () => {
  it("prefixes plain text with ytsearch", () => {
    const resolver = new TrackResolver(fakeGateway(), new MemoryCache(), fakeLogger, {
      searchTtlSeconds: 60
    });

    expect(resolver.toLavalinkIdentifier("never gonna give you up")).toBe(
      "ytsearch:never gonna give you up"
    );
  });

  it("keeps urls as direct Lavalink identifiers", () => {
    const resolver = new TrackResolver(fakeGateway(), new MemoryCache(), fakeLogger, {
      searchTtlSeconds: 60
    });

    expect(resolver.toLavalinkIdentifier("https://example.com/radio")).toBe(
      "https://example.com/radio"
    );
  });

  it("keeps Spotify identifiers for LavaSrc", () => {
    const resolver = new TrackResolver(fakeGateway(), new MemoryCache(), fakeLogger, {
      searchTtlSeconds: 60
    });

    expect(resolver.toLavalinkIdentifier("spotify:track:0eG08cBeKk0mzykKjw4hcQ")).toBe(
      "spotify:track:0eG08cBeKk0mzykKjw4hcQ"
    );
    expect(resolver.toLavalinkIdentifier("spsearch:Aimer Kataomoi")).toBe(
      "spsearch:Aimer Kataomoi"
    );
    expect(resolver.toLavalinkIdentifier("sprec:mix:track:4PTG3Z6ehGkBFwjybzWkR8")).toBe(
      "sprec:mix:track:4PTG3Z6ehGkBFwjybzWkR8"
    );
  });

  it("caches resolve results", async () => {
    const gateway = fakeGateway();
    const cache = new MemoryCache();
    const resolver = new TrackResolver(gateway, cache, fakeLogger, { searchTtlSeconds: 60 });

    await resolver.resolve("query", "user");
    await resolver.resolve("query", "user");

    expect(gateway.resolveCount).toBe(1);
  });

  it("restores cached track timestamps as Date objects", async () => {
    const gateway = fakeGateway();
    const cache = new MemoryCache();
    const resolver = new TrackResolver(gateway, cache, fakeLogger, { searchTtlSeconds: 60 });

    await resolver.resolve("query", "user");
    const cached = await resolver.resolve("query", "user");
    const [resolvedTrack] = cached.tracks;

    expect(resolvedTrack?.requestedAt).toBeInstanceOf(Date);
  });
});

class MemoryCache implements Cache {
  private readonly values = new Map<string, string>();

  public async getJson<TValue>(key: string): Promise<TValue | null> {
    const raw = this.values.get(key);
    return raw ? (JSON.parse(raw) as TValue) : null;
  }

  public async setJson<TValue>(key: string, value: TValue, _ttlSeconds: number): Promise<void> {
    this.values.set(key, JSON.stringify(value));
  }

  public async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  public async rememberJson<TValue>(
    key: string,
    _ttlSeconds: number,
    factory: () => Promise<TValue>
  ): Promise<TValue> {
    const cached = await this.getJson<TValue>(key);
    if (cached) return cached;
    const value = await factory();
    await this.setJson(key, value, _ttlSeconds);
    return value;
  }
}

interface FakeGateway extends MusicGateway {
  resolveCount: number;
}

function fakeGateway(): FakeGateway {
  return {
    resolveCount: 0,
    async connect(): Promise<PlayerHandle> {
      throw new Error("not implemented");
    },
    getPlayer(): PlayerHandle | null {
      return null;
    },
    async resolve(_identifier: string, requesterId: string): Promise<TrackResolveResult> {
      this.resolveCount += 1;
      return { type: "search", tracks: [track(requesterId)] };
    },
    async destroy(): Promise<void> {},
    async getNodeStatuses(): Promise<readonly NodeStatusSnapshot[]> {
      return [];
    }
  };
}

const fakeLogger: Logger = {
  child: () => fakeLogger,
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
};

function track(requesterId: string): Track {
  return {
    encoded: "encoded",
    identifier: "identifier",
    source: "YOUTUBE",
    title: "Title",
    author: "Author",
    durationMs: 1000,
    uri: null,
    artworkUrl: null,
    isSeekable: true,
    isStream: false,
    requesterId,
    requestedAt: new Date("2026-01-01T00:00:00.000Z")
  };
}

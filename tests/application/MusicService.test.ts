import { describe, expect, it } from "vitest";

import { TrackResolver } from "../../src/application/services/TrackResolver";
import { MusicService } from "../../src/application/services/MusicService";
import { defaultGuildSettings } from "../../src/domain/guild/GuildSettings";
import type { Cache } from "../../src/application/ports/Cache";
import type {
  EventBus,
  EventHandler,
  EventSubscription
} from "../../src/application/ports/EventBus";
import type { Logger } from "../../src/application/ports/Logger";
import type {
  ConnectPlayerOptions,
  MusicGateway,
  PlayerHandle
} from "../../src/application/ports/MusicGateway";
import type {
  AnalyticsRepository,
  GuildSettingsRepository,
  HistoryRecord,
  HistoryRepository,
  QueueSnapshotRepository
} from "../../src/application/ports/Repositories";
import type {
  AudioFilters,
  NodeStatusSnapshot,
  QueueSnapshot,
  QueueTrack,
  Track,
  TrackResolveResult
} from "../../src/domain/music/types";

describe("MusicService", () => {
  it("reconnects and starts playback when a restored queue has current track but no player", async () => {
    const gateway = new FakeMusicGateway();
    const snapshotRepository = new MemorySnapshotRepository(snapshotWithCurrent());
    const service = new MusicService(
      new TrackResolver(gateway, new MemoryCache(), fakeLogger, { searchTtlSeconds: 60 }),
      gateway,
      new FakeGuildSettingsRepository(),
      snapshotRepository,
      new FakeHistoryRepository(),
      new FakeAnalyticsRepository(),
      new NoopEventBus(),
      fakeLogger,
      {
        idleTimeoutSeconds: 300,
        defaultVolume: 80,
        maxVolume: 150,
        maxQueueSize: 1000
      }
    );

    await service.play({
      guildId: "guild",
      voiceChannelId: "voice",
      textChannelId: "text",
      shardId: 0,
      requesterId: "user",
      query: "new track"
    });

    expect(gateway.connectCount).toBe(1);
    expect(gateway.player.playedIdentifiers).toEqual(["current"]);
    expect(snapshotRepository.saved?.status).toBe("playing");

    service.dispose();
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
    ttlSeconds: number,
    factory: () => Promise<TValue>
  ): Promise<TValue> {
    const cached = await this.getJson<TValue>(key);
    if (cached) {
      return cached;
    }
    const value = await factory();
    await this.setJson(key, value, ttlSeconds);
    return value;
  }
}

class FakeMusicGateway implements MusicGateway {
  public readonly player = new FakePlayerHandle();
  public connectCount = 0;
  private activePlayer: PlayerHandle | null = null;

  public async connect(_options: ConnectPlayerOptions): Promise<PlayerHandle> {
    this.connectCount += 1;
    this.activePlayer = this.player;
    return this.player;
  }

  public getPlayer(): PlayerHandle | null {
    return this.activePlayer;
  }

  public async resolve(_identifier: string, requesterId: string): Promise<TrackResolveResult> {
    return { type: "search", tracks: [track("new", requesterId)] };
  }

  public async destroy(): Promise<void> {
    this.activePlayer = null;
  }

  public async getNodeStatuses(): Promise<readonly NodeStatusSnapshot[]> {
    return [];
  }
}

class FakePlayerHandle implements PlayerHandle {
  public readonly guildId = "guild";
  public readonly nodeName = "test-node";
  public readonly playedIdentifiers: string[] = [];

  public async play(trackToPlay: Track): Promise<void> {
    this.playedIdentifiers.push(trackToPlay.identifier);
  }

  public async stop(): Promise<void> {}
  public async pause(_paused: boolean): Promise<void> {}
  public async seek(_positionMs: number): Promise<void> {}
  public async setVolume(_volume: number): Promise<void> {}
  public async setFilters(_filters: AudioFilters): Promise<void> {}
  public async moveNode(_nodeName?: string): Promise<boolean> {
    return true;
  }
  public async destroy(): Promise<void> {}
}

class FakeGuildSettingsRepository implements GuildSettingsRepository {
  public async getOrCreate(guildId: string) {
    return defaultGuildSettings(guildId);
  }

  public async save(settings: ReturnType<typeof defaultGuildSettings>) {
    return settings;
  }
}

class MemorySnapshotRepository implements QueueSnapshotRepository {
  public saved: QueueSnapshot | null = null;

  public constructor(private readonly initial: QueueSnapshot | null) {}

  public async get(): Promise<QueueSnapshot | null> {
    return this.saved ?? this.initial;
  }

  public async save(snapshot: QueueSnapshot): Promise<void> {
    this.saved = snapshot;
  }

  public async delete(): Promise<void> {
    this.saved = null;
  }
}

class FakeHistoryRepository implements HistoryRepository {
  public readonly records: HistoryRecord[] = [];

  public async add(record: HistoryRecord): Promise<void> {
    this.records.push(record);
  }

  public async list(): Promise<readonly QueueTrack[]> {
    return [];
  }
}

class FakeAnalyticsRepository implements AnalyticsRepository {
  public async record(): Promise<void> {}
}

class NoopEventBus implements EventBus {
  public async publish(): Promise<void> {}

  public subscribe<TPayload>(
    _eventName: string,
    _handler: EventHandler<TPayload>
  ): EventSubscription {
    return { unsubscribe: () => {} };
  }
}

const fakeLogger: Logger = {
  child: () => fakeLogger,
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
};

function snapshotWithCurrent(): QueueSnapshot {
  const current = { ...track("current", "user"), queueId: "current-queue" };
  return {
    guildId: "guild",
    voiceChannelId: "old-voice",
    textChannelId: "old-text",
    status: "playing",
    loopMode: "OFF",
    autoplay: false,
    volume: 80,
    positionMs: 0,
    current,
    tracks: [],
    history: [],
    filters: {},
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function track(identifier: string, requesterId: string): Track {
  return {
    encoded: `encoded-${identifier}`,
    identifier,
    source: "SOUNDCLOUD",
    title: `Track ${identifier}`,
    author: "Artist",
    durationMs: 120_000,
    uri: `https://example.com/${identifier}`,
    artworkUrl: null,
    isSeekable: true,
    isStream: false,
    requesterId,
    requestedAt: new Date("2026-01-01T00:00:00.000Z")
  };
}

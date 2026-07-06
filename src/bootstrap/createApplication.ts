import { Client, GatewayIntentBits, Partials } from "discord.js";

import { AuthorizationService } from "../application/services/AuthorizationService";
import { FavoriteService } from "../application/services/FavoriteService";
import { GuildSettingsService } from "../application/services/GuildSettingsService";
import { MusicService } from "../application/services/MusicService";
import { PlaylistService } from "../application/services/PlaylistService";
import { TrackResolver } from "../application/services/TrackResolver";
import { DiscordBot } from "../discord/DiscordBot";
import { RedisCache } from "../infrastructure/cache/RedisCache";
import { createApiServer } from "../infrastructure/api/createApiServer";
import { loadConfig } from "../infrastructure/config/env";
import { createPrismaHandle } from "../infrastructure/database/prismaClient";
import { PrismaAnalyticsRepository } from "../infrastructure/database/repositories/PrismaAnalyticsRepository";
import { PrismaFavoriteRepository } from "../infrastructure/database/repositories/PrismaFavoriteRepository";
import { PrismaGuildSettingsRepository } from "../infrastructure/database/repositories/PrismaGuildSettingsRepository";
import { PrismaHistoryRepository } from "../infrastructure/database/repositories/PrismaHistoryRepository";
import { PrismaNodeStatusRepository } from "../infrastructure/database/repositories/PrismaNodeStatusRepository";
import { PrismaPlaylistRepository } from "../infrastructure/database/repositories/PrismaPlaylistRepository";
import { PrismaPremiumRepository } from "../infrastructure/database/repositories/PrismaPremiumRepository";
import { PrismaQueueSnapshotRepository } from "../infrastructure/database/repositories/PrismaQueueSnapshotRepository";
import { DiscordVoiceContextGateway } from "../infrastructure/discord/DiscordVoiceContextGateway";
import { InMemoryEventBus } from "../infrastructure/events/InMemoryEventBus";
import { PinoLogger } from "../infrastructure/logger/PinoLogger";
import { ShoukakuMusicGateway } from "../infrastructure/music/ShoukakuMusicGateway";
import { MetricsRegistry } from "../infrastructure/monitoring/MetricsRegistry";
import { NodeHealthWorker } from "../infrastructure/workers/NodeHealthWorker";
import { QueuePersistenceWorker } from "../infrastructure/workers/QueuePersistenceWorker";
import type { AppConfig } from "../infrastructure/config/env";
import type { NodeOption } from "shoukaku";

export interface Application {
  readonly config: AppConfig;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Wires infrastructure adapters to application services through explicit dependency injection.
 */
export async function createApplication(): Promise<Application> {
  const config = loadConfig();
  const logger = PinoLogger.create(config.LOG_LEVEL);
  const eventBus = new InMemoryEventBus(logger);
  const metrics = new MetricsRegistry(eventBus, config.PROMETHEUS_DEFAULT_METRICS);
  const redis = RedisCache.create(config.REDIS_URL, logger, {
    track: config.CACHE_TRACK_TTL_SECONDS,
    search: config.CACHE_SEARCH_TTL_SECONDS
  });
  const prismaHandle = createPrismaHandle(config.DATABASE_URL, logger);
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
    partials: [Partials.Channel],
    failIfNotExists: false
  });

  const guildSettingsRepository = new PrismaGuildSettingsRepository(prismaHandle.prisma);
  const snapshotRepository = new PrismaQueueSnapshotRepository(prismaHandle.prisma);
  const historyRepository = new PrismaHistoryRepository(prismaHandle.prisma);
  const favoriteRepository = new PrismaFavoriteRepository(prismaHandle.prisma);
  const playlistRepository = new PrismaPlaylistRepository(prismaHandle.prisma);
  const premiumRepository = new PrismaPremiumRepository(prismaHandle.prisma);
  const analyticsRepository = new PrismaAnalyticsRepository(prismaHandle.prisma);
  const nodeStatusRepository = new PrismaNodeStatusRepository(prismaHandle.prisma);

  const lavalinkNodes: NodeOption[] = config.LAVALINK_NODES.map((node) =>
    node.group
      ? { name: node.name, url: node.url, auth: node.auth, secure: node.secure, group: node.group }
      : { name: node.name, url: node.url, auth: node.auth, secure: node.secure }
  );
  const musicGateway = new ShoukakuMusicGateway(client, lavalinkNodes, eventBus, logger, {
    resumeTimeoutSeconds: config.LAVALINK_RESUME_TIMEOUT_SECONDS,
    reconnectTries: config.LAVALINK_RECONNECT_TRIES,
    reconnectIntervalSeconds: config.LAVALINK_RECONNECT_INTERVAL_SECONDS
  });
  const resolver = new TrackResolver(musicGateway, redis, logger, {
    searchTtlSeconds: config.CACHE_SEARCH_TTL_SECONDS
  });
  const music = new MusicService(
    resolver,
    musicGateway,
    guildSettingsRepository,
    snapshotRepository,
    historyRepository,
    analyticsRepository,
    eventBus,
    logger,
    {
      idleTimeoutSeconds: config.MUSIC_IDLE_TIMEOUT_SECONDS,
      defaultVolume: config.MUSIC_DEFAULT_VOLUME,
      maxVolume: config.MUSIC_MAX_VOLUME,
      maxQueueSize: config.MUSIC_MAX_QUEUE_SIZE
    }
  );
  const guildSettings = new GuildSettingsService(guildSettingsRepository);
  const authorization = new AuthorizationService(guildSettingsRepository, premiumRepository);
  const favorites = new FavoriteService(favoriteRepository, music);
  const playlists = new PlaylistService(playlistRepository, resolver, music);
  const discordGateway = new DiscordVoiceContextGateway(client);
  const commandContext = {
    music,
    authorization,
    favorites,
    playlists,
    guildSettings,
    discordGateway,
    history: historyRepository,
    metrics,
    logger
  };
  const bot = new DiscordBot(client, config.DISCORD_TOKEN, commandContext, logger);
  const api = await createApiServer({
    config,
    logger,
    prisma: prismaHandle.prisma,
    redis,
    music,
    guildSettings,
    playlists,
    favorites,
    history: historyRepository,
    gateway: musicGateway,
    metrics
  });
  const nodeWorker = new NodeHealthWorker(musicGateway, nodeStatusRepository, eventBus, logger);
  const queueWorker = new QueuePersistenceWorker(eventBus, snapshotRepository, logger);

  return {
    config,
    start: async () => {
      await redis.connect();
      await prismaHandle.prisma.$connect();
      await api.listen({ host: config.API_HOST, port: config.API_PORT });
      nodeWorker.start();
      queueWorker.start();
      await bot.start();
      logger.info({ port: config.API_PORT }, "Application started.");
    },
    stop: async () => {
      logger.info({}, "Application stopping.");
      nodeWorker.stop();
      await queueWorker.stop();
      music.dispose();
      metrics.dispose();
      await bot.stop();
      await api.close();
      await redis.disconnect();
      await prismaHandle.disconnect();
      logger.info({}, "Application stopped.");
    }
  };
}

import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import type { FavoriteService } from "../../application/services/FavoriteService";
import type { GuildSettingsPatch } from "../../application/services/GuildSettingsService";
import type { GuildSettingsService } from "../../application/services/GuildSettingsService";
import type { MusicService } from "../../application/services/MusicService";
import type { PlaylistService } from "../../application/services/PlaylistService";
import type { HistoryRepository } from "../../application/ports/Repositories";
import type { MusicGateway } from "../../application/ports/MusicGateway";
import { AppError, toError } from "../../domain/errors/AppError";
import type { NodeStatusSnapshot } from "../../domain/music/types";
import type { RedisCache } from "../cache/RedisCache";
import type { AppConfig } from "../config/env";
import type { PinoLogger } from "../logger/PinoLogger";
import type { MetricsRegistry } from "../monitoring/MetricsRegistry";

export interface ApiServerDependencies {
  readonly config: AppConfig;
  readonly logger: PinoLogger;
  readonly prisma: PrismaClient;
  readonly redis: RedisCache;
  readonly music: MusicService;
  readonly guildSettings: GuildSettingsService;
  readonly playlists: PlaylistService;
  readonly favorites: FavoriteService;
  readonly history: HistoryRepository;
  readonly gateway: MusicGateway;
  readonly metrics: MetricsRegistry;
}

interface NodeStatusResponse {
  readonly name: string;
  readonly connected: boolean;
  readonly sessionId: string | null;
  readonly players: number;
  readonly playingPlayers: number;
  readonly cpuLoad: number | null;
  readonly memoryUsedBytes: string | null;
  readonly frameDeficit: number | null;
  readonly frameNulled: number | null;
  readonly pingMs: number | null;
  readonly lastError: string | null;
}

const guildParams = z.object({ guildId: z.string().min(1) });
const volumeBody = z.object({ volume: z.number().int().min(0).max(1000) });
const seekBody = z.object({ positionMs: z.number().int().min(0) });
const playBody = z.object({
  voiceChannelId: z.string().min(1),
  textChannelId: z.string().nullable().default(null),
  shardId: z.number().int().min(0).default(0),
  requesterId: z.string().min(1),
  query: z.string().min(1)
});
const loopBody = z.object({ loopMode: z.enum(["OFF", "TRACK", "QUEUE"]) });
const effectsBody = z.object({
  preset: z.enum([
    "off",
    "bassboost",
    "treble",
    "nightcore",
    "vaporwave",
    "karaoke",
    "rotation",
    "echo",
    "reverb"
  ])
});
const settingsPatchBody = z
  .object({
    locale: z.string().optional(),
    djModeEnabled: z.boolean().optional(),
    djRoleIds: z.array(z.string()).optional(),
    allowedRoleIds: z.array(z.string()).optional(),
    blockedRoleIds: z.array(z.string()).optional(),
    allowedTextChannelIds: z.array(z.string()).optional(),
    allowedVoiceChannelIds: z.array(z.string()).optional(),
    defaultVolume: z.number().int().min(0).max(1000).optional(),
    maxQueueSize: z.number().int().min(1).max(5000).optional(),
    announceNowPlaying: z.boolean().optional(),
    autoplayEnabled: z.boolean().optional(),
    premiumOnlyEffects: z.boolean().optional()
  })
  .strict();

/** Creates the Fastify REST API with health, player, queue, playlist, analytics, admin, and Swagger routes. */
export async function createApiServer(deps: ApiServerDependencies): Promise<FastifyInstance> {
  const app = fastify({ logger: false, trustProxy: true });

  await app.register(helmet);
  await app.register(cors, { origin: true, credentials: false });
  await app.register(rateLimit, {
    max: deps.config.RATE_LIMIT_MAX,
    timeWindow: `${deps.config.RATE_LIMIT_WINDOW_SECONDS} seconds`
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Enterprise Discord Music Bot API",
        version: "1.0.0"
      }
    }
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.setErrorHandler((error, request, reply) => {
    const appError =
      error instanceof AppError
        ? error
        : new AppError("INFRASTRUCTURE_FAILED", "Unexpected API error.", {
            cause: error,
            expose: false
          });
    deps.logger.error(
      {
        traceId: request.id,
        code: appError.code,
        error: toError(appError),
        details: appError.details
      },
      "API request failed."
    );
    const statusCode =
      appError.code === "PERMISSION_DENIED" ? 403 : appError.code === "NOT_FOUND" ? 404 : 400;
    void reply.status(statusCode).send({
      error: appError.code,
      message: appError.expose ? appError.message : "Internal server error",
      traceId: request.id
    });
  });

  app.addHook("preHandler", (request, _reply, done) => {
    try {
      if (
        request.url === "/health" ||
        request.url === "/ready" ||
        request.url.startsWith("/docs")
      ) {
        done();
        return;
      }
      if (request.url === "/metrics") {
        assertBearer(request.headers.authorization, deps.config.METRICS_TOKEN);
        done();
        return;
      }
      assertBearer(request.headers.authorization, deps.config.API_TOKEN);
      done();
    } catch (error) {
      done(toError(error));
    }
  });

  app.get("/health", () => ({ status: "ok", uptimeSeconds: process.uptime() }));
  app.get("/ready", async () => {
    await deps.prisma.$queryRaw`SELECT 1`;
    await deps.redis.ping();
    return { status: "ready", nodes: await getNodeStatusResponse(deps.gateway) };
  });
  app.get("/metrics", async (_request, reply) => {
    return reply.type(deps.metrics.contentType()).send(await deps.metrics.metrics());
  });

  app.get("/api/player/:guildId", (request) => {
    const params = guildParams.parse(request.params);
    return deps.music.getQueue(params.guildId);
  });
  app.post("/api/player/:guildId/play", async (request) => {
    const params = guildParams.parse(request.params);
    const body = playBody.parse(request.body);
    return deps.music.play({ guildId: params.guildId, ...body });
  });
  app.post("/api/player/:guildId/pause", (request) =>
    deps.music.pause(guildParams.parse(request.params).guildId)
  );
  app.post("/api/player/:guildId/resume", (request) =>
    deps.music.resume(guildParams.parse(request.params).guildId)
  );
  app.post("/api/player/:guildId/stop", (request) =>
    deps.music.stop(guildParams.parse(request.params).guildId)
  );
  app.post("/api/player/:guildId/skip", (request) =>
    deps.music.skip(guildParams.parse(request.params).guildId)
  );
  app.post("/api/player/:guildId/volume", (request) => {
    const params = guildParams.parse(request.params);
    const body = volumeBody.parse(request.body);
    return deps.music.setVolume(params.guildId, body.volume);
  });
  app.post("/api/player/:guildId/seek", (request) => {
    const params = guildParams.parse(request.params);
    const body = seekBody.parse(request.body);
    return deps.music.seek(params.guildId, body.positionMs);
  });
  app.post("/api/player/:guildId/loop", (request) => {
    const params = guildParams.parse(request.params);
    const body = loopBody.parse(request.body);
    return deps.music.setLoopMode(params.guildId, body.loopMode);
  });
  app.post("/api/player/:guildId/effects", (request) => {
    const params = guildParams.parse(request.params);
    const body = effectsBody.parse(request.body);
    return deps.music.applyPreset(params.guildId, body.preset);
  });

  app.get("/api/guild/:guildId", (request) =>
    deps.guildSettings.get(guildParams.parse(request.params).guildId)
  );
  app.patch("/api/guild/:guildId", async (request) => {
    const params = guildParams.parse(request.params);
    const patch = compactSettingsPatch(settingsPatchBody.parse(request.body));
    return deps.guildSettings.update(params.guildId, patch);
  });

  app.get("/api/history/:guildId", (request) =>
    deps.history.list(guildParams.parse(request.params).guildId, 50)
  );
  app.get("/api/nodes", () => getNodeStatusResponse(deps.gateway));

  return app;
}

async function getNodeStatusResponse(
  gateway: MusicGateway
): Promise<readonly NodeStatusResponse[]> {
  const nodes = await gateway.getNodeStatuses();
  return nodes.map(toNodeStatusResponse);
}

function toNodeStatusResponse(node: NodeStatusSnapshot): NodeStatusResponse {
  return {
    name: node.name,
    connected: node.connected,
    sessionId: node.sessionId,
    players: node.players,
    playingPlayers: node.playingPlayers,
    cpuLoad: node.cpuLoad,
    memoryUsedBytes: node.memoryUsedBytes?.toString() ?? null,
    frameDeficit: node.frameDeficit,
    frameNulled: node.frameNulled,
    pingMs: node.pingMs,
    lastError: node.lastError
  };
}

function assertBearer(header: string | undefined, expectedToken: string): void {
  const expected = `Bearer ${expectedToken}`;
  if (header !== expected) {
    throw new AppError("PERMISSION_DENIED", "Invalid API token.", { expose: false });
  }
}

function compactSettingsPatch(input: z.infer<typeof settingsPatchBody>): GuildSettingsPatch {
  const output: GuildSettingsPatch = {};
  if (input.locale !== undefined) output.locale = input.locale;
  if (input.djModeEnabled !== undefined) output.djModeEnabled = input.djModeEnabled;
  if (input.djRoleIds !== undefined) output.djRoleIds = input.djRoleIds;
  if (input.allowedRoleIds !== undefined) output.allowedRoleIds = input.allowedRoleIds;
  if (input.blockedRoleIds !== undefined) output.blockedRoleIds = input.blockedRoleIds;
  if (input.allowedTextChannelIds !== undefined)
    output.allowedTextChannelIds = input.allowedTextChannelIds;
  if (input.allowedVoiceChannelIds !== undefined)
    output.allowedVoiceChannelIds = input.allowedVoiceChannelIds;
  if (input.defaultVolume !== undefined) output.defaultVolume = input.defaultVolume;
  if (input.maxQueueSize !== undefined) output.maxQueueSize = input.maxQueueSize;
  if (input.announceNowPlaying !== undefined) output.announceNowPlaying = input.announceNowPlaying;
  if (input.autoplayEnabled !== undefined) output.autoplayEnabled = input.autoplayEnabled;
  if (input.premiumOnlyEffects !== undefined) output.premiumOnlyEffects = input.premiumOnlyEffects;
  return output;
}

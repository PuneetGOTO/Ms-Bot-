import "dotenv/config";
import { z } from "zod";

import { AppError } from "../../domain/errors/AppError";

const lavalinkNodeSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  auth: z.string().min(1),
  secure: z.boolean().default(false),
  group: z.string().min(1).optional()
});

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().optional().default(""),
  DISCORD_DEFAULT_LOCALE: z.string().default("zh-TW"),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_PUBLIC_BASE_URL: z.url().default("http://localhost:3000"),
  API_TOKEN: z.string().min(16),
  METRICS_TOKEN: z.string().min(16),
  LAVALINK_NODES: z.preprocess((value) => parseJson(value), z.array(lavalinkNodeSchema).min(1)),
  LAVALINK_RESUME_TIMEOUT_SECONDS: z.coerce.number().int().min(10).default(120),
  LAVALINK_RECONNECT_TRIES: z.coerce.number().int().min(1).default(10),
  LAVALINK_RECONNECT_INTERVAL_SECONDS: z.coerce.number().int().min(1).default(10),
  MUSIC_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().min(30).default(300),
  MUSIC_MAX_QUEUE_SIZE: z.coerce.number().int().min(1).max(5000).default(1000),
  MUSIC_DEFAULT_VOLUME: z.coerce.number().int().min(0).max(150).default(80),
  MUSIC_MAX_VOLUME: z.coerce.number().int().min(1).max(1000).default(150),
  CACHE_TRACK_TTL_SECONDS: z.coerce.number().int().min(60).default(86400),
  CACHE_SEARCH_TTL_SECONDS: z.coerce.number().int().min(10).default(900),
  CACHE_LYRICS_TTL_SECONDS: z.coerce.number().int().min(60).default(604800),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  SHARDING_STRATEGY: z.enum(["single", "discord-managed", "worker"]).default("single"),
  CLUSTER_WORKER_COUNT: z.coerce.number().int().min(1).default(1),
  PROMETHEUS_DEFAULT_METRICS: z.coerce.boolean().default(true)
});

export type AppConfig = z.infer<typeof envSchema>;
export type LavalinkNodeConfig = z.infer<typeof lavalinkNodeSchema>;

/** Parses and validates process environment once at boot. */
export function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new AppError("CONFIG_INVALID", "Environment configuration is invalid.", {
      details: z.flattenError(parsed.error),
      expose: false
    });
  }
  return parsed.data;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new AppError("CONFIG_INVALID", "Invalid JSON environment variable.", {
      cause: error,
      expose: false
    });
  }
}

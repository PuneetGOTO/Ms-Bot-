import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

import type { Logger } from "../../application/ports/Logger";

export interface PrismaHandle {
  readonly prisma: PrismaClient;
  disconnect(): Promise<void>;
}

/**
 * Creates a Prisma v7 client with the PostgreSQL driver adapter and connection pool.
 */
export function createPrismaHandle(databaseUrl: string, logger: Logger): PrismaHandle {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({
    adapter,
    log: [
      { emit: "event", level: "error" },
      { emit: "event", level: "warn" }
    ]
  });

  prisma.$on("error", (event) => {
    logger.error({ target: event.target, message: event.message }, "Prisma error.");
  });
  prisma.$on("warn", (event) => {
    logger.warn({ target: event.target, message: event.message }, "Prisma warning.");
  });

  return {
    prisma,
    disconnect: async () => {
      await prisma.$disconnect();
      await pool.end();
    }
  };
}

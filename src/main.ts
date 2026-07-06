import { createApplication } from "./bootstrap/createApplication";
import { toError } from "./domain/errors/AppError";
import { PinoLogger } from "./infrastructure/logger/PinoLogger";

const fallbackLogger = PinoLogger.create(process.env.LOG_LEVEL ?? "info");
const app = await createApplication();

let shuttingDown = false;

process.on("unhandledRejection", (reason) => {
  fallbackLogger.error({ error: toError(reason) }, "Unhandled promise rejection.");
});

process.on("uncaughtException", (error) => {
  fallbackLogger.error({ error }, "Uncaught exception.");
  void shutdown(1);
});

process.on("SIGINT", () => {
  void shutdown(0);
});

process.on("SIGTERM", () => {
  void shutdown(0);
});

await app.start();

async function shutdown(exitCode: number): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  try {
    await app.stop();
  } finally {
    process.exitCode = exitCode;
  }
}

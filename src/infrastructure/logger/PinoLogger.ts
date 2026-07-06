import pino, { type Logger as PinoBaseLogger } from "pino";

import type { LogContext, Logger } from "../../application/ports/Logger";

/**
 * Pino adapter that keeps application code independent from the concrete logger.
 */
export class PinoLogger implements Logger {
  public constructor(private readonly logger: PinoBaseLogger) {}

  public static create(level: string, serviceName = "discord-music-bot"): PinoLogger {
    return new PinoLogger(
      pino({
        level,
        name: serviceName,
        base: {
          pid: process.pid,
          service: serviceName
        },
        timestamp: pino.stdTimeFunctions.isoTime,
        serializers: {
          error: pino.stdSerializers.err,
          err: pino.stdSerializers.err
        }
      })
    );
  }

  public child(context: LogContext): Logger {
    return new PinoLogger(this.logger.child(context));
  }

  public debug(context: LogContext, message: string): void {
    this.logger.debug(context, message);
  }

  public info(context: LogContext, message: string): void {
    this.logger.info(context, message);
  }

  public warn(context: LogContext, message: string): void {
    this.logger.warn(context, message);
  }

  public error(context: LogContext, message: string): void {
    this.logger.error(context, message);
  }
}

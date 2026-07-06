export interface LogContext {
  readonly traceId?: string;
  readonly guildId?: string;
  readonly userId?: string;
  readonly shardId?: number;
  readonly [key: string]: unknown;
}

export interface Logger {
  child(context: LogContext): Logger;
  debug(context: LogContext, message: string): void;
  info(context: LogContext, message: string): void;
  warn(context: LogContext, message: string): void;
  error(context: LogContext, message: string): void;
}

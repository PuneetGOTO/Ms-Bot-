/**
 * Stable application error codes used by Discord commands, REST responses, and logs.
 */
export type AppErrorCode =
  | "CONFIG_INVALID"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "RATE_LIMITED"
  | "MUSIC_EMPTY_QUEUE"
  | "MUSIC_NOT_CONNECTED"
  | "MUSIC_RESOLVE_FAILED"
  | "MUSIC_GATEWAY_FAILED"
  | "INFRASTRUCTURE_FAILED";

/**
 * Error type that keeps operational errors structured without leaking internals to users.
 */
export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly details: Readonly<Record<string, unknown>>;
  public readonly expose;

  public constructor(
    code: AppErrorCode,
    message: string,
    options: { details?: Readonly<Record<string, unknown>>; cause?: unknown; expose?: boolean } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.details = options.details ?? {};
    this.expose = options.expose ?? true;
  }
}

/**
 * Converts unknown thrown values to Error without losing the original signal in logs.
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  return new Error("Unknown error", { cause: error });
}

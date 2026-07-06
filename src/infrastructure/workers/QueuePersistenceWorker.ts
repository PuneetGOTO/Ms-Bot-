import type { EventBus, EventSubscription } from "../../application/ports/EventBus";
import type { Logger } from "../../application/ports/Logger";
import type { QueueSnapshotRepository } from "../../application/ports/Repositories";
import { toError } from "../../domain/errors/AppError";
import type { QueueSnapshot } from "../../domain/music/types";

/**
 * Debounced queue persistence worker that protects snapshots during command bursts.
 */
export class QueuePersistenceWorker {
  private readonly buffer = new Map<string, QueueSnapshot>();
  private readonly subscription: EventSubscription;
  private timer: NodeJS.Timeout | null = null;

  public constructor(
    eventBus: EventBus,
    private readonly repository: QueueSnapshotRepository,
    private readonly logger: Logger,
    private readonly intervalMs = 5_000
  ) {
    this.subscription = eventBus.subscribe("music.queue.changed", (payload) => {
      this.buffer.set(payload.guildId, payload.snapshot);
    });
  }

  public start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.flush();
    }, this.intervalMs);
    this.timer.unref();
  }

  public async stop(): Promise<void> {
    this.subscription.unsubscribe();
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  private async flush(): Promise<void> {
    const snapshots = [...this.buffer.values()];
    this.buffer.clear();
    for (const snapshot of snapshots) {
      try {
        await this.repository.save(snapshot);
      } catch (error) {
        this.logger.error(
          { guildId: snapshot.guildId, error: toError(error) },
          "Queue snapshot flush failed."
        );
      }
    }
  }
}

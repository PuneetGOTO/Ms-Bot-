import type { EventBus } from "../../application/ports/EventBus";
import type { Logger } from "../../application/ports/Logger";
import type { MusicGateway } from "../../application/ports/MusicGateway";
import type { NodeStatusRepository } from "../../application/ports/Repositories";
import { toError } from "../../domain/errors/AppError";

/**
 * Periodically snapshots Lavalink node status into metrics and database.
 */
export class NodeHealthWorker {
  private timer: NodeJS.Timeout | null = null;

  public constructor(
    private readonly gateway: MusicGateway,
    private readonly repository: NodeStatusRepository,
    private readonly eventBus: EventBus,
    private readonly logger: Logger,
    private readonly intervalMs = 15_000
  ) {}

  public start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
    this.timer.unref();
    void this.tick();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    try {
      const nodes = await this.gateway.getNodeStatuses();
      await this.repository.saveMany(nodes);
      await this.eventBus.publish("music.node.status", { nodes });
    } catch (error) {
      this.logger.warn({ error: toError(error) }, "Node health worker failed.");
    }
  }
}

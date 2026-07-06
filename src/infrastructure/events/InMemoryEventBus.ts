import type { AppEventName, AppEvents } from "../../application/events/AppEvents";
import type { EventBus, EventHandler, EventSubscription } from "../../application/ports/EventBus";
import { toError } from "../../domain/errors/AppError";
import type { Logger } from "../../application/ports/Logger";

type UntypedHandler = (payload: unknown) => Promise<void>;

/**
 * Process-local typed event bus. External brokers can replace this through the EventBus port.
 */
export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<AppEventName, Set<UntypedHandler>>();

  public constructor(private readonly logger: Logger) {}

  public async publish<TEventName extends AppEventName>(
    eventName: TEventName,
    payload: AppEvents[TEventName]
  ): Promise<void> {
    const handlers = this.handlers.get(eventName);
    if (!handlers) {
      return;
    }

    await Promise.all(
      [...handlers].map(async (handler) => {
        try {
          await handler(payload);
        } catch (error) {
          this.logger.error({ eventName, error: toError(error) }, "Event handler failed.");
        }
      })
    );
  }

  public subscribe<TEventName extends AppEventName>(
    eventName: TEventName,
    handler: EventHandler<AppEvents[TEventName]>
  ): EventSubscription {
    const wrapped: UntypedHandler = async (payload: unknown) => {
      await handler(payload as AppEvents[TEventName]);
    };

    const handlers = this.handlers.get(eventName) ?? new Set<UntypedHandler>();
    handlers.add(wrapped);
    this.handlers.set(eventName, handlers);

    return {
      unsubscribe: () => {
        handlers.delete(wrapped);
        if (handlers.size === 0) {
          this.handlers.delete(eventName);
        }
      }
    };
  }
}

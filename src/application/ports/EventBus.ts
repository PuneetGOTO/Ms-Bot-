import type { AppEventName, AppEvents } from "../events/AppEvents";

export type EventHandler<TPayload> = (payload: TPayload) => void | Promise<void>;

export interface EventSubscription {
  unsubscribe(): void;
}

export interface EventBus {
  publish<TEventName extends AppEventName>(
    eventName: TEventName,
    payload: AppEvents[TEventName]
  ): Promise<void>;

  subscribe<TEventName extends AppEventName>(
    eventName: TEventName,
    handler: EventHandler<AppEvents[TEventName]>
  ): EventSubscription;
}

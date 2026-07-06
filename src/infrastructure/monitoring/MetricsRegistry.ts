import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";

import type { EventBus, EventSubscription } from "../../application/ports/EventBus";

/**
 * Prometheus metrics registry wired to application events.
 */
export class MetricsRegistry {
  private readonly registry = new Registry();
  private readonly subscriptions: EventSubscription[];
  private readonly trackStartCounter: Counter;
  private readonly trackExceptionCounter: Counter;
  private readonly queueSizeGauge: Gauge;
  private readonly playerPositionGauge: Gauge;
  private readonly playerPingGauge: Gauge;
  private readonly nodePlayersGauge: Gauge;
  private readonly nodeCpuGauge: Gauge;
  private readonly commandLatency: Histogram;

  public constructor(eventBus: EventBus, collectDefaults: boolean) {
    if (collectDefaults) {
      collectDefaultMetrics({ register: this.registry, prefix: "musicbot_" });
    }

    this.trackStartCounter = new Counter({
      name: "musicbot_tracks_started_total",
      help: "Total tracks started.",
      labelNames: ["guild_id", "source"],
      registers: [this.registry]
    });
    this.trackExceptionCounter = new Counter({
      name: "musicbot_track_exceptions_total",
      help: "Total track exceptions.",
      labelNames: ["guild_id"],
      registers: [this.registry]
    });
    this.queueSizeGauge = new Gauge({
      name: "musicbot_queue_size",
      help: "Current queue size by guild.",
      labelNames: ["guild_id"],
      registers: [this.registry]
    });
    this.playerPositionGauge = new Gauge({
      name: "musicbot_player_position_ms",
      help: "Current player position in milliseconds.",
      labelNames: ["guild_id"],
      registers: [this.registry]
    });
    this.playerPingGauge = new Gauge({
      name: "musicbot_player_ping_ms",
      help: "Current player ping in milliseconds.",
      labelNames: ["guild_id"],
      registers: [this.registry]
    });
    this.nodePlayersGauge = new Gauge({
      name: "musicbot_lavalink_node_players",
      help: "Lavalink players per node.",
      labelNames: ["node", "state"],
      registers: [this.registry]
    });
    this.nodeCpuGauge = new Gauge({
      name: "musicbot_lavalink_node_cpu_load",
      help: "Lavalink CPU load per node.",
      labelNames: ["node"],
      registers: [this.registry]
    });
    this.commandLatency = new Histogram({
      name: "musicbot_command_latency_ms",
      help: "Discord command latency in milliseconds.",
      labelNames: ["command"],
      buckets: [25, 50, 100, 250, 500, 1000, 2500, 5000],
      registers: [this.registry]
    });

    this.subscriptions = [
      eventBus.subscribe("music.track.started", (payload) => {
        this.trackStartCounter.inc({ guild_id: payload.guildId, source: payload.track.source });
      }),
      eventBus.subscribe("music.track.exception", (payload) => {
        this.trackExceptionCounter.inc({ guild_id: payload.guildId });
      }),
      eventBus.subscribe("music.queue.changed", (payload) => {
        const size = payload.snapshot.tracks.length + (payload.snapshot.current ? 1 : 0);
        this.queueSizeGauge.set({ guild_id: payload.guildId }, size);
      }),
      eventBus.subscribe("music.player.updated", (payload) => {
        this.playerPositionGauge.set({ guild_id: payload.guildId }, payload.positionMs);
        this.playerPingGauge.set({ guild_id: payload.guildId }, payload.pingMs);
      }),
      eventBus.subscribe("music.node.status", (payload) => {
        for (const node of payload.nodes) {
          this.nodePlayersGauge.set({ node: node.name, state: "total" }, node.players);
          this.nodePlayersGauge.set({ node: node.name, state: "playing" }, node.playingPlayers);
          if (node.cpuLoad !== null) {
            this.nodeCpuGauge.set({ node: node.name }, node.cpuLoad);
          }
        }
      })
    ];
  }

  public observeCommand(commandName: string, latencyMs: number): void {
    this.commandLatency.observe({ command: commandName }, latencyMs);
  }

  public async metrics(): Promise<string> {
    return this.registry.metrics();
  }

  public contentType(): string {
    return this.registry.contentType;
  }

  public dispose(): void {
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
  }
}

/**
 * JARVIS Elite Agentic Harness — Pillar 11: Event Runtime.
 *
 * Declarative triggers that turn the harness from a request-response system
 * into an event-driven one. A trigger maps a stimulus (interval, cron-ish
 * schedule, internal event, external webhook, or manual fire) to an action
 * (invoke a capability, start a mission, or run a callback).
 *
 * Also provides a periodic heartbeat — a liveness pulse the rest of the
 * system (and external monitors) can subscribe to.
 *
 * Design principles (NOOA):
 *  - Programmable loops: triggers are the outer loop that kicks off inner
 *    agent loops without a human in the loop.
 *  - Explicit object state: triggers are first-class persisted objects, not
 *    hidden setInterval handles.
 *  - Typed I/O: each trigger declares its action kind; dispatch is validated.
 */
import { v4 as uuidv4 } from 'uuid';
import { Trigger, TriggerAction, TriggerKind } from './types.js';
import { CapabilityRouter } from './capabilityRouter.js';
import { Orchestrator } from './orchestrator.js';
import { eventBus, EventType, Event } from '../observability/eventBus.js';

export interface EventRuntimeOptions {
  capabilityRouter?: CapabilityRouter;
  orchestrator?: Orchestrator;
  /** Override the internal event bus (defaults to the shared singleton). */
  bus?: typeof eventBus;
  /** Default heartbeat interval, ms. 0 disables auto-heartbeat. */
  heartbeatIntervalMs?: number;
}

export interface RegisterTriggerInput {
  name: string;
  kind: TriggerKind;
  enabled?: boolean;
  intervalMs?: number;
  /** Simplified cron: '* * * * *' (min hour dom month dow). '*' = any. */
  cronExpression?: string;
  /** For 'event' triggers: the EventType name to listen for. */
  eventType?: string;
  action: TriggerAction;
}

export interface WebhookRegistration {
  triggerId: string;
  token: string;
}

export class EventRuntime {
  private triggers = new Map<string, Trigger>();
  private timers = new Map<string, NodeJS.Timeout>();
  private unsubscribers = new Map<string, () => void>();
  private webhookTokens = new Map<string, string>();
  private router?: CapabilityRouter;
  private orchestrator?: Orchestrator;
  private bus: typeof eventBus;
  private heartbeatTimer?: NodeJS.Timeout;
  private heartbeatIntervalMs: number;
  private heartbeatCount = 0;

  constructor(opts: EventRuntimeOptions = {}) {
    this.router = opts.capabilityRouter;
    this.orchestrator = opts.orchestrator;
    this.bus = opts.bus ?? eventBus;
    this.heartbeatIntervalMs = opts.heartbeatIntervalMs ?? 0;
  }

  // -------------------------------------------------------------------------
  // Registration + lifecycle
  // -------------------------------------------------------------------------

  register(input: RegisterTriggerInput): Trigger {
    const id = uuidv4();
    const trigger: Trigger = {
      id,
      name: input.name,
      kind: input.kind,
      enabled: input.enabled ?? true,
      intervalMs: input.intervalMs,
      cronExpression: input.cronExpression,
      eventType: input.eventType,
      action: input.action,
      fireCount: 0,
      createdAt: new Date(),
    };
    this.triggers.set(id, trigger);
    if (trigger.enabled) this.activate(trigger);
    return trigger;
  }

  /** Register a webhook trigger and return a verification token. */
  registerWebhook(name: string, action: TriggerAction): WebhookRegistration {
    const trigger = this.register({ name, kind: 'webhook', enabled: true, action });
    const token = uuidv4();
    this.webhookTokens.set(trigger.id, token);
    return { triggerId: trigger.id, token };
  }

  enable(id: string): void {
    const t = this.triggers.get(id);
    if (!t) throw new Error(`EventRuntime.enable: unknown trigger ${id}`);
    t.enabled = true;
    this.activate(t);
  }

  disable(id: string): void {
    const t = this.triggers.get(id);
    if (!t) throw new Error(`EventRuntime.disable: unknown trigger ${id}`);
    t.enabled = false;
    this.deactivate(t);
  }

  remove(id: string): void {
    const t = this.triggers.get(id);
    if (!t) return;
    this.deactivate(t);
    this.triggers.delete(id);
    this.webhookTokens.delete(id);
  }

  get(id: string): Trigger | undefined {
    return this.triggers.get(id);
  }

  list(): Trigger[] {
    return Array.from(this.triggers.values());
  }

  // -------------------------------------------------------------------------
  // Start / stop all
  // -------------------------------------------------------------------------

  start(): void {
    for (const t of this.triggers.values()) {
      if (t.enabled) this.activate(t);
    }
    if (this.heartbeatIntervalMs > 0) this.startHeartbeat(this.heartbeatIntervalMs);
  }

  stop(): void {
    for (const t of this.triggers.values()) {
      this.deactivate(t);
    }
    this.stopHeartbeat();
  }

  // -------------------------------------------------------------------------
  // Manual fire
  // -------------------------------------------------------------------------

  async fire(id: string, payload?: any): Promise<void> {
    const t = this.triggers.get(id);
    if (!t) throw new Error(`EventRuntime.fire: unknown trigger ${id}`);
    await this.executeAction(t, payload);
  }

  /** Process an incoming webhook. */
  async handleWebhook(triggerId: string, token: string, payload: any): Promise<void> {
    const expected = this.webhookTokens.get(triggerId);
    if (!expected || expected !== token) {
      throw new Error('EventRuntime.handleWebhook: invalid token');
    }
    const t = this.triggers.get(triggerId);
    if (!t || !t.enabled) {
      throw new Error(`EventRuntime.handleWebhook: trigger ${triggerId} not found or disabled`);
    }
    await this.executeAction(t, payload);
  }

  // -------------------------------------------------------------------------
  // Heartbeat
  // -------------------------------------------------------------------------

  startHeartbeat(intervalMs: number, handler?: () => void): void {
    this.stopHeartbeat();
    this.heartbeatIntervalMs = intervalMs;
    this.heartbeatTimer = setInterval(() => {
      this.heartbeatCount++;
      this.bus.publish({
        id: uuidv4(),
        type: EventType.TASK_COMPLETED, // reuse a generic event type for heartbeat
        payload: { kind: 'heartbeat', count: this.heartbeatCount, at: new Date() },
        timestamp: new Date(),
        source: 'EventRuntime.heartbeat',
      }).catch(() => {});
      handler?.();
    }, intervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  getHeartbeatCount(): number {
    return this.heartbeatCount;
  }

  // -------------------------------------------------------------------------
  // Internals — activation / deactivation / dispatch
  // -------------------------------------------------------------------------

  private activate(t: Trigger): void {
    this.deactivate(t); // clean up any prior activation
    switch (t.kind) {
      case 'interval': {
        if (!t.intervalMs || t.intervalMs <= 0) break;
        const timer = setInterval(() => {
          this.executeAction(t).catch(err =>
            console.error(`[EventRuntime] trigger ${t.id} (${t.name}) failed:`, err)
          );
        }, t.intervalMs);
        this.timers.set(t.id, timer);
        break;
      }
      case 'cron-ish': {
        if (!t.cronExpression) break;
        const delay = nextCronDelay(t.cronExpression);
        if (delay < 0) break;
        this.scheduleCron(t, delay);
        break;
      }
      case 'event': {
        if (!t.eventType) break;
        const handler = (event: Event) => {
          this.executeAction(t, event.payload).catch(err =>
            console.error(`[EventRuntime] event trigger ${t.id} failed:`, err)
          );
        };
        const sub = this.bus.subscribe(t.eventType as EventType, handler);
        this.unsubscribers.set(t.id, () => this.bus.unsubscribe(sub.id));
        break;
      }
      case 'webhook':
      case 'manual':
        // No background activation needed — fired on demand.
        break;
    }
  }

  private deactivate(t: Trigger): void {
    const timer = this.timers.get(t.id);
    if (timer) { clearInterval(timer); this.timers.delete(t.id); }
    const unsub = this.unsubscribers.get(t.id);
    if (unsub) { unsub(); this.unsubscribers.delete(t.id); }
  }

  private scheduleCron(t: Trigger, delay: number): void {
    const timer = setTimeout(() => {
      this.executeAction(t).catch(err =>
        console.error(`[EventRuntime] cron trigger ${t.id} failed:`, err)
      );
      // Reschedule for the next match.
      if (t.enabled) {
        const next = nextCronDelay(t.cronExpression!);
        if (next >= 0) this.scheduleCron(t, next);
      }
    }, delay);
    this.timers.set(t.id, timer as unknown as NodeJS.Timeout);
  }

  private async executeAction(t: Trigger, payload?: any): Promise<void> {
    t.lastFiredAt = new Date();
    t.fireCount++;
    const action = t.action;
    switch (action.kind) {
      case 'capability': {
        if (!this.router) throw new Error(`trigger ${t.id}: capabilityRouter not configured`);
        if (!action.capabilityId) throw new Error(`trigger ${t.id}: capabilityId missing`);
        await this.router.invoke(action.capabilityId, { ...(action.input ?? {}), triggerPayload: payload }, {
          userId: 'system',
          traceId: uuidv4(),
        });
        return;
      }
      case 'mission': {
        if (!this.orchestrator) throw new Error(`trigger ${t.id}: orchestrator not configured`);
        if (!action.objective) throw new Error(`trigger ${t.id}: objective missing`);
        await this.orchestrator.run({
          objective: action.objective,
          userId: 'system',
          context: { triggerId: t.id, triggerPayload: payload },
        });
        return;
      }
      case 'callback': {
        if (!action.callback) throw new Error(`trigger ${t.id}: callback missing`);
        await action.callback(t);
        return;
      }
    }
  }
}

// -------------------------------------------------------------------------
// Cron-ish scheduling
// -------------------------------------------------------------------------

/**
 * Returns the delay (ms) until the next time the cron expression fires.
 * Supports a subset of standard cron: "min hour dom month dow".
 * '*' matches any. Numeric values match exactly. No ranges or steps.
 * Returns -1 if the expression is invalid.
 */
export function nextCronDelay(expr: string, from: Date = new Date()): number {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return -1;
  const [minStr, hourStr, domStr, monStr, dowStr] = parts;
  const match = (val: number, str: string): boolean => str === '*' || parseInt(str, 10) === val;
  // Search minute-by-minute for the next match, up to 7 days ahead.
  const start = new Date(from);
  start.setSeconds(0, 0);
  // Start from the next minute — cron fires at the start of a matching
  // minute, and the current minute has already begun.
  for (let i = 1; i <= 7 * 24 * 60; i++) {
    const candidate = new Date(start.getTime() + i * 60 * 1000);
    if (
      match(candidate.getMinutes(), minStr) &&
      match(candidate.getHours(), hourStr) &&
      match(candidate.getDate(), domStr) &&
      match(candidate.getMonth() + 1, monStr) &&
      match(candidate.getDay(), dowStr)
    ) {
      return candidate.getTime() - from.getTime();
    }
  }
  return -1; // no match within a week
}

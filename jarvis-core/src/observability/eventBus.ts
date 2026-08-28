import { v4 as uuidv4 } from 'uuid';

export enum EventType {
  // Task events
  TASK_STARTED = 'TASK_STARTED',
  TASK_COMPLETED = 'TASK_COMPLETED',
  TASK_FAILED = 'TASK_FAILED',
  TASK_RETRYING = 'TASK_RETRYING',

  // Approval events
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
  APPROVAL_GRANTED = 'APPROVAL_GRANTED',
  APPROVAL_DENIED = 'APPROVAL_DENIED',

  // Mission events
  MISSION_CREATED = 'MISSION_CREATED',
  MISSION_STARTED = 'MISSION_STARTED',
  MISSION_COMPLETED = 'MISSION_COMPLETED',
  MISSION_FAILED = 'MISSION_FAILED',
  MISSION_PAUSED = 'MISSION_PAUSED',
  MISSION_RESUMED = 'MISSION_RESUMED',

  // Artifact events
  ARTIFACT_CREATED = 'ARTIFACT_CREATED',
  ARTIFACT_UPDATED = 'ARTIFACT_UPDATED',
  ARTIFACT_DELETED = 'ARTIFACT_DELETED',

  // Coworker events
  COWORKER_ASSIGNED = 'COWORKER_ASSIGNED',
  COWORKER_STATUS_CHANGED = 'COWORKER_STATUS_CHANGED',
  COWORKER_PERFORMANCE_UPDATED = 'COWORKER_PERFORMANCE_UPDATED',
}

export interface Event {
  id: string;
  type: EventType;
  payload: any;
  timestamp: Date;
  source: string;
  correlationId?: string;
  metadata?: Record<string, any>;
}

export interface EventFilter {
  eventType?: EventType;
  source?: string;
  correlationId?: string;
  startTime?: Date;
  endTime?: Date;
  payloadFilter?: Record<string, any>;
}

export interface Subscription {
  id: string;
  eventType: EventType;
  handler: EventHandler;
  filter?: EventFilter;
  createdAt: Date;
  /** Internal listener wrapper registered against the event type. */
  listener: (event: Event) => void;
}

export type EventHandler = (event: Event) => Promise<void> | void;

type Listener = (event: Event) => void;

/**
 * Browser-safe event bus. Unlike the earlier implementation this does NOT
 * depend on Node's `events` EventEmitter — it uses an internal listener map,
 * so it can be bundled by Vite into the desktop app as well as run in Node.
 */
export class EventBus {
  private eventHistory: Map<string, Event> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private listeners: Map<string, Set<Listener>> = new Map();
  private maxHistorySize: number = 10000;
  private historyRetentionMs: number = 30 * 24 * 60 * 60 * 1000; // 30 days

  setMaxListeners(_limit: number): void {
    // No-op: our listener map has no hard limit. Kept for API parity.
  }

  async publish(event: Event): Promise<void> {
    // Ensure event has required fields
    if (!event.id) {
      event.id = uuidv4();
    }
    if (!event.timestamp) {
      event.timestamp = new Date();
    }

    // Store in history
    this.storeEvent(event);

    // Emit to subscribers (copy the set to tolerate mutation during dispatch)
    this.dispatch(event.type, event);
    this.dispatch('*', event); // Wildcard for all events

    // Clean old events periodically
    if (this.eventHistory.size > this.maxHistorySize) {
      this.cleanOldEvents();
    }
  }

  subscribe(eventType: EventType, handler: EventHandler, filter?: EventFilter): Subscription {
    const subscription: Subscription = {
      id: uuidv4(),
      eventType,
      handler,
      filter,
      createdAt: new Date(),
      listener: (event: Event) => {
        if (this.matchesFilter(event, filter)) {
          // Fire-and-forget so a throwing handler never breaks the bus.
          Promise.resolve(handler(event)).catch(err => {
            console.error('[eventBus] handler error:', err);
          });
        }
      },
    };

    this.subscriptions.set(subscription.id, subscription);

    let set = this.listeners.get(eventType);
    if (!set) {
      set = new Set();
      this.listeners.set(eventType, set);
    }
    set.add(subscription.listener);

    return subscription;
  }

  unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      const set = this.listeners.get(subscription.eventType);
      set?.delete(subscription.listener);
      this.subscriptions.delete(subscriptionId);
    }
  }

  getEventHistory(filter?: EventFilter): Event[] {
    let events = Array.from(this.eventHistory.values());

    if (filter) {
      events = this.filterEvents(events, filter);
    }

    // Sort by timestamp descending
    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async replayEvents(from: Date, to: Date): Promise<void> {
    const events = this.getEventHistory({
      startTime: from,
      endTime: to,
    });

    for (const event of events) {
      await this.publish(event);
    }
  }

  private dispatch(type: string, event: Event): void {
    const set = this.listeners.get(type);
    if (!set || set.size === 0) return;
    for (const listener of Array.from(set)) {
      listener(event);
    }
  }

  private storeEvent(event: Event): void {
    this.eventHistory.set(event.id, event);
  }

  private matchesFilter(event: Event, filter?: EventFilter): boolean {
    if (!filter) return true;

    if (filter.eventType && event.type !== filter.eventType) return false;
    if (filter.source && event.source !== filter.source) return false;
    if (filter.correlationId && event.correlationId !== filter.correlationId) return false;
    if (filter.startTime && event.timestamp < filter.startTime) return false;
    if (filter.endTime && event.timestamp > filter.endTime) return false;

    if (filter.payloadFilter) {
      for (const [key, value] of Object.entries(filter.payloadFilter)) {
        if (event.payload[key] !== value) return false;
      }
    }

    return true;
  }

  private filterEvents(events: Event[], filter: EventFilter): Event[] {
    return events.filter(event => this.matchesFilter(event, filter));
  }

  private cleanOldEvents(): void {
    const cutoff = new Date(Date.now() - this.historyRetentionMs);

    for (const [id, event] of this.eventHistory.entries()) {
      if (event.timestamp < cutoff) {
        this.eventHistory.delete(id);
      }
    }

    // If still over limit, remove oldest
    if (this.eventHistory.size > this.maxHistorySize) {
      const sorted = Array.from(this.eventHistory.entries())
        .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime());

      const toRemove = sorted.slice(0, sorted.length - this.maxHistorySize);
      for (const [id] of toRemove) {
        this.eventHistory.delete(id);
      }
    }
  }

  getStats() {
    return {
      totalEvents: this.eventHistory.size,
      activeSubscriptions: this.subscriptions.size,
      maxHistorySize: this.maxHistorySize,
      historyRetentionDays: this.historyRetentionMs / (24 * 60 * 60 * 1000),
    };
  }

  exportState(): Record<string, any> {
    return {
      eventHistory: Array.from(this.eventHistory.entries()),
    };
  }

  importState(state: Record<string, any>): void {
    this.eventHistory = new Map(state.eventHistory || []);
  }
}

// Singleton instance
export const eventBus = new EventBus();

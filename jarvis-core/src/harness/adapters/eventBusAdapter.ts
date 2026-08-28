/**
 * Adapter — bridges the existing observability/eventBus into the harness
 * EventRuntime. The EventRuntime adds declarative triggers (interval, cron,
 * event, webhook, manual) on top of the existing pub/sub event bus.
 *
 * This adapter re-exports the EventRuntime and provides convenience
 * functions to wire the existing eventBus into it.
 */
export { EventRuntime } from '../eventRuntime.js';
export type { EventRuntimeOptions, RegisterTriggerInput, WebhookRegistration } from '../eventRuntime.js';
export { nextCronDelay } from '../eventRuntime.js';

import { EventRuntime } from '../eventRuntime.js';
import { eventBus } from '../../observability/eventBus.js';

/**
 * Create an EventRuntime wired to the existing eventBus singleton and
 * optional capability router / orchestrator.
 */
export function createWiredEventRuntime(
  options?: { capabilityRouter?: any; orchestrator?: any; heartbeatIntervalMs?: number }
): EventRuntime {
  return new EventRuntime({
    bus: eventBus,
    capabilityRouter: options?.capabilityRouter,
    orchestrator: options?.orchestrator,
    heartbeatIntervalMs: options?.heartbeatIntervalMs,
  });
}

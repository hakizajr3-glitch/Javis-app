import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventRuntime, nextCronDelay } from './eventRuntime.js';
import { CapabilityRouter } from './capabilityRouter.js';
import { EventType } from '../observability/eventBus.js';

describe('nextCronDelay', () => {
  it('returns a positive delay for a valid expression', () => {
    const now = new Date('2024-01-15T10:30:00Z');
    const delay = nextCronDelay('* * * * *', now);
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(60000);
  });

  it('returns -1 for an invalid expression', () => {
    expect(nextCronDelay('bad', new Date())).toBe(-1);
    expect(nextCronDelay('* * *', new Date())).toBe(-1);
  });

  it('matches a specific minute', () => {
    const now = new Date('2024-01-15T10:30:00Z');
    // Next 0th minute (i.e. 11:00) — about 30 min away.
    const delay = nextCronDelay('0 * * * *', now);
    expect(delay).toBeGreaterThan(25 * 60 * 1000);
    expect(delay).toBeLessThan(35 * 60 * 1000);
  });
});

describe('EventRuntime — registration + lifecycle', () => {
  let er: EventRuntime;

  beforeEach(() => {
    er = new EventRuntime();
  });

  afterEach(() => {
    er.stop();
  });

  it('registers and lists triggers', () => {
    const t = er.register({ name: 'test', kind: 'manual', action: { kind: 'callback', callback: () => {} } });
    expect(t.id).toBeTruthy();
    expect(t.enabled).toBe(true);
    expect(er.list()).toHaveLength(1);
  });

  it('get returns the trigger by id', () => {
    const t = er.register({ name: 'test', kind: 'manual', action: { kind: 'callback', callback: () => {} } });
    expect(er.get(t.id)?.name).toBe('test');
    expect(er.get('nope')).toBeUndefined();
  });

  it('enable / disable toggles the trigger', () => {
    const t = er.register({ name: 'test', kind: 'manual', enabled: false, action: { kind: 'callback', callback: () => {} } });
    expect(er.get(t.id)?.enabled).toBe(false);
    er.enable(t.id);
    expect(er.get(t.id)?.enabled).toBe(true);
    er.disable(t.id);
    expect(er.get(t.id)?.enabled).toBe(false);
  });

  it('remove deletes the trigger', () => {
    const t = er.register({ name: 'test', kind: 'manual', action: { kind: 'callback', callback: () => {} } });
    er.remove(t.id);
    expect(er.get(t.id)).toBeUndefined();
    expect(er.list()).toHaveLength(0);
  });

  it('throws when enabling an unknown trigger', () => {
    expect(() => er.enable('nope')).toThrow();
  });
});

describe('EventRuntime — manual fire + callbacks', () => {
  let er: EventRuntime;

  beforeEach(() => {
    er = new EventRuntime();
  });

  afterEach(() => {
    er.stop();
  });

  it('fires a callback action', async () => {
    const spy = vi.fn();
    const t = er.register({ name: 'cb', kind: 'manual', action: { kind: 'callback', callback: spy } });
    await er.fire(t.id);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(er.get(t.id)?.fireCount).toBe(1);
    expect(er.get(t.id)?.lastFiredAt).toBeInstanceOf(Date);
  });

  it('fire throws for an unknown trigger', async () => {
    await expect(er.fire('nope')).rejects.toThrow();
  });

  it('fires a capability action through the router', async () => {
    const router = new CapabilityRouter();
    const spy = vi.fn();
    router.register({
      id: 'test-cap', name: 'test', description: 'd', source: 'native', tags: [],
      inputSchema: { type: 'object' }, outputSchema: { type: 'any' },
      requiredPermissions: [], risk: 'safe', reversible: true,
      async execute(input) { spy(input); return 'ok'; },
    });
    const er = new EventRuntime({ capabilityRouter: router });
    const t = er.register({ name: 'cap', kind: 'manual', action: { kind: 'capability', capabilityId: 'test-cap', input: { x: 1 } } });
    await er.fire(t.id);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ x: 1, triggerPayload: undefined }));
  });

  it('throws when capability router is not configured', async () => {
    const t = er.register({ name: 'cap', kind: 'manual', action: { kind: 'capability', capabilityId: 'x' } });
    await expect(er.fire(t.id)).rejects.toThrow(/capabilityRouter/);
  });
});

describe('EventRuntime — interval triggers', () => {
  afterEach(() => {
    // Clean up any lingering timers from failed tests.
  });

  it('fires on an interval', async () => {
    const er = new EventRuntime();
    const spy = vi.fn();
    er.register({
      name: 'tick',
      kind: 'interval',
      intervalMs: 20,
      action: { kind: 'callback', callback: spy },
    });
    await new Promise(r => setTimeout(r, 70));
    er.stop();
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('stop() halts all timers', async () => {
    const er = new EventRuntime();
    const spy = vi.fn();
    er.register({
      name: 'tick',
      kind: 'interval',
      intervalMs: 20,
      action: { kind: 'callback', callback: spy },
    });
    await new Promise(r => setTimeout(r, 50));
    er.stop();
    const countAfterStop = spy.mock.calls.length;
    await new Promise(r => setTimeout(r, 50));
    expect(spy.mock.calls.length).toBe(countAfterStop);
  });
});

describe('EventRuntime — event triggers', () => {
  it('fires when the matching event is published', async () => {
    const er = new EventRuntime();
    const spy = vi.fn();
    er.register({
      name: 'on-task-done',
      kind: 'event',
      eventType: EventType.TASK_COMPLETED,
      action: { kind: 'callback', callback: spy },
    });
    const { eventBus } = await import('../observability/eventBus.js');
    await eventBus.publish({
      id: 'e1', type: EventType.TASK_COMPLETED, payload: { taskId: 'x' },
      timestamp: new Date(), source: 'test',
    });
    // Give the fire-and-forget handler a tick to run.
    await new Promise(r => setTimeout(r, 10));
    er.stop();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('EventRuntime — webhooks', () => {
  it('registers and handles a webhook with a valid token', async () => {
    const er = new EventRuntime();
    const spy = vi.fn();
    const reg = er.registerWebhook('hook', { kind: 'callback', callback: spy });
    await er.handleWebhook(reg.triggerId, reg.token, { data: 'hello' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid token', async () => {
    const er = new EventRuntime();
    const spy = vi.fn();
    const reg = er.registerWebhook('hook', { kind: 'callback', callback: spy });
    await expect(er.handleWebhook(reg.triggerId, 'wrong-token', {})).rejects.toThrow(/token/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a webhook for an unknown trigger', async () => {
    const er = new EventRuntime();
    await expect(er.handleWebhook('nope', 'whatever', {})).rejects.toThrow();
  });
});

describe('EventRuntime — heartbeat', () => {
  it('emits a heartbeat count that increments', async () => {
    const er = new EventRuntime();
    er.startHeartbeat(20);
    await new Promise(r => setTimeout(r, 70));
    er.stopHeartbeat();
    expect(er.getHeartbeatCount()).toBeGreaterThanOrEqual(2);
  });

  it('stopHeartbeat halts the pulse', async () => {
    const er = new EventRuntime();
    er.startHeartbeat(20);
    await new Promise(r => setTimeout(r, 50));
    er.stopHeartbeat();
    const count = er.getHeartbeatCount();
    await new Promise(r => setTimeout(r, 50));
    expect(er.getHeartbeatCount()).toBe(count);
  });
});

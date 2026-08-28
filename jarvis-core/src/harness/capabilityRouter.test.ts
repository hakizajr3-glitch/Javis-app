import { describe, it, expect, beforeEach } from 'vitest';
import { CapabilityRouter } from './capabilityRouter.js';
import { PolicyEngine } from './policyEngine.js';
import { S } from './schema.js';
import { Capability } from './types.js';

function makeEchoCapability(overrides: Partial<Capability> = {}): Capability {
  return {
    id: 'test.echo',
    name: 'Echo',
    description: 'Echo a message back',
    source: 'native',
    tags: ['test', 'echo'],
    inputSchema: S.object({ message: S.string('text to echo') }, ['message']),
    outputSchema: S.object({ echoed: S.string() }, ['echoed']),
    requiredPermissions: [],
    risk: 'safe',
    reversible: true,
    execute: async (input: any) => ({ echoed: input.message }),
    ...overrides,
  } as Capability;
}

describe('CapabilityRouter — registration', () => {
  let router: CapabilityRouter;

  beforeEach(() => {
    router = new CapabilityRouter({ policy: new PolicyEngine({ defaultAutonomyLevel: 3 }) });
  });

  it('registers and retrieves a capability', () => {
    router.register(makeEchoCapability());
    expect(router.has('test.echo')).toBe(true);
    expect(router.size()).toBe(1);
  });

  it('rejects duplicate ids', () => {
    router.register(makeEchoCapability());
    expect(() => router.register(makeEchoCapability())).toThrow(/duplicate capability/);
  });

  it('describe() omits the execute function', () => {
    router.register(makeEchoCapability());
    const desc = router.describe('test.echo') as any;
    expect(desc.name).toBe('Echo');
    expect(desc.execute).toBeUndefined();
  });

  it('filters list by tag and risk ceiling', () => {
    router.register(makeEchoCapability());
    router.register(makeEchoCapability({ id: 'test.danger', tags: ['danger'], risk: 'critical' }));
    expect(router.list({ tags: ['danger'] })).toHaveLength(1);
    expect(router.list({ maxRisk: 'low' })).toHaveLength(1);
  });
});

describe('CapabilityRouter — progressive disclosure', () => {
  let router: CapabilityRouter;

  beforeEach(() => {
    router = new CapabilityRouter({ policy: new PolicyEngine({ defaultAutonomyLevel: 3 }) });
    router.register(makeEchoCapability({
      id: 'browser.navigate', name: 'Navigate Browser',
      description: 'Open a URL in the browser', tags: ['browser', 'web'],
    }));
    router.register(makeEchoCapability({
      id: 'git.commit', name: 'Git Commit',
      description: 'Commit staged changes to the repository', tags: ['git', 'vcs'],
    }));
    router.register(makeEchoCapability({
      id: 'fs.write', name: 'Write File',
      description: 'Write content to a file on disk', tags: ['filesystem', 'file'],
    }));
  });

  it('returns only relevant capabilities for an intent', () => {
    const view = router.viewFor('I need to commit my changes to the repository');
    expect(view.capabilities.length).toBeGreaterThan(0);
    expect(view.capabilities[0].id).toBe('git.commit');
    expect(view.totalAvailable).toBe(3);
  });

  it('matches browser intents to the browser capability', () => {
    const view = router.viewFor('open a url in the browser');
    expect(view.capabilities[0].id).toBe('browser.navigate');
  });

  it('respects the limit', () => {
    const view = router.viewFor('file browser repository', 1);
    expect(view.capabilities).toHaveLength(1);
  });

  it('reports honestly when nothing matches', () => {
    const view = router.viewFor('xylophone quantum flux');
    expect(view.capabilities).toHaveLength(0);
    expect(view.reason).toMatch(/no capability matched/);
  });

  it('resolve() returns the single best match', () => {
    const best = router.resolve('write content to a file');
    expect(best?.id).toBe('fs.write');
  });
});

describe('CapabilityRouter — typed invocation', () => {
  let router: CapabilityRouter;

  beforeEach(() => {
    router = new CapabilityRouter({ policy: new PolicyEngine({ defaultAutonomyLevel: 3 }) });
  });

  it('executes a valid call', async () => {
    router.register(makeEchoCapability());
    const result = await router.invoke('test.echo', { message: 'hello' }, { userId: 'u1' });
    expect(result.ok).toBe(true);
    expect(result.output).toEqual({ echoed: 'hello' });
  });

  it('rejects unknown capabilities', async () => {
    const result = await router.invoke('nope.missing', {}, { userId: 'u1' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown capability/);
  });

  it('rejects input that violates the schema', async () => {
    router.register(makeEchoCapability());
    const result = await router.invoke('test.echo', { wrong: 1 }, { userId: 'u1' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/input validation failed/);
  });

  it('rejects input with the wrong type', async () => {
    router.register(makeEchoCapability());
    const result = await router.invoke('test.echo', { message: 42 }, { userId: 'u1' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/expected string/);
  });

  it('catches an output contract violation', async () => {
    router.register(makeEchoCapability({
      id: 'test.liar',
      execute: async () => ({ wrongField: 'nope' }),
    }));
    const result = await router.invoke('test.liar', { message: 'x' }, { userId: 'u1' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/output validation failed/);
  });

  it('surfaces a thrown error without crashing', async () => {
    router.register(makeEchoCapability({
      id: 'test.boom',
      execute: async () => { throw new Error('kaboom'); },
    }));
    const result = await router.invoke('test.boom', { message: 'x' }, { userId: 'u1' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('kaboom');
  });

  it('blocks execution when policy denies', async () => {
    let executed = false;
    const strictRouter = new CapabilityRouter({ policy: new PolicyEngine({ defaultAutonomyLevel: 0 }) });
    strictRouter.register(makeEchoCapability({
      id: 'test.risky',
      risk: 'high',
      execute: async () => { executed = true; return { echoed: 'ran' }; },
    }));

    const result = await strictRouter.invoke('test.risky', { message: 'x' }, { userId: 'u1' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/policy require-approval/);
    expect(executed).toBe(false); // never reached the capability
  });

  it('tracks invocation stats', async () => {
    router.register(makeEchoCapability());
    await router.invoke('test.echo', { message: 'a' }, { userId: 'u1' });
    await router.invoke('test.echo', { message: 'b' }, { userId: 'u1' });
    const stats = router.getStats('test.echo') as any;
    expect(stats.calls).toBe(2);
    expect(stats.successRate).toBe(1);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { Orchestrator, LinearDecomposer, computeWaves } from './orchestrator.js';
import { CapabilityRouter } from './capabilityRouter.js';
import { VerificationEngine } from './verificationEngine.js';
import { MemoryRuntime } from './memoryRuntime.js';
import { HarnessTask } from './types.js';

function makeTask(partial: Partial<HarnessTask> & { id: string }): HarnessTask {
  return {
    title: partial.title ?? 't',
    description: partial.description ?? '',
    kind: partial.kind ?? 'reason',
    dependsOn: partial.dependsOn ?? [],
    status: partial.status ?? 'pending',
    attempts: 0,
    ...partial,
  } as HarnessTask;
}

describe('computeWaves', () => {
  it('places independent tasks in wave 0', () => {
    const a = makeTask({ id: 'a' });
    const b = makeTask({ id: 'b' });
    expect(computeWaves([a, b])).toEqual([['a', 'b']]);
  });

  it('respects dependencies', () => {
    const a = makeTask({ id: 'a' });
    const b = makeTask({ id: 'b', dependsOn: ['a'] });
    const c = makeTask({ id: 'c', dependsOn: ['a'] });
    const d = makeTask({ id: 'd', dependsOn: ['b', 'c'] });
    expect(computeWaves([a, b, c, d])).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  it('throws on a dependency cycle', () => {
    const a = makeTask({ id: 'a', dependsOn: ['b'] });
    const b = makeTask({ id: 'b', dependsOn: ['a'] });
    expect(() => computeWaves([a, b])).toThrow(/cycle/);
  });

  it('handles a diamond dependency', () => {
    const a = makeTask({ id: 'a' });
    const b = makeTask({ id: 'b', dependsOn: ['a'] });
    const c = makeTask({ id: 'c', dependsOn: ['a'] });
    const d = makeTask({ id: 'd', dependsOn: ['b', 'c'] });
    const e = makeTask({ id: 'e', dependsOn: ['d'] });
    expect(computeWaves([a, b, c, d, e])).toEqual([['a'], ['b', 'c'], ['d'], ['e']]);
  });
});

describe('LinearDecomposer', () => {
  it('produces a 5-task linear plan', async () => {
    const d = new LinearDecomposer();
    const tasks = await d.decompose('deploy the app', {
      userId: 'u1',
      availableCapabilities: [],
      memoryHints: [],
    });
    expect(tasks).toHaveLength(5);
    expect(tasks.map(t => t.title)).toEqual(['Perceive', 'Reason', 'Execute', 'Verify', 'Report']);
    // Each task depends on the previous one.
    expect(tasks[1].dependsOn).toEqual([tasks[0].id]);
    expect(tasks[4].dependsOn).toEqual([tasks[3].id]);
  });
});

describe('Orchestrator — planning', () => {
  it('plan() returns an OrchestrationPlan with waves', async () => {
    const o = new Orchestrator();
    const plan = await o.plan({ objective: 'do something', userId: 'u1' });
    expect(plan.graph.tasks).toHaveLength(5);
    expect(plan.waves).toHaveLength(5);
    expect(plan.waves[0]).toHaveLength(1);
  });

  it('dry run returns status "planned" and executes nothing', async () => {
    const o = new Orchestrator();
    const result = await o.run({ objective: 'x', userId: 'u1', dryRun: true });
    expect(result.status).toBe('planned');
    expect(result.completedTasks).toBe(0);
  });
});

describe('Orchestrator — execution', () => {
  it('executes a linear plan end-to-end', async () => {
    const o = new Orchestrator({
      reasonFn: async (prompt) => `reasoned about: ${prompt}`,
    });
    const result = await o.run({ objective: 'test objective', userId: 'u1' });
    expect(result.status).toBe('completed');
    expect(result.completedTasks).toBe(5);
    expect(result.failedTasks).toBe(0);
  });

  it('skips tasks whose dependencies failed', async () => {
    // Use a custom decomposer that produces a failing first task.
    const o = new Orchestrator({
      decomposer: {
        async decompose() {
          const a = makeTask({ id: 'a', kind: 'capability', capabilityId: 'does-not-exist', status: 'ready' });
          const b = makeTask({ id: 'b', kind: 'reason', dependsOn: ['a'], status: 'pending' });
          return [a, b];
        },
      },
      reasonFn: async () => 'ok',
    });
    const result = await o.run({ objective: 'x', userId: 'u1' });
    expect(result.failedTasks).toBe(1);
    // b should be skipped, not failed.
    const bTask = result.plan.graph.tasks.find(t => t.id === 'b');
    expect(bTask?.status).toBe('skipped');
  });

  it('dispatches capability tasks through the router', async () => {
    const router = new CapabilityRouter();
    let called = false;
    router.register({
      id: 'echo',
      name: 'echo',
      description: 'echoes input',
      source: 'native',
      tags: ['test'],
      inputSchema: { type: 'object' },
      outputSchema: { type: 'any' },
      requiredPermissions: [],
      risk: 'safe',
      reversible: true,
      async execute(input) { called = true; return input; },
    });
    const o = new Orchestrator({
      capabilityRouter: router,
      decomposer: {
        async decompose() {
          return [makeTask({ id: 't1', kind: 'capability', capabilityId: 'echo', input: { msg: 'hi' }, status: 'ready' })];
        },
      },
    });
    const result = await o.run({ objective: 'echo', userId: 'u1' });
    expect(called).toBe(true);
    expect(result.status).toBe('completed');
    expect(result.plan.graph.tasks[0].result).toEqual({ msg: 'hi' });
  });

  it('retries transient failures', async () => {
    const router = new CapabilityRouter();
    let calls = 0;
    router.register({
      id: 'flaky',
      name: 'flaky',
      description: 'fails twice then succeeds',
      source: 'native',
      tags: [],
      inputSchema: { type: 'object' },
      outputSchema: { type: 'any' },
      requiredPermissions: [],
      risk: 'safe',
      reversible: true,
      async execute() {
        calls++;
        if (calls < 3) throw new Error('connect ETIMEDOUT 10.0.0.1:443');
        return 'ok';
      },
    });
    const o = new Orchestrator({
      capabilityRouter: router,
      verificationEngine: new VerificationEngine({ maxAttempts: 5, baseBackoffMs: 1 }),
      config: { maxAttemptsPerTask: 5 },
      decomposer: {
        async decompose() {
          return [makeTask({ id: 't1', kind: 'capability', capabilityId: 'flaky', status: 'ready' })];
        },
      },
    });
    const result = await o.run({ objective: 'x', userId: 'u1' });
    expect(result.status).toBe('completed');
    expect(calls).toBe(3);
    expect(result.recoveries).toBeGreaterThanOrEqual(2);
  });

  it('escalates when attempts are exhausted', async () => {
    const router = new CapabilityRouter();
    router.register({
      id: 'always-fail',
      name: 'always-fail',
      description: 'always fails',
      source: 'native',
      tags: [],
      inputSchema: { type: 'object' },
      outputSchema: { type: 'any' },
      requiredPermissions: [],
      risk: 'safe',
      reversible: true,
      async execute() { throw new Error('connect ETIMEDOUT'); },
    });
    const o = new Orchestrator({
      capabilityRouter: router,
      verificationEngine: new VerificationEngine({ maxAttempts: 2, baseBackoffMs: 1 }),
      config: { maxAttemptsPerTask: 2 },
      decomposer: {
        async decompose() {
          return [makeTask({ id: 't1', kind: 'capability', capabilityId: 'always-fail', status: 'ready' })];
        },
      },
    });
    const result = await o.run({ objective: 'x', userId: 'u1' });
    expect(result.status).toBe('failed');
    expect(result.failedTasks).toBe(1);
    expect(result.escalations).toHaveLength(1);
  });

  it('agent tasks fail clearly when no dispatch is configured', async () => {
    const o = new Orchestrator({
      decomposer: {
        async decompose() {
          return [makeTask({ id: 't1', kind: 'agent', agentRole: 'researcher', status: 'ready' })];
        },
      },
    });
    const result = await o.run({ objective: 'x', userId: 'u1' });
    expect(result.failedTasks).toBe(1);
    expect(result.plan.graph.tasks[0].error).toMatch(/agent dispatch/);
  });

  it('uses memory hints in planning', async () => {
    const memory = new MemoryRuntime();
    await memory.saveMemory({
      kind: 'semantic', ownerId: 'system', scope: 'shared',
      content: 'deploys work best on tuesdays',
      importance: 0.9,
      provenance: { source: 'system', confidence: 0.9 },
    });
    const o = new Orchestrator({ memoryRuntime: memory });
    const plan = await o.plan({ objective: 'deploy', userId: 'u1' });
    expect(plan.notes[0]).toMatch(/memory hint/);
  });
});

describe('Orchestrator — createTask', () => {
  it('creates a ready task with no dependencies', () => {
    const o = new Orchestrator();
    const t = o.createTask({ title: 'x', description: 'd', kind: 'reason', dependsOn: [] });
    expect(t.status).toBe('ready');
    expect(t.attempts).toBe(0);
    expect(t.id).toBeTruthy();
  });

  it('creates a pending task with dependencies', () => {
    const o = new Orchestrator();
    const t = o.createTask({ title: 'x', description: 'd', kind: 'reason', dependsOn: ['other'] });
    expect(t.status).toBe('pending');
  });
});

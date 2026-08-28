import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HarnessFacade } from './index.js';

describe('HarnessFacade — integration', () => {
  let facade: HarnessFacade;

  beforeEach(() => {
    facade = new HarnessFacade({
      config: { userId: 'test-user', maxAttemptsPerTask: 3, verificationEnabled: false, learningEnabled: true },
      reasonFn: async (prompt) => `reasoned: ${prompt}`,
    });
  });

  afterEach(() => {
    facade.stop();
  });

  it('run() executes a linear plan end-to-end and produces a reflection', async () => {
    const result = await facade.run({ objective: 'test objective', userId: 'test-user' });
    expect(result.status).toBe('completed');
    expect(result.completedTasks).toBe(5);
    expect(result.reflection).toBeDefined();
    expect(result.reflection?.lessons.length).toBeGreaterThan(0);
  });

  it('dry run returns status "planned" with no execution', async () => {
    const result = await facade.run({ objective: 'x', userId: 'u', dryRun: true });
    expect(result.status).toBe('planned');
    expect(result.completedTasks).toBe(0);
    expect(result.reflection).toBeUndefined();
  });

  it('exposes all pillars through accessors', () => {
    expect(facade.getPolicy()).toBeDefined();
    expect(facade.getCapabilityRouter()).toBeDefined();
    expect(facade.getVerificationEngine()).toBeDefined();
    expect(facade.getMemoryRuntime()).toBeDefined();
    expect(facade.getOrchestrator()).toBeDefined();
    expect(facade.getEventRuntime()).toBeDefined();
    expect(facade.getLearningRuntime()).toBeDefined();
    expect(facade.getMissionRuntime()).toBeDefined();
    expect(facade.getAgentRuntime()).toBeDefined();
    expect(facade.getReasoningEngine()).toBeDefined();
    expect(facade.getSkillRuntime()).toBeDefined();
    expect(facade.getEnvironmentRuntime()).toBeDefined();
  });

  it('HarnessApi.getContext returns runtime stats', async () => {
    const ctx = await facade.getContext();
    expect(ctx.config).toBeDefined();
    expect(ctx.memoryStats).toBeDefined();
    expect(ctx.selfModel).toBeDefined();
  });

  it('HarnessApi.inspectState reports state', async () => {
    await facade.start();
    const state = await facade.inspectState();
    expect(state.started).toBe(true);
    expect(state.policy).toBe('PolicyEngine');
  });

  it('HarnessApi.searchMemory / saveMemory round-trip', async () => {
    const id = await facade.saveMemory({
      kind: 'semantic',
      ownerId: 'test-user',
      scope: 'shared',
      content: 'the user prefers concise answers',
      importance: 0.8,
      tags: ['preference'],
      provenance: { source: 'test', confidence: 0.9, successfulUses: 0 },
      relations: [],
    });
    expect(id).toBeTruthy();
    const results = await facade.searchMemory({ text: 'concise' });
    expect(results).toHaveLength(1);
    expect(results[0].content).toMatch(/concise/);
  });

  it('HarnessApi.queryKnowledge returns shared-scope records', async () => {
    await facade.saveMemory({
      kind: 'semantic', ownerId: 'u', scope: 'shared',
      content: 'deploy on tuesday', importance: 0.8,
      provenance: { source: 'test', confidence: 0.8, successfulUses: 0 }, relations: [],
    });
    const out = await facade.queryKnowledge('deploy');
    expect(out).toHaveLength(1);
  });

  it('HarnessApi.requestTool returns a capability view', async () => {
    const view = await facade.requestTool('anything');
    expect(view.totalAvailable).toBeGreaterThanOrEqual(0);
  });

  it('HarnessApi.createTask returns a task id', async () => {
    const id = await facade.createTask({
      title: 't', description: 'd', kind: 'reason', dependsOn: [],
    });
    expect(id).toBeTruthy();
  });

  it('HarnessApi.delegate runs a sub-mission', async () => {
    const runId = await facade.delegate('research a topic', 'researcher');
    expect(runId).toBeTruthy();
  });

  it('HarnessApi.createSkill stores a skill in memory', async () => {
    const id = await facade.createSkill({
      name: 'deploy',
      purpose: 'deploys apps',
      instructions: 'run deploy.sh',
      preconditions: ['app builds'],
      capabilityIds: [],
      requiresApproval: true,
    });
    expect(id).toBeTruthy();
    const records = await facade.searchMemory({ text: 'deploy' });
    expect(records.some(r => r.kind === 'skill')).toBe(true);
  });

  it('HarnessApi.evaluate produces a reflection', async () => {
    const r = await facade.evaluate('task', 't1');
    expect(r.subjectKind).toBe('task');
    expect(r.subjectId).toBe('t1');
  });

  it('HarnessApi.inspectEvents returns event history', async () => {
    const events = await facade.inspectEvents(5);
    expect(Array.isArray(events)).toBe(true);
  });
});

describe('HarnessFacade — singleton', () => {
  it('getHarness returns the same instance on repeated calls', async () => {
    const { getHarness, resetHarness } = await import('./index.js');
    const a = getHarness();
    const b = getHarness();
    expect(a).toBe(b);
    resetHarness();
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LearningRuntime, Evaluator } from './learningRuntime.js';
import { MemoryRuntime } from './memoryRuntime.js';
import { HarnessRunResult } from './types.js';

function makeRun(overrides: Partial<HarnessRunResult> = {}): HarnessRunResult {
  return {
    runId: 'r1',
    objective: 'test',
    status: 'completed',
    plan: { graph: { id: 'g', objective: 'test', tasks: [], createdAt: new Date() }, waves: [], estimatedDurationMs: 0, notes: [] },
    completedTasks: 5,
    failedTasks: 0,
    verificationsPassed: 4,
    verificationsFailed: 1,
    recoveries: 1,
    escalations: [],
    startedAt: new Date(),
    finishedAt: new Date(),
    ...overrides,
  };
}

describe('LearningRuntime — reflection', () => {
  let lr: LearningRuntime;

  beforeEach(() => {
    lr = new LearningRuntime();
  });

  it('derives what-worked / what-failed / lessons from a run', async () => {
    const r = await lr.evaluate({ subjectKind: 'mission', subjectId: 'm1', run: makeRun() });
    expect(r.whatWorked).toContain('5 task(s) completed');
    expect(r.whatFailed).toContain('1 verification(s) failed');
    expect(r.lessons.length).toBeGreaterThan(0);
  });

  it('stores and retrieves reflections', async () => {
    const r = await lr.evaluate({ subjectKind: 'task', subjectId: 't1', run: makeRun() });
    expect(lr.getReflection(r.id)).toBeDefined();
    expect(lr.listReflections()).toHaveLength(1);
  });

  it('persists reflections to memory when available', async () => {
    const memory = new MemoryRuntime();
    const lr = new LearningRuntime({ memoryRuntime: memory });
    await lr.evaluate({ subjectKind: 'mission', subjectId: 'm1', run: makeRun() });
    const records = await memory.queryKnowledge('Reflection');
    expect(records).toHaveLength(1);
    expect(records[0].kind).toBe('reflective');
  });

  it('accepts explicit overrides for what-worked / what-failed', async () => {
    const r = await lr.evaluate({
      subjectKind: 'agent',
      subjectId: 'a1',
      whatWorked: ['custom win'],
      whatFailed: ['custom loss'],
      lessons: ['custom lesson'],
    });
    expect(r.whatWorked).toEqual(['custom win']);
    expect(r.whatFailed).toEqual(['custom loss']);
    expect(r.lessons).toEqual(['custom lesson']);
  });
});

describe('LearningRuntime — proposals', () => {
  let lr: LearningRuntime;

  beforeEach(() => {
    lr = new LearningRuntime();
  });

  it('creates a proposal in "proposed" status', async () => {
    const p = await lr.propose({
      title: 'better prompt',
      rationale: 'improves clarity',
      targetKind: 'prompt',
      change: { score: 0.8 },
    });
    expect(p.status).toBe('proposed');
    expect(lr.getProposal(p.id)).toBeDefined();
  });

  it('marks model-routing and capability proposals as requiring approval', async () => {
    const p1 = await lr.propose({ title: 'switch model', rationale: 'r', targetKind: 'model-routing', change: {} });
    expect(p1.requiresApproval).toBe(true);
    const p2 = await lr.propose({ title: 'new cap', rationale: 'r', targetKind: 'capability', change: {} });
    expect(p2.requiresApproval).toBe(true);
    const p3 = await lr.propose({ title: 'new prompt', rationale: 'r', targetKind: 'prompt', change: {} });
    expect(p3.requiresApproval).toBe(false);
  });

  it('marks high-impact changes as requiring approval', async () => {
    const p = await lr.propose({ title: 'x', rationale: 'r', targetKind: 'strategy', change: { highImpact: true } });
    expect(p.requiresApproval).toBe(true);
  });

  it('evaluateProposal validates a winning proposal', async () => {
    const p = await lr.propose({
      title: 'winning',
      rationale: 'beats baseline',
      targetKind: 'prompt',
      change: { score: 0.9 },
    });
    const evaluated = await lr.evaluateProposal(p.id, 0.5, 10);
    expect(evaluated.status).toBe('validated');
    expect(evaluated.evaluation?.improved).toBe(true);
    expect(evaluated.evaluation?.candidateScore).toBe(0.9);
  });

  it('evaluateProposal rejects a losing proposal', async () => {
    const p = await lr.propose({
      title: 'losing',
      rationale: 'worse than baseline',
      targetKind: 'prompt',
      change: { score: 0.3 },
    });
    const evaluated = await lr.evaluateProposal(p.id, 0.5, 10);
    expect(evaluated.status).toBe('rejected');
    expect(evaluated.evaluation?.improved).toBe(false);
  });

  it('evaluateProposal leaves requires-approval proposals in "proposed" even when improved', async () => {
    const p = await lr.propose({
      title: 'model swap',
      rationale: 'better',
      targetKind: 'model-routing',
      change: { score: 0.9 },
    });
    const evaluated = await lr.evaluateProposal(p.id, 0.5, 10);
    expect(evaluated.status).toBe('proposed'); // not auto-validated
  });

  it('deployProposal deploys a validated proposal', async () => {
    const p = await lr.propose({
      title: 'ok',
      rationale: 'r',
      targetKind: 'prompt',
      change: { score: 0.9 },
    });
    await lr.evaluateProposal(p.id, 0.5, 10);
    const deployed = await lr.deployProposal(p.id);
    expect(deployed.status).toBe('deployed');
  });

  it('deployProposal refuses to deploy without approval when required', async () => {
    const p = await lr.propose({
      title: 'model swap',
      rationale: 'r',
      targetKind: 'model-routing',
      change: { score: 0.9 },
    });
    // Force it into validated via a custom evaluator that ignores approval.
    const lr2 = new LearningRuntime({
      evaluator: async () => ({
        baselineScore: 0.5, candidateScore: 0.9, improved: true,
        sampleSize: 5, notes: [], evaluatedAt: new Date(),
      }),
    });
    const p2 = await lr2.propose({
      title: 'model swap', rationale: 'r', targetKind: 'model-routing', change: {},
    });
    const evaluated = await lr2.evaluateProposal(p2.id, 0.5, 5);
    // Even if validated externally, deploy must check approval.
    evaluated.status = 'validated';
    await expect(lr2.deployProposal(p2.id)).rejects.toThrow(/approval/);
    // With approval it deploys.
    const deployed = await lr2.deployProposal(p2.id, true);
    expect(deployed.status).toBe('deployed');
  });

  it('listProposals filters by status', async () => {
    await lr.propose({ title: 'a', rationale: 'r', targetKind: 'prompt', change: { score: 0.9 } });
    await lr.propose({ title: 'b', rationale: 'r', targetKind: 'prompt', change: { score: 0.1 } });
    expect(lr.listProposals({ status: 'proposed' })).toHaveLength(2);
  });

  it('uses a custom evaluator', async () => {
    const spy = vi.fn<Evaluator>();
    spy.mockResolvedValue({
      baselineScore: 0.5, candidateScore: 0.7, improved: true,
      sampleSize: 3, notes: ['custom'], evaluatedAt: new Date(),
    });
    const lr = new LearningRuntime({ evaluator: spy });
    const p = await lr.propose({ title: 'x', rationale: 'r', targetKind: 'prompt', change: {} });
    await lr.evaluateProposal(p.id, 0.5, 3);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][2]).toBe(3);
  });
});

describe('LearningRuntime — self-model', () => {
  let lr: LearningRuntime;

  beforeEach(() => {
    lr = new LearningRuntime();
  });

  it('starts with an empty self-model', () => {
    const m = lr.getSelfModel();
    expect(m.capabilities).toEqual({});
    expect(m.weaknesses).toEqual([]);
    expect(m.overallVerificationPassRate).toBe(0);
  });

  it('adds weaknesses from failed reflections', async () => {
    await lr.evaluate({
      subjectKind: 'mission', subjectId: 'm1',
      whatFailed: ['deploy step broke'],
    });
    expect(lr.getSelfModel().weaknesses).toContain('deploy step broke');
  });

  it('updates verification pass rate from runs', async () => {
    await lr.evaluate({ subjectKind: 'mission', subjectId: 'm1', run: makeRun({ verificationsPassed: 8, verificationsFailed: 2 }) });
    expect(lr.getSelfModel().overallVerificationPassRate).toBeCloseTo(0.8);
  });

  it('smooths the verification pass rate across reflections', async () => {
    await lr.evaluate({ subjectKind: 'mission', subjectId: 'm1', run: makeRun({ verificationsPassed: 10, verificationsFailed: 0 }) });
    await lr.evaluate({ subjectKind: 'mission', subjectId: 'm2', run: makeRun({ verificationsPassed: 0, verificationsFailed: 10 }) });
    const rate = lr.getSelfModel().overallVerificationPassRate;
    // First sets it to 1.0, second averages to 0.5.
    expect(rate).toBeCloseTo(0.5);
  });

  it('setCapability / addWeakness / removeWeakness mutate the model', () => {
    lr.setCapability('coding', 0.9);
    expect(lr.getSelfModel().capabilities.coding).toBe(0.9);
    lr.addWeakness('testing');
    expect(lr.getSelfModel().weaknesses).toContain('testing');
    lr.removeWeakness('testing');
    expect(lr.getSelfModel().weaknesses).not.toContain('testing');
  });

  it('tracks active improvements', async () => {
    const p = await lr.propose({ title: 'x', rationale: 'r', targetKind: 'prompt', change: {} });
    expect(lr.getSelfModel().activeImprovements).toContain(p.id);
    await lr.evaluateProposal(p.id, 0.5, 5);
    expect(lr.getSelfModel().activeImprovements).not.toContain(p.id);
  });
});

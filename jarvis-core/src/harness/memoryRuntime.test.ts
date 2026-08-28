import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRuntime, freshDNA, emptyPerformance } from './memoryRuntime.js';

describe('MemoryRuntime — records', () => {
  let mr: MemoryRuntime;

  beforeEach(() => {
    mr = new MemoryRuntime();
  });

  it('saves and retrieves a record by id', async () => {
    const id = await mr.saveMemory({
      kind: 'semantic',
      ownerId: 'agent-1',
      scope: 'shared',
      content: 'The user prefers tabs over spaces.',
      importance: 0.8,
      tags: ['preference', 'editor'],
      provenance: { source: 'agent-1', confidence: 0.9 },
    });
    const rec = await mr.getMemory(id);
    expect(rec).not.toBeNull();
    expect(rec!.content).toBe('The user prefers tabs over spaces.');
    expect(rec!.provenance.successfulUses).toBe(0);
    expect(rec!.id).toBe(id);
  });

  it('searchMemory filters by kind, scope, tags, and ranks by relevance', async () => {
    await mr.saveMemory({
      kind: 'semantic',
      ownerId: 'a',
      scope: 'shared',
      content: 'user prefers tabs over spaces',
      importance: 0.9,
      tags: ['editor'],
      provenance: { source: 'a', confidence: 0.9 },
    });
    await mr.saveMemory({
      kind: 'episodic',
      ownerId: 'a',
      scope: 'shared',
      content: 'user asked for a deploy on tuesday',
      importance: 0.5,
      tags: ['deploy'],
      provenance: { source: 'a', confidence: 0.7 },
    });
    const results = await mr.searchMemory({ text: 'tabs', scope: 'shared' });
    expect(results).toHaveLength(1);
    expect(results[0].content).toMatch(/tabs/);
  });

  it('respects private scope visibility', async () => {
    await mr.saveMemory({
      kind: 'semantic',
      ownerId: 'agent-x',
      scope: 'private',
      content: 'secret note',
      importance: 0.5,
      provenance: { source: 'agent-x', confidence: 0.5 },
    });
    // Other agents cannot see private records.
    const other = await mr.searchMemory({ text: 'secret', ownerId: 'agent-y' });
    expect(other).toHaveLength(0);
    // Owner can.
    const own = await mr.searchMemory({ text: 'secret', ownerId: 'agent-x' });
    expect(own).toHaveLength(1);
  });

  it('filters by tags (every tag must match)', async () => {
    await mr.saveMemory({
      kind: 'semantic', ownerId: 'a', scope: 'shared',
      content: 'one', importance: 0.5, tags: ['x', 'y'],
      provenance: { source: 'a', confidence: 0.5 },
    });
    await mr.saveMemory({
      kind: 'semantic', ownerId: 'a', scope: 'shared',
      content: 'two', importance: 0.5, tags: ['x'],
      provenance: { source: 'a', confidence: 0.5 },
    });
    const both = await mr.searchMemory({ tags: ['x'] });
    expect(both).toHaveLength(2);
    const onlyFirst = await mr.searchMemory({ tags: ['x', 'y'] });
    expect(onlyFirst).toHaveLength(1);
    expect(onlyFirst[0].content).toBe('one');
  });

  it('queryKnowledge returns only shared-scope records', async () => {
    await mr.saveMemory({
      kind: 'semantic', ownerId: 'a', scope: 'shared',
      content: 'deploy steps', importance: 0.8,
      provenance: { source: 'a', confidence: 0.8 },
    });
    await mr.saveMemory({
      kind: 'semantic', ownerId: 'a', scope: 'private',
      content: 'deploy secrets', importance: 0.8,
      provenance: { source: 'a', confidence: 0.8 },
    });
    const out = await mr.queryKnowledge('deploy');
    expect(out).toHaveLength(1);
    expect(out[0].scope).toBe('shared');
  });
});

describe('MemoryRuntime — relations', () => {
  let mr: MemoryRuntime;

  beforeEach(() => {
    mr = new MemoryRuntime();
  });

  it('relates two records and walks the graph', async () => {
    const a = await mr.saveMemory({
      kind: 'semantic', ownerId: 'a', scope: 'shared',
      content: 'fact A', importance: 0.5,
      provenance: { source: 'a', confidence: 0.5 },
    });
    const b = await mr.saveMemory({
      kind: 'semantic', ownerId: 'a', scope: 'shared',
      content: 'fact B', importance: 0.5,
      provenance: { source: 'a', confidence: 0.5 },
    });
    await mr.relate(a, 'supports', b);
    expect(mr.relationsOf(a)).toEqual([{ relation: 'supports', targetId: b }]);
    const neighbours = mr.neighbours(a);
    expect(neighbours).toHaveLength(1);
    expect(neighbours[0].id).toBe(b);
  });

  it('refuses to relate to an unknown target', async () => {
    const a = await mr.saveMemory({
      kind: 'semantic', ownerId: 'a', scope: 'shared',
      content: 'fact A', importance: 0.5,
      provenance: { source: 'a', confidence: 0.5 },
    });
    await expect(mr.relate(a, 'supports', 'does-not-exist')).rejects.toThrow();
  });

  it('does not double-insert the same relation', async () => {
    const a = await mr.saveMemory({
      kind: 'semantic', ownerId: 'a', scope: 'shared',
      content: 'A', importance: 0.5,
      provenance: { source: 'a', confidence: 0.5 },
    });
    const b = await mr.saveMemory({
      kind: 'semantic', ownerId: 'a', scope: 'shared',
      content: 'B', importance: 0.5,
      provenance: { source: 'a', confidence: 0.5 },
    });
    await mr.relate(a, 'relates-to', b);
    await mr.relate(a, 'relates-to', b);
    expect(mr.relationsOf(a)).toHaveLength(1);
  });
});

describe('MemoryRuntime — use tracking + consolidation', () => {
  it('recordUse bumps confidence on success and lowers it on failure', async () => {
    const mr = new MemoryRuntime();
    const id = await mr.saveMemory({
      kind: 'procedural', ownerId: 'a', scope: 'shared',
      content: 'how to deploy', importance: 0.5,
      provenance: { source: 'a', confidence: 0.5 },
    });
    await mr.recordUse(id, true);
    let rec = (await mr.getMemory(id))!;
    expect(rec.provenance.successfulUses).toBe(1);
    expect(rec.provenance.confidence).toBeGreaterThan(0.5);
    const highConf = rec.provenance.confidence;
    await mr.recordUse(id, false);
    rec = (await mr.getMemory(id))!;
    expect(rec.provenance.confidence).toBeLessThan(highConf);
  });

  it('consolidation prunes decayed records and promotes heavily-used ones', async () => {
    const mr = new MemoryRuntime({
      decayHalfLifeDays: 0.0000005, // ~43ms — decays fast enough for the test
      pruneThreshold: 0.4,
      promoteUses: 3,
    });
    const low = await mr.saveMemory({
      kind: 'episodic', ownerId: 'a', scope: 'shared',
      content: 'forgettable', importance: 0.5,
      provenance: { source: 'a', confidence: 0.5 },
    });
    const important = await mr.saveMemory({
      kind: 'procedural', ownerId: 'a', scope: 'shared',
      content: 'useful skill', importance: 0.5,
      provenance: { source: 'a', confidence: 0.5 },
    });
    // Reinforce the important one.
    await mr.recordUse(important, true);
    await mr.recordUse(important, true);
    await mr.recordUse(important, true);
    // Wait long enough for decay to bite (half-life ~86ms).
    await new Promise(r => setTimeout(r, 250));
    const result = await mr.consolidate();
    expect(result.pruned).toBeGreaterThanOrEqual(1);
    expect(await mr.getMemory(low)).toBeNull();
    const survivor = await mr.getMemory(important);
    expect(survivor).not.toBeNull();
    expect(survivor!.importance).toBeGreaterThanOrEqual(0.8);
  });
});

describe('MemoryRuntime — working memory', () => {
  it('sets, gets, lists, and clears working memory by mission', async () => {
    const mr = new MemoryRuntime();
    await mr.setWorking('m1', 'k', 'v');
    expect(await mr.getWorking('m1', 'k')).toBe('v');
    expect(await mr.getWorking('m1', 'missing')).toBeNull();
    expect(await mr.listWorking('m1')).toEqual({ k: 'v' });
    await mr.clearWorking('m1');
    expect(await mr.listWorking('m1')).toEqual({});
  });

  it('isolates working memory per mission', async () => {
    const mr = new MemoryRuntime();
    await mr.setWorking('m1', 'k', 1);
    await mr.setWorking('m2', 'k', 2);
    expect(await mr.getWorking('m1', 'k')).toBe(1);
    expect(await mr.getWorking('m2', 'k')).toBe(2);
  });
});

describe('MemoryRuntime — AgentDNA', () => {
  it('freshDNA has zeroed performance and empty evolution', () => {
    const d = freshDNA({
      agentId: 'a1',
      role: 'researcher',
      name: 'R',
      description: 'd',
    });
    expect(d.performance.tasksAttempted).toBe(0);
    expect(d.evolution).toEqual([]);
    expect(d.goals).toEqual([]);
  });

  it('saveDNA + loadDNA round-trips', async () => {
    const mr = new MemoryRuntime();
    const d = freshDNA({ agentId: 'a1', role: 'r', name: 'R', description: 'd' });
    await mr.saveDNA(d);
    const loaded = await mr.loadDNA('a1');
    expect(loaded).not.toBeNull();
    expect(loaded!.agentId).toBe('a1');
  });

  it('loadDNA returns null for unknown agents', async () => {
    const mr = new MemoryRuntime();
    expect(await mr.loadDNA('nope')).toBeNull();
  });

  it('evolveDNA appends an event and applies deltas to performance', async () => {
    const mr = new MemoryRuntime();
    const d = freshDNA({ agentId: 'a1', role: 'r', name: 'R', description: 'd' });
    await mr.saveDNA(d);
    await mr.evolveDNA('a1', {
      at: new Date(),
      kind: 'skill-learned',
      detail: 'learned to deploy',
      delta: { recoveries: 1 },
    });
    const after = (await mr.loadDNA('a1'))!;
    expect(after.evolution).toHaveLength(1);
    expect(after.performance.recoveries).toBe(1);
  });

  it('updatePerformance tracks success rate and rolling duration', async () => {
    const mr = new MemoryRuntime();
    await mr.saveDNA(freshDNA({ agentId: 'a1', role: 'r', name: 'R', description: 'd' }));
    await mr.updatePerformance('a1', { success: true, durationMs: 100, verified: true });
    await mr.updatePerformance('a1', { success: false, durationMs: 300 });
    const p = (await mr.loadDNA('a1'))!.performance;
    expect(p.tasksAttempted).toBe(2);
    expect(p.tasksSucceeded).toBe(1);
    expect(p.successRate).toBeCloseTo(0.5);
    expect(p.averageDurationMs).toBeCloseTo(200);
    expect(p.recoveries).toBe(0);
  });

  it('listDNA returns every loaded agent', async () => {
    const mr = new MemoryRuntime();
    await mr.saveDNA(freshDNA({ agentId: 'a', role: 'r', name: 'A', description: '' }));
    await mr.saveDNA(freshDNA({ agentId: 'b', role: 'r', name: 'B', description: '' }));
    expect(mr.listDNA().map(d => d.agentId).sort()).toEqual(['a', 'b']);
  });
});

describe('MemoryRuntime — stats', () => {
  it('reports counts by kind, scope, and averages', async () => {
    const mr = new MemoryRuntime();
    await mr.saveMemory({
      kind: 'semantic', ownerId: 'a', scope: 'shared',
      content: 'x', importance: 0.6,
      provenance: { source: 'a', confidence: 0.8 },
    });
    await mr.saveMemory({
      kind: 'episodic', ownerId: 'a', scope: 'private',
      content: 'y', importance: 0.4,
      provenance: { source: 'a', confidence: 0.5 },
    });
    const s = mr.getStats();
    expect(s.recordCount).toBe(2);
    expect(s.byKind.semantic).toBe(1);
    expect(s.byKind.episodic).toBe(1);
    expect(s.byScope.shared).toBe(1);
    expect(s.byScope.private).toBe(1);
    expect(s.avgImportance).toBeCloseTo(0.5);
    expect(s.avgConfidence).toBeCloseTo(0.65);
  });
});

describe('emptyPerformance', () => {
  it('returns a zeroed performance record', () => {
    const p = emptyPerformance();
    expect(p.tasksAttempted).toBe(0);
    expect(p.successRate).toBe(0);
    expect(p.lastUpdatedAt).toBeInstanceOf(Date);
  });
});

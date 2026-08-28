import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRuntime } from '../memoryRuntime.js';
import { memoryEngine } from '../../memory-engine/memoryEngine.js';
import { importLegacyMemory, searchLegacyAsRecords } from './memoryEngineAdapter.js';

describe('MemoryEngineAdapter', () => {
  beforeEach(async () => {
    // Reset the singleton's state between tests.
    memoryEngine.importState({
      workingMemory: [],
      organizationMemory: [],
      personalMemory: [],
      metadata: [],
      searchIndex: [],
    });
  });

  it('imports legacy personal memory into the runtime', async () => {
    await memoryEngine.setPersonalMemory('user-1', 'pref', 'tabs over spaces');
    const runtime = new MemoryRuntime();
    const result = await importLegacyMemory(runtime);
    expect(result.imported).toBe(1);
    expect(result.byTier.personal).toBe(1);
    const records = await runtime.searchMemory({ text: 'tabs', ownerId: 'user-1' });
    expect(records).toHaveLength(1);
    expect(records[0].content).toBe('tabs over spaces');
    expect(records[0].tags).toContain('personal');
  });

  it('imports working and organization memory', async () => {
    await memoryEngine.setWorkingMemory('m1', 'step', 'done');
    await memoryEngine.setOrganizationMemory('org-1', 'policy', 'always verify');
    const runtime = new MemoryRuntime();
    const result = await importLegacyMemory(runtime);
    expect(result.imported).toBe(2);
    expect(result.byTier.working).toBe(1);
    expect(result.byTier.organization).toBe(1);
  });

  it('skips null/undefined values', async () => {
    await memoryEngine.setPersonalMemory('u1', 'k', null);
    const runtime = new MemoryRuntime();
    const result = await importLegacyMemory(runtime);
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('searchLegacyAsRecords returns matching records without persisting', async () => {
    await memoryEngine.setPersonalMemory('u1', 'pref', 'deploy on tuesday');
    const records = await searchLegacyAsRecords('deploy');
    expect(records).toHaveLength(1);
    expect(records[0].content).toBe('deploy on tuesday');
    expect(records[0].id).toMatch(/^legacy:/);
  });

  it('serializes non-string values as JSON', async () => {
    await memoryEngine.setPersonalMemory('u1', 'data', { count: 5 });
    const runtime = new MemoryRuntime();
    await importLegacyMemory(runtime);
    const records = await runtime.searchMemory({ text: 'count', ownerId: 'u1' });
    expect(records).toHaveLength(1);
    expect(JSON.parse(records[0].content)).toEqual({ count: 5 });
  });
});

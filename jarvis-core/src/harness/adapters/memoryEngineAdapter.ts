/**
 * MemoryEngineAdapter — bridges the existing tier-based memory-engine into
 * the harness MemoryRuntime.
 *
 * The legacy MemoryEngine is a working/organization/personal KV store with
 * text search. The harness MemoryRuntime is a typed, provenance-tracked
 * record store. This adapter does a one-way import: it reads from the legacy
 * engine and creates MemoryRecords in the runtime, preserving the original
 * tier as scope and tagging by tier kind.
 *
 * This is a migration aid, not a live bridge — run it once at startup (or
 * on demand) to seed the new memory layer with existing knowledge.
 */
import { MemoryRuntime } from '../memoryRuntime.js';
import { memoryEngine } from '../../memory-engine/memoryEngine.js';
import type { MemoryTier } from '../../memory-engine/types.js';
import { MemoryRecord } from '../types.js';

const TIER_TO_SCOPE: Record<MemoryTier, MemoryRecord['scope']> = {
  working: 'private',
  organization: 'organization',
  personal: 'private',
};

const TIER_TO_KIND: Record<MemoryTier, MemoryRecord['kind']> = {
  working: 'working',
  organization: 'semantic',
  personal: 'semantic',
};

export interface ImportResult {
  imported: number;
  skipped: number;
  byTier: Record<string, number>;
}

/**
 * Import all entries from the legacy MemoryEngine into the harness
 * MemoryRuntime. Each (tier, owner, key, value) tuple becomes one
 * MemoryRecord. String values are imported as content; non-string values
 * are JSON-serialized.
 */
export async function importLegacyMemory(runtime: MemoryRuntime): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, byTier: {} };
  const tiers: MemoryTier[] = ['working', 'organization', 'personal'];

  for (const tier of tiers) {
    const stats = memoryEngine.getStats();
    // The legacy engine doesn't expose a list-all per tier across owners,
    // so we use exportState to read raw maps.
    const state = memoryEngine.exportState();
    const tierMap = tier === 'working' ? state.workingMemory
      : tier === 'organization' ? state.organizationMemory
      : state.personalMemory;
    if (!tierMap) continue;

    for (const [ownerId, entries] of tierMap as Array<[string, Array<[string, any]>]>) {
      for (const [key, value] of entries) {
        if (value === null || value === undefined) {
          result.skipped++;
          continue;
        }
        const content = typeof value === 'string' ? value : JSON.stringify(value);
        await runtime.saveMemory({
          kind: TIER_TO_KIND[tier],
          ownerId,
          scope: TIER_TO_SCOPE[tier],
          content,
          importance: 0.5,
          tags: [tier, key],
          provenance: {
            source: `legacy-memory-engine:${tier}`,
            confidence: 0.6,
          },
        });
        result.imported++;
        result.byTier[tier] = (result.byTier[tier] ?? 0) + 1;
      }
    }
  }

  return result;
}

/**
 * Search the legacy engine and return results as MemoryRecords (without
 * persisting them). Useful for read-only lookups during migration.
 */
export async function searchLegacyAsRecords(
  query: string,
  limit = 10
): Promise<MemoryRecord[]> {
  const results = await memoryEngine.searchAllMemory(query);
  return results.slice(0, limit).map(r => ({
    id: `legacy:${r.tier}:${r.key}`,
    kind: TIER_TO_KIND[r.tier],
    ownerId: (r.metadata as any)?.missionId ?? (r.metadata as any)?.orgId ?? (r.metadata as any)?.userId ?? 'legacy',
    scope: TIER_TO_SCOPE[r.tier],
    content: typeof r.value === 'string' ? r.value : JSON.stringify(r.value),
    importance: 0.5,
    tags: [r.tier, r.key],
    provenance: {
      source: `legacy-memory-engine:${r.tier}`,
      confidence: 0.6 * (r.score ?? 1),
      evidence: [{ kind: 'assertion', detail: `legacy score: ${r.score}` }],
      successfulUses: 0,
    },
    relations: [],
    createdAt: r.metadata?.createdAt ?? new Date(),
    updatedAt: r.metadata?.updatedAt ?? new Date(),
  }));
}

/**
 * JARVIS Elite Agentic Harness — Pillar 7: Memory Runtime / DNA Memory.
 *
 * This is the harness-level memory layer. It does NOT replace the existing
 * tier-based `MemoryEngine` (working/organization/personal KV store); instead
 * it provides the typed, provenance-tracked, relationally-linked memory model
 * defined in `types.ts` (MemoryRecord + AgentDNA), plus the DNA lifecycle
 * (load / save / evolve / performance update) and the HarnessApi memory
 * surface that agents call into.
 *
 * Design principles (NOOA):
 *  - Explicit object state: an agent's identity, skills, and performance live
 *    on its AgentDNA, persisted across runs — not reconstructed from chat.
 *  - Pass-by-reference: agents receive MemoryRecord ids, not serialized blobs.
 *  - Provenance + confidence: every record carries where it came from and how
 *    much the system trusts it; successful use raises confidence, failed use
 *    lowers it.
 *  - Decay + consolidation: importance decays over time unless reinforced by
 *    use; low-importance records are pruned during consolidation.
 *  - Pluggable persistence: optional PersistenceAdapter for durable storage.
 *    When absent, falls back to an in-memory Map (good for tests + ephemeral
 *    runs).
 */
import { v4 as uuidv4 } from 'uuid';
import type { PersistenceAdapter } from '../persistence/types.js';
import {
  AgentDNA,
  Evidence,
  EvolutionEvent,
  MemoryKind,
  MemoryQuery,
  MemoryRecord,
  MemoryRelation,
  PerformanceRecord,
} from './types.js';

const KEY_RECORD = 'memory:record:';
const KEY_DNA = 'memory:dna:';
const KEY_WORKING = 'memory:working:';
const KEY_INDEX = 'memory:index:records';
const KEY_DNA_INDEX = 'memory:index:dna';

const DEFAULT_HALF_LIFE_DAYS = 30;
const DEFAULT_PRUNE_THRESHOLD = 0.05;
const DEFAULT_PROMOTE_USES = 5;

export interface MemoryRuntimeOptions {
  persistence?: PersistenceAdapter;
  /** Half-life for importance decay, in days. Default 30. */
  decayHalfLifeDays?: number;
  /** Importance below which records are pruned during consolidation. */
  pruneThreshold?: number;
  /** Successful-use count at which a record is auto-promoted to importance ≥ 0.8. */
  promoteUses?: number;
}

export interface SaveMemoryInput {
  kind: MemoryKind;
  ownerId: string;
  scope: MemoryRecord['scope'];
  content: string;
  importance: number;
  tags?: string[];
  provenance: {
    source: string;
    agentId?: string;
    missionId?: string;
    taskId?: string;
    confidence: number;
    evidence?: Evidence[];
  };
  relations?: Array<{ relation: MemoryRelation; targetId: string }>;
}

export interface ConsolidationResult {
  pruned: number;
  promoted: number;
  decayed: number;
  durationMs: number;
}

export interface MemoryStats {
  recordCount: number;
  byKind: Record<string, number>;
  byScope: Record<string, number>;
  dnaCount: number;
  workingScopes: number;
  avgImportance: number;
  avgConfidence: number;
}

export class MemoryRuntime {
  private persistence?: PersistenceAdapter;
  private decayHalfLifeDays: number;
  private pruneThreshold: number;
  private promoteUses: number;

  // In-memory caches mirror persisted state. On a cache miss we fall through
  // to persistence; on a write we update both. This keeps the hot path sync
  // while still being durable.
  private records = new Map<string, MemoryRecord>();
  private dna = new Map<string, AgentDNA>();
  private working = new Map<string, Map<string, any>>();
  private recordIds: string[] = [];
  private dnaIds: string[] = [];
  private loaded = false;

  constructor(opts: MemoryRuntimeOptions = {}) {
    this.persistence = opts.persistence;
    this.decayHalfLifeDays = opts.decayHalfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
    this.pruneThreshold = opts.pruneThreshold ?? DEFAULT_PRUNE_THRESHOLD;
    this.promoteUses = opts.promoteUses ?? DEFAULT_PROMOTE_USES;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async load(): Promise<void> {
    if (this.loaded || !this.persistence) {
      this.loaded = true;
      return;
    }
    const recordIds = (await this.persistence.get<string[]>(KEY_INDEX)) ?? [];
    const dnaIds = (await this.persistence.get<string[]>(KEY_DNA_INDEX)) ?? [];
    const records = await this.persistence.batchGet(recordIds.map(id => KEY_RECORD + id));
    for (const id of recordIds) {
      const rec = records[KEY_RECORD + id] as MemoryRecord | undefined;
      if (rec) {
        // Rehydrate dates.
        rec.createdAt = new Date(rec.createdAt);
        rec.updatedAt = new Date(rec.updatedAt);
        if (rec.provenance.lastValidatedAt) {
          rec.provenance.lastValidatedAt = new Date(rec.provenance.lastValidatedAt);
        }
        this.records.set(id, rec);
      }
    }
    const dnas = await this.persistence.batchGet(dnaIds.map(id => KEY_DNA + id));
    for (const id of dnaIds) {
      const d = dnas[KEY_DNA + id] as AgentDNA | undefined;
      if (d) {
        d.createdAt = new Date(d.createdAt);
        d.updatedAt = new Date(d.updatedAt);
        d.performance.lastUpdatedAt = new Date(d.performance.lastUpdatedAt);
        this.dna.set(id, d);
      }
    }
    this.recordIds = recordIds;
    this.dnaIds = dnaIds;
    this.loaded = true;
  }

  // -------------------------------------------------------------------------
  // Records: save / get / search / delete
  // -------------------------------------------------------------------------

  async saveMemory(input: SaveMemoryInput): Promise<string> {
    const now = new Date();
    const id = uuidv4();
    const record: MemoryRecord = {
      id,
      kind: input.kind,
      ownerId: input.ownerId,
      scope: input.scope,
      content: input.content,
      importance: clamp01(input.importance),
      tags: input.tags ?? [],
      provenance: {
        source: input.provenance.source,
        agentId: input.provenance.agentId,
        missionId: input.provenance.missionId,
        taskId: input.provenance.taskId,
        confidence: clamp01(input.provenance.confidence),
        evidence: input.provenance.evidence ?? [],
        successfulUses: 0,
      },
      relations: input.relations ?? [],
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(id, record);
    this.recordIds.push(id);
    await this.persistRecord(record);
    await this.persistIndex();
    return id;
  }

  async getMemory(id: string): Promise<MemoryRecord | null> {
    const cached = this.records.get(id);
    if (cached) return cached;
    if (this.persistence) {
      const rec = await this.persistence.get<MemoryRecord>(KEY_RECORD + id);
      if (rec) {
        rec.createdAt = new Date(rec.createdAt);
        rec.updatedAt = new Date(rec.updatedAt);
        this.records.set(id, rec);
        return rec;
      }
    }
    return null;
  }

  async deleteMemory(id: string): Promise<void> {
    this.records.delete(id);
    this.recordIds = this.recordIds.filter(x => x !== id);
    if (this.persistence) await this.persistence.delete(KEY_RECORD + id);
    await this.persistIndex();
  }

  /**
   * Ranked retrieval. Score = textMatch × importance × confidence × recency.
   * Scope visibility: a query with ownerId 'agent-x' can see 'private' records
   * owned by agent-x plus any 'shared'/'organization'/'system' records.
   */
  async searchMemory(query: MemoryQuery): Promise<MemoryRecord[]> {
    const candidates: MemoryRecord[] = [];
    for (const rec of this.records.values()) {
      if (!this.visibleTo(rec, query.ownerId)) continue;
      if (query.scope && rec.scope !== query.scope) continue;
      if (query.kind && rec.kind !== query.kind) continue;
      if (query.minImportance !== undefined && rec.importance < query.minImportance) continue;
      if (query.minConfidence !== undefined && rec.provenance.confidence < query.minConfidence) continue;
      if (query.tags && query.tags.length > 0 && !query.tags.every(t => rec.tags.includes(t))) continue;
      candidates.push(rec);
    }
    const terms = query.text ? tokenize(query.text) : [];
    const scored = candidates.map(rec => ({
      rec,
      score: this.score(rec, terms),
    }));
    // When a text query is supplied, drop records with zero textual overlap.
    const filtered = terms.length > 0 ? scored.filter(s => s.score > 0) : scored;
    filtered.sort((a, b) => b.score - a.score);
    const limit = query.limit ?? 10;
    return filtered.slice(0, limit).map(s => s.rec);
  }

  /** Convenience: text-only knowledge lookup, shared scope only. */
  async queryKnowledge(text: string, limit = 5): Promise<MemoryRecord[]> {
    return this.searchMemory({ text, scope: 'shared', limit });
  }

  // -------------------------------------------------------------------------
  // Relations
  // -------------------------------------------------------------------------

  async relate(id: string, relation: MemoryRelation, targetId: string): Promise<void> {
    const rec = this.records.get(id);
    if (!rec) throw new Error(`MemoryRuntime.relate: unknown record ${id}`);
    if (!this.records.has(targetId)) {
      throw new Error(`MemoryRuntime.relate: unknown target ${targetId}`);
    }
    if (rec.relations.some(r => r.relation === relation && r.targetId === targetId)) return;
    rec.relations.push({ relation, targetId });
    rec.updatedAt = new Date();
    await this.persistRecord(rec);
  }

  relationsOf(id: string): Array<{ relation: MemoryRelation; targetId: string }> {
    return this.records.get(id)?.relations ?? [];
  }

  /** Walk one hop in the relation graph. */
  neighbours(id: string, relation?: MemoryRelation): MemoryRecord[] {
    const rec = this.records.get(id);
    if (!rec) return [];
    return rec.relations
      .filter(r => !relation || r.relation === relation)
      .map(r => this.records.get(r.targetId))
      .filter((r): r is MemoryRecord => !!r);
  }

  // -------------------------------------------------------------------------
  // Use tracking + consolidation
  // -------------------------------------------------------------------------

  async recordUse(id: string, success: boolean): Promise<void> {
    const rec = this.records.get(id);
    if (!rec) return;
    if (success) {
      rec.provenance.successfulUses += 1;
      rec.provenance.confidence = clamp01(rec.provenance.confidence + 0.05);
      rec.provenance.lastValidatedAt = new Date();
      // Reinforce importance on successful use.
      rec.importance = clamp01(rec.importance + 0.02);
    } else {
      rec.provenance.confidence = clamp01(rec.provenance.confidence - 0.1);
      rec.importance = clamp01(rec.importance - 0.05);
    }
    rec.updatedAt = new Date();
    await this.persistRecord(rec);
  }

  /**
   * Apply time-based importance decay, prune records that have fallen below
   * the threshold, and promote records whose successful-use count qualifies
   * them for long-term retention.
   */
  async consolidate(): Promise<ConsolidationResult> {
    const start = Date.now();
    let pruned = 0;
    let promoted = 0;
    let decayed = 0;
    const now = Date.now();
    const halfLifeMs = this.decayHalfLifeDays * 24 * 60 * 60 * 1000;
    const toDelete: string[] = [];
    for (const rec of this.records.values()) {
      const ageMs = now - rec.updatedAt.getTime();
      if (ageMs <= 0) continue;
      // Exponential decay: importance *= 0.5 ^ (age / halfLife).
      const decay = Math.pow(0.5, ageMs / halfLifeMs);
      const before = rec.importance;
      rec.importance = clamp01(rec.importance * decay);
      if (rec.importance < before - 0.001) decayed++;
      if (rec.provenance.successfulUses >= this.promoteUses && rec.importance < 0.8) {
        rec.importance = 0.8;
        promoted++;
      }
      if (rec.importance < this.pruneThreshold) {
        toDelete.push(rec.id);
      } else {
        await this.persistRecord(rec);
      }
    }
    for (const id of toDelete) {
      await this.deleteMemory(id);
      pruned++;
    }
    await this.persistIndex();
    return { pruned, promoted, decayed, durationMs: Date.now() - start };
  }

  // -------------------------------------------------------------------------
  // Working memory (ephemeral, mission-scoped scratchpad)
  // -------------------------------------------------------------------------

  async setWorking(missionId: string, key: string, value: any): Promise<void> {
    if (!this.working.has(missionId)) this.working.set(missionId, new Map());
    this.working.get(missionId)!.set(key, value);
    if (this.persistence) {
      const k = KEY_WORKING + missionId;
      const existing = (await this.persistence.get<Record<string, any>>(k)) ?? {};
      existing[key] = value;
      await this.persistence.set(k, existing);
    }
  }

  async getWorking(missionId: string, key: string): Promise<any> {
    return this.working.get(missionId)?.get(key) ?? null;
  }

  async listWorking(missionId: string): Promise<Record<string, any>> {
    const m = this.working.get(missionId);
    return m ? Object.fromEntries(m) : {};
  }

  async clearWorking(missionId: string): Promise<void> {
    this.working.delete(missionId);
    if (this.persistence) await this.persistence.delete(KEY_WORKING + missionId);
  }

  // -------------------------------------------------------------------------
  // AgentDNA lifecycle
  // -------------------------------------------------------------------------

  async loadDNA(agentId: string): Promise<AgentDNA | null> {
    const cached = this.dna.get(agentId);
    if (cached) return cached;
    if (this.persistence) {
      const d = await this.persistence.get<AgentDNA>(KEY_DNA + agentId);
      if (d) {
        d.createdAt = new Date(d.createdAt);
        d.updatedAt = new Date(d.updatedAt);
        d.performance.lastUpdatedAt = new Date(d.performance.lastUpdatedAt);
        this.dna.set(agentId, d);
        return d;
      }
    }
    return null;
  }

  async saveDNA(dna: AgentDNA): Promise<void> {
    dna.updatedAt = new Date();
    this.dna.set(dna.agentId, dna);
    if (!this.dnaIds.includes(dna.agentId)) this.dnaIds.push(dna.agentId);
    if (this.persistence) await this.persistence.set(KEY_DNA + dna.agentId, dna);
    await this.persistDnaIndex();
  }

  async evolveDNA(agentId: string, event: EvolutionEvent): Promise<AgentDNA | null> {
    const d = await this.loadDNA(agentId);
    if (!d) return null;
    d.evolution.push(event);
    d.updatedAt = new Date();
    if (event.delta) {
      for (const [k, v] of Object.entries(event.delta)) {
        if (k in d.performance) {
          (d.performance as any)[k] = (d.performance as any)[k] + v;
        }
      }
    }
    await this.saveDNA(d);
    return d;
  }

  /** Apply a task outcome to an agent's performance record. */
  async updatePerformance(
    agentId: string,
    outcome: { success: boolean; durationMs: number; verified?: boolean; recovered?: boolean; escalated?: boolean }
  ): Promise<AgentDNA | null> {
    const d = await this.loadDNA(agentId);
    if (!d) return null;
    const p = d.performance;
    p.tasksAttempted += 1;
    if (outcome.success) p.tasksSucceeded += 1; else p.tasksFailed += 1;
    p.successRate = p.tasksAttempted === 0 ? 0 : p.tasksSucceeded / p.tasksAttempted;
    // Rolling average duration.
    p.averageDurationMs =
      (p.averageDurationMs * (p.tasksAttempted - 1) + outcome.durationMs) / p.tasksAttempted;
    if (outcome.verified) {
      // Track verification pass rate as a separate rolling stat.
      const verifiedAttempts = p.tasksSucceeded; // approximation: only successes carry verification
      p.verificationPassRate =
        verifiedAttempts === 0 ? 0 : (p.verificationPassRate * (verifiedAttempts - 1) + 1) / verifiedAttempts;
    }
    if (outcome.recovered) p.recoveries += 1;
    if (outcome.escalated) p.escalations += 1;
    p.lastUpdatedAt = new Date();
    await this.saveDNA(d);
    return d;
  }

  listDNA(): AgentDNA[] {
    return Array.from(this.dna.values());
  }

  // -------------------------------------------------------------------------
  // Stats + introspection
  // -------------------------------------------------------------------------

  getStats(): MemoryStats {
    const byKind: Record<string, number> = {};
    const byScope: Record<string, number> = {};
    let impSum = 0;
    let confSum = 0;
    for (const r of this.records.values()) {
      byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
      byScope[r.scope] = (byScope[r.scope] ?? 0) + 1;
      impSum += r.importance;
      confSum += r.provenance.confidence;
    }
    const n = this.records.size;
    return {
      recordCount: n,
      byKind,
      byScope,
      dnaCount: this.dna.size,
      workingScopes: this.working.size,
      avgImportance: n ? impSum / n : 0,
      avgConfidence: n ? confSum / n : 0,
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private visibleTo(rec: MemoryRecord, ownerId?: string): boolean {
    switch (rec.scope) {
      case 'system':
      case 'organization':
      case 'shared':
        return true;
      case 'private':
        return !ownerId || rec.ownerId === ownerId;
    }
  }

  private score(rec: MemoryRecord, terms: string[]): number {
    let textScore = 0;
    if (terms.length > 0) {
      const contentTokens = tokenize(rec.content + ' ' + rec.tags.join(' '));
      for (const t of terms) {
        if (contentTokens.includes(t)) textScore += 1;
        else if (contentTokens.some(c => c.includes(t) || t.includes(c))) textScore += 0.4;
      }
      textScore = Math.min(textScore / terms.length, 1);
    } else {
      textScore = 0.5; // neutral when no text query
    }
    const recency = recencyFactor(rec.updatedAt);
    return textScore * rec.importance * rec.provenance.confidence * recency;
  }

  private async persistRecord(rec: MemoryRecord): Promise<void> {
    if (this.persistence) await this.persistence.set(KEY_RECORD + rec.id, rec);
  }

  private async persistIndex(): Promise<void> {
    if (this.persistence) await this.persistence.set(KEY_INDEX, this.recordIds);
  }

  private async persistDnaIndex(): Promise<void> {
    if (this.persistence) await this.persistence.set(KEY_DNA_INDEX, this.dnaIds);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(t => t.length > 1);
}

/** 1.0 today, ~0.5 at 30 days, ~0.25 at 60 days — bounded to (0,1]. */
function recencyFactor(updatedAt: Date): number {
  const ageDays = (Date.now() - updatedAt.getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays <= 0) return 1;
  return Math.max(0.05, 1 / (1 + ageDays / 30));
}

/** Build a fresh PerformanceRecord with zeroed stats. */
export function emptyPerformance(): PerformanceRecord {
  return {
    tasksAttempted: 0,
    tasksSucceeded: 0,
    tasksFailed: 0,
    successRate: 0,
    averageDurationMs: 0,
    verificationPassRate: 0,
    recoveries: 0,
    escalations: 0,
    lastUpdatedAt: new Date(),
  };
}

/** Build a fresh AgentDNA suitable for `saveDNA`. */
export function freshDNA(input: {
  agentId: string;
  role: string;
  name: string;
  description: string;
  goals?: string[];
  skillIds?: string[];
  capabilityIds?: string[];
  permissions?: string[];
  personality?: string;
}): AgentDNA {
  const now = new Date();
  return {
    agentId: input.agentId,
    role: input.role,
    identity: {
      name: input.name,
      description: input.description,
      personality: input.personality,
    },
    goals: input.goals ?? [],
    skillIds: input.skillIds ?? [],
    capabilityIds: input.capabilityIds ?? [],
    permissions: input.permissions ?? [],
    performance: emptyPerformance(),
    evolution: [],
    createdAt: now,
    updatedAt: now,
  };
}

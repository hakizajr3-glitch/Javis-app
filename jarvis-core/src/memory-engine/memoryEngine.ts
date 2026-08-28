import { v4 as uuidv4 } from 'uuid';
import {
  MemoryTier,
  MemoryResult,
  MemoryFilter,
  ConsolidationResult,
  ArchivalResult,
} from './types.js';
import { eventBus, EventType } from '../observability/eventBus.js';

export class MemoryEngine {
  private workingMemory: Map<string, Map<string, any>> = new Map(); // missionId -> key -> value
  private organizationMemory: Map<string, Map<string, any>> = new Map(); // orgId -> key -> value
  private personalMemory: Map<string, Map<string, any>> = new Map(); // userId -> key -> value
  private metadata: Map<string, Map<string, any>> = new Map(); // tier -> id -> metadata
  private searchIndex: Map<string, string[]> = new Map(); // normalized term -> [key references]

  // Working Memory (mission-scoped)
  async setWorkingMemory(missionId: string, key: string, value: any): Promise<void> {
    if (!this.workingMemory.has(missionId)) {
      this.workingMemory.set(missionId, new Map());
    }
    this.workingMemory.get(missionId)!.set(key, value);

    // Store metadata
    this.storeMetadata('working', `${missionId}:${key}`, {
      missionId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Update search index
    this.updateSearchIndex(key, value);
  }

  async getWorkingMemory(missionId: string, key: string): Promise<any> {
    const missionMemory = this.workingMemory.get(missionId);
    return missionMemory?.get(key) || null;
  }

  async deleteWorkingMemory(missionId: string, key: string): Promise<void> {
    const missionMemory = this.workingMemory.get(missionId);
    if (missionMemory) {
      missionMemory.delete(key);
    }
  }

  async clearWorkingMemory(missionId: string): Promise<void> {
    this.workingMemory.delete(missionId);
  }

  async listWorkingMemory(missionId: string): Promise<Record<string, any>> {
    const missionMemory = this.workingMemory.get(missionId);
    return missionMemory ? Object.fromEntries(missionMemory) : {};
  }

  async searchWorkingMemory(missionId: string, query: string): Promise<MemoryResult[]> {
    const missionMemory = this.workingMemory.get(missionId);
    if (!missionMemory) return [];

    const results: MemoryResult[] = [];
    const queryTerms = this.normalizeQuery(query);

    for (const [key, value] of missionMemory.entries()) {
      const score = this.calculateRelevance(key, value, queryTerms);
      if (score > 0) {
        const metadata = this.getMetadata('working', `${missionId}:${key}`);
        results.push({
          tier: 'working',
          key,
          value,
          score,
          metadata: metadata || {
            createdAt: new Date(),
            updatedAt: new Date(),
            missionId,
          },
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  // Organization Memory (shared knowledge)
  async setOrganizationMemory(orgId: string, key: string, value: any): Promise<void> {
    if (!this.organizationMemory.has(orgId)) {
      this.organizationMemory.set(orgId, new Map());
    }
    this.organizationMemory.get(orgId)!.set(key, value);

    // Store metadata
    this.storeMetadata('organization', `${orgId}:${key}`, {
      orgId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Update search index
    this.updateSearchIndex(key, value);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.ARTIFACT_CREATED,
      payload: { orgId, key, action: 'org_memory_updated' },
      timestamp: new Date(),
      source: 'MemoryEngine',
    });
  }

  async getOrganizationMemory(orgId: string, key: string): Promise<any> {
    const orgMemory = this.organizationMemory.get(orgId);
    return orgMemory?.get(key) || null;
  }

  async deleteOrganizationMemory(orgId: string, key: string): Promise<void> {
    const orgMemory = this.organizationMemory.get(orgId);
    if (orgMemory) {
      orgMemory.delete(key);
    }
  }

  async searchOrganizationMemory(orgId: string, query: string): Promise<MemoryResult[]> {
    const orgMemory = this.organizationMemory.get(orgId);
    if (!orgMemory) return [];

    const results: MemoryResult[] = [];
    const queryTerms = this.normalizeQuery(query);

    for (const [key, value] of orgMemory.entries()) {
      const score = this.calculateRelevance(key, value, queryTerms);
      if (score > 0) {
        const metadata = this.getMetadata('organization', `${orgId}:${key}`);
        results.push({
          tier: 'organization',
          key,
          value,
          score,
          metadata: metadata || {
            createdAt: new Date(),
            updatedAt: new Date(),
            orgId,
          },
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  async listOrganizationMemory(orgId: string): Promise<Record<string, any>> {
    const orgMemory = this.organizationMemory.get(orgId);
    return orgMemory ? Object.fromEntries(orgMemory) : {};
  }

  // Personal Memory (user preferences)
  async setPersonalMemory(userId: string, key: string, value: any): Promise<void> {
    if (!this.personalMemory.has(userId)) {
      this.personalMemory.set(userId, new Map());
    }
    this.personalMemory.get(userId)!.set(key, value);

    // Store metadata
    this.storeMetadata('personal', `${userId}:${key}`, {
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Update search index
    this.updateSearchIndex(key, value);
  }

  async getPersonalMemory(userId: string, key: string): Promise<any> {
    const userMemory = this.personalMemory.get(userId);
    return userMemory?.get(key) || null;
  }

  async deletePersonalMemory(userId: string, key: string): Promise<void> {
    const userMemory = this.personalMemory.get(userId);
    if (userMemory) {
      userMemory.delete(key);
    }
  }

  async searchPersonalMemory(userId: string, query: string): Promise<MemoryResult[]> {
    const userMemory = this.personalMemory.get(userId);
    if (!userMemory) return [];

    const results: MemoryResult[] = [];
    const queryTerms = this.normalizeQuery(query);

    for (const [key, value] of userMemory.entries()) {
      const score = this.calculateRelevance(key, value, queryTerms);
      if (score > 0) {
        const metadata = this.getMetadata('personal', `${userId}:${key}`);
        results.push({
          tier: 'personal',
          key,
          value,
          score,
          metadata: metadata || {
            createdAt: new Date(),
            updatedAt: new Date(),
            userId,
          },
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  async listPersonalMemory(userId: string): Promise<Record<string, any>> {
    const userMemory = this.personalMemory.get(userId);
    return userMemory ? Object.fromEntries(userMemory) : {};
  }

  // Cross-Tier Search
  async searchAllMemory(query: string, filters?: MemoryFilter): Promise<MemoryResult[]> {
    const results: MemoryResult[] = [];
    const queryTerms = this.normalizeQuery(query);

    // Search working memory if not filtered out
    if (!filters || !filters.tier || filters.tier === 'working') {
      for (const [missionId, memory] of this.workingMemory.entries()) {
        if (filters?.missionId && filters.missionId !== missionId) continue;

        for (const [key, value] of memory.entries()) {
          const score = this.calculateRelevance(key, value, queryTerms);
          if (score > 0) {
            const metadata = this.getMetadata('working', `${missionId}:${key}`);
            results.push({
              tier: 'working',
              key,
              value,
              score,
              metadata: metadata || {
                createdAt: new Date(),
                updatedAt: new Date(),
                missionId,
              },
            });
          }
        }
      }
    }

    // Search organization memory if not filtered out
    if (!filters || !filters.tier || filters.tier === 'organization') {
      for (const [orgId, memory] of this.organizationMemory.entries()) {
        if (filters?.orgId && filters.orgId !== orgId) continue;

        for (const [key, value] of memory.entries()) {
          const score = this.calculateRelevance(key, value, queryTerms);
          if (score > 0) {
            const metadata = this.getMetadata('organization', `${orgId}:${key}`);
            results.push({
              tier: 'organization',
              key,
              value,
              score,
              metadata: metadata || {
                createdAt: new Date(),
                updatedAt: new Date(),
                orgId,
              },
            });
          }
        }
      }
    }

    // Search personal memory if not filtered out
    if (!filters || !filters.tier || filters.tier === 'personal') {
      for (const [userId, memory] of this.personalMemory.entries()) {
        if (filters?.userId && filters.userId !== userId) continue;

        for (const [key, value] of memory.entries()) {
          const score = this.calculateRelevance(key, value, queryTerms);
          if (score > 0) {
            const metadata = this.getMetadata('personal', `${userId}:${key}`);
            results.push({
              tier: 'personal',
              key,
              value,
              score,
              metadata: metadata || {
                createdAt: new Date(),
                updatedAt: new Date(),
                userId,
              },
            });
          }
        }
      }
    }

    // Apply date range filter
    if (filters?.dateRange) {
      return results.filter(r =>
        r.metadata.createdAt >= filters.dateRange!.start &&
        r.metadata.createdAt <= filters.dateRange!.end
      );
    }

    return results.sort((a, b) => b.score - a.score);
  }

  // Consolidation
  async consolidateMemory(tier: MemoryTier, before: Date): Promise<ConsolidationResult> {
    const startTime = Date.now();
    let itemsConsolidated = 0;
    let itemsArchived = 0;

    const memoryMap = this.getMemoryMap(tier);

    for (const [id, memory] of memoryMap.entries()) {
      const metadata = this.getMetadata(tier, id);
      if (metadata && metadata.createdAt < before) {
        // Check for duplicates
        const isDuplicate = this.checkDuplicate(memory, tier);
        if (isDuplicate) {
          itemsConsolidated++;
        } else {
          itemsArchived++;
        }
      }
    }

    return {
      itemsConsolidated,
      itemsArchived,
      spaceSaved: itemsConsolidated * 1024, // Estimate
      duration: Date.now() - startTime,
    };
  }

  async archiveMemory(tier: MemoryTier, before: Date): Promise<ArchivalResult> {
    const startTime = Date.now();
    let itemsArchived = 0;

    const memoryMap = this.getMemoryMap(tier);

    for (const [id] of memoryMap.entries()) {
      const metadata = this.getMetadata(tier, id);
      if (metadata && metadata.createdAt < before) {
        // In production, this would move to cold storage
        itemsArchived++;
      }
    }

    return {
      itemsArchived,
      archiveLocation: `archive/${tier}`,
      duration: Date.now() - startTime,
    };
  }

  // Helper methods
  private storeMetadata(tier: string, id: string, metadata: any): void {
    if (!this.metadata.has(tier)) {
      this.metadata.set(tier, new Map());
    }
    this.metadata.get(tier)!.set(id, {
      ...metadata,
      updatedAt: new Date(),
    });
  }

  private getMetadata(tier: string, id: string): any {
    const tierMetadata = this.metadata.get(tier);
    return tierMetadata?.get(id) || null;
  }

  private updateSearchIndex(key: string, value: any): void {
    const terms = this.extractTerms(key);
    if (typeof value === 'string') {
      terms.push(...this.extractTerms(value));
    }

    for (const term of terms) {
      const normalized = term.toLowerCase();
      if (!this.searchIndex.has(normalized)) {
        this.searchIndex.set(normalized, []);
      }
      this.searchIndex.get(normalized)!.push(key);
    }
  }

  private extractTerms(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  private normalizeQuery(query: string): string[] {
    return this.extractTerms(query);
  }

  private calculateRelevance(key: string, value: any, queryTerms: string[]): number {
    let score = 0;
    const keyTerms = this.extractTerms(key);
    const valueTerms = typeof value === 'string' ? this.extractTerms(value) : [];

    // Exact match
    for (const term of queryTerms) {
      if (keyTerms.includes(term)) score += 1.0;
      if (valueTerms.includes(term)) score += 0.8;
    }

    // Partial match
    for (const term of queryTerms) {
      for (const keyTerm of keyTerms) {
        if (keyTerm.includes(term) || term.includes(keyTerm)) score += 0.5;
      }
      for (const valueTerm of valueTerms) {
        if (valueTerm.includes(term) || term.includes(valueTerm)) score += 0.4;
      }
    }

    return Math.min(score, 1.0);
  }

  private getMemoryMap(tier: MemoryTier): Map<string, Map<string, any>> {
    switch (tier) {
      case 'working':
        return this.workingMemory;
      case 'organization':
        return this.organizationMemory;
      case 'personal':
        return this.personalMemory;
      default:
        return new Map();
    }
  }

  private checkDuplicate(memory: Map<string, any>, tier: MemoryTier): boolean {
    // Simple duplicate detection based on content hash
    // In production, use more sophisticated deduplication
    const content = JSON.stringify(Object.fromEntries(memory));
    const hash = this.simpleHash(content);

    // Check if this hash exists elsewhere
    for (const [id, mem] of this.getMemoryMap(tier).entries()) {
      if (id !== content) {
        const otherContent = JSON.stringify(Object.fromEntries(mem));
        if (this.simpleHash(otherContent) === hash) {
          return true;
        }
      }
    }

    return false;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }

  getStats() {
    return {
      workingMemoryCount: this.workingMemory.size,
      organizationMemoryCount: this.organizationMemory.size,
      personalMemoryCount: this.personalMemory.size,
      searchIndexSize: this.searchIndex.size,
      totalEntries:
        Array.from(this.workingMemory.values()).reduce((sum, m) => sum + m.size, 0) +
        Array.from(this.organizationMemory.values()).reduce((sum, m) => sum + m.size, 0) +
        Array.from(this.personalMemory.values()).reduce((sum, m) => sum + m.size, 0),
    };
  }

  exportState(): Record<string, any> {
    const mapToArray = (m: Map<string, Map<string, any>>) =>
      Array.from(m.entries()).map(([outerKey, innerMap]) => [outerKey, Array.from(innerMap.entries())]);
    return {
      workingMemory: mapToArray(this.workingMemory),
      organizationMemory: mapToArray(this.organizationMemory),
      personalMemory: mapToArray(this.personalMemory),
      metadata: mapToArray(this.metadata),
      searchIndex: Array.from(this.searchIndex.entries()),
    };
  }

  importState(state: Record<string, any>): void {
    const arrayToMap = (arr: [string, [string, any][]][]) => {
      const m = new Map<string, Map<string, any>>();
      for (const [outerKey, innerArr] of arr) {
        m.set(outerKey, new Map(innerArr));
      }
      return m;
    };
    this.workingMemory = arrayToMap(state.workingMemory || []);
    this.organizationMemory = arrayToMap(state.organizationMemory || []);
    this.personalMemory = arrayToMap(state.personalMemory || []);
    this.metadata = arrayToMap(state.metadata || []);
    this.searchIndex = new Map((state.searchIndex || []).map(([k, v]: [string, string[]]) => [k, v]));
  }
}

// Singleton instance
export const memoryEngine = new MemoryEngine();

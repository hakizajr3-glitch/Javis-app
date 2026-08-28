import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import {
  ArtifactId,
  Artifact,
  ArtifactMetadata,
  Relation,
  Version,
  RenderResult,
  ArtifactFilter,
  SearchQuery,
} from './types.js';
import { eventBus, EventType } from '../observability/eventBus.js';

export class MyAIDocs {
  private artifacts: Map<ArtifactId, Artifact> = new Map();
  private relations: Map<string, Relation> = new Map(); // fromId:toId -> Relation
  private versions: Map<ArtifactId, Version[]> = new Map();
  private searchIndex: Map<string, Set<ArtifactId>> = new Map(); // term -> artifact IDs

  // Artifact Management
  async createArtifact(artifact: Omit<Artifact, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<ArtifactId> {
    const artifactId = uuidv4() as ArtifactId;
    const checksum = this.calculateChecksum(artifact.content);

    const newArtifact: Artifact = {
      ...artifact,
      id: artifactId,
      metadata: {
        ...artifact.metadata,
        checksum,
        size: artifact.content.length,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0.0',
    };

    this.artifacts.set(artifactId, newArtifact);
    this.versions.set(artifactId, [
      {
        version: '1.0.0',
        artifactId,
        content: artifact.content,
        metadata: newArtifact.metadata,
        createdAt: new Date(),
        createdBy: artifact.createdBy,
      },
    ]);

    // Update search index
    this.updateSearchIndex(artifactId, newArtifact);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.ARTIFACT_CREATED,
      payload: { artifactId, artifact: newArtifact },
      timestamp: new Date(),
      source: 'MyAIDocs',
      correlationId: artifact.createdBy,
    });

    return artifactId;
  }

  async getArtifact(artifactId: ArtifactId): Promise<Artifact | null> {
    return this.artifacts.get(artifactId) || null;
  }

  async updateArtifact(artifactId: ArtifactId, updates: Partial<Artifact>): Promise<void> {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    // Create new version if content changed
    if (updates.content) {
      const currentVersion = artifact.version;
      const [major, minor, patch] = currentVersion.split('.').map(Number);
      const newVersion = `${major}.${minor}.${patch + 1}`;

      const newVersionEntry: Version = {
        version: newVersion,
        artifactId,
        content: updates.content,
        metadata: updates.metadata || artifact.metadata,
        createdAt: new Date(),
        createdBy: updates.createdBy || artifact.createdBy,
      };

      const versions = this.versions.get(artifactId) || [];
      versions.push(newVersionEntry);
      this.versions.set(artifactId, versions);

      artifact.version = newVersion;
    }

    const updatedArtifact: Artifact = {
      ...artifact,
      ...updates,
      updatedAt: new Date(),
    };

    if (updates.content) {
      updatedArtifact.metadata = {
        ...updatedArtifact.metadata,
        checksum: this.calculateChecksum(updates.content),
        size: updates.content.length,
      };
    }

    this.artifacts.set(artifactId, updatedArtifact);

    // Update search index if name or content changed
    if (updates.name || updates.content) {
      this.updateSearchIndex(artifactId, updatedArtifact);
    }

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.ARTIFACT_UPDATED,
      payload: { artifactId, artifact: updatedArtifact },
      timestamp: new Date(),
      source: 'MyAIDocs',
    });
  }

  async deleteArtifact(artifactId: ArtifactId): Promise<void> {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    // Remove from search index
    this.removeFromSearchIndex(artifactId);

    // Remove relations
    for (const [key, relation] of this.relations.entries()) {
      if (relation.fromId === artifactId || relation.toId === artifactId) {
        this.relations.delete(key);
      }
    }

    // Remove versions
    this.versions.delete(artifactId);

    // Remove artifact
    this.artifacts.delete(artifactId);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.ARTIFACT_DELETED,
      payload: { artifactId },
      timestamp: new Date(),
      source: 'MyAIDocs',
    });
  }

  async listArtifacts(filter?: ArtifactFilter): Promise<Artifact[]> {
    let artifacts = Array.from(this.artifacts.values());

    if (filter) {
      if (filter.type) {
        artifacts = artifacts.filter(a => a.type === filter.type);
      }
      if (filter.tags && filter.tags.length > 0) {
        artifacts = artifacts.filter(a =>
          filter.tags!.every(tag => a.tags.includes(tag))
        );
      }
      if (filter.missionId) {
        artifacts = artifacts.filter(a => a.missionId === filter.missionId);
      }
      if (filter.projectId) {
        artifacts = artifacts.filter(a => a.projectId === filter.projectId);
      }
      if (filter.organizationId) {
        artifacts = artifacts.filter(a => a.organizationId === filter.organizationId);
      }
      if (filter.createdBy) {
        artifacts = artifacts.filter(a => a.createdBy === filter.createdBy);
      }
      if (filter.dateRange) {
        artifacts = artifacts.filter(a =>
          a.createdAt >= filter.dateRange!.start &&
          a.createdAt <= filter.dateRange!.end
        );
      }
    }

    return artifacts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Relationships
  async addRelation(fromId: ArtifactId, toId: ArtifactId, relation: string, createdBy: string): Promise<void> {
    const key = `${fromId}:${toId}`;
    
    // Check for circular dependencies
    if (await this.wouldCreateCycle(fromId, toId)) {
      throw new Error('Adding this relation would create a circular dependency');
    }

    const newRelation: Relation = {
      fromId,
      toId,
      relation,
      createdAt: new Date(),
      createdBy,
    };

    this.relations.set(key, newRelation);
  }

  async removeRelation(fromId: ArtifactId, toId: ArtifactId): Promise<void> {
    const key = `${fromId}:${toId}`;
    this.relations.delete(key);
  }

  async getArtifactRelations(artifactId: ArtifactId): Promise<Relation[]> {
    const relations: Relation[] = [];

    for (const relation of this.relations.values()) {
      if (relation.fromId === artifactId || relation.toId === artifactId) {
        relations.push(relation);
      }
    }

    return relations;
  }

  async getRelatedArtifacts(artifactId: ArtifactId, relationType?: string): Promise<Artifact[]> {
    const relatedIds = new Set<ArtifactId>();

    for (const [key, relation] of this.relations.entries()) {
      if (relation.fromId === artifactId) {
        if (!relationType || relation.relation === relationType) {
          relatedIds.add(relation.toId);
        }
      }
    }

    const artifacts: Artifact[] = [];
    for (const id of relatedIds) {
      const artifact = this.artifacts.get(id);
      if (artifact) {
        artifacts.push(artifact);
      }
    }

    return artifacts;
  }

  // Version History
  async getArtifactVersions(artifactId: ArtifactId): Promise<Version[]> {
    return this.versions.get(artifactId) || [];
  }

  async getArtifactVersion(artifactId: ArtifactId, version: string): Promise<Version | null> {
    const versions = this.versions.get(artifactId);
    if (!versions) return null;

    return versions.find(v => v.version === version) || null;
  }

  async restoreArtifactVersion(artifactId: ArtifactId, version: string): Promise<void> {
    const versionEntry = await this.getArtifactVersion(artifactId, version);
    if (!versionEntry) {
      throw new Error(`Version not found: ${version}`);
    }

    const artifact = this.artifacts.get(artifactId);
    if (!artifact) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    // Create new version for the restore
    const currentVersion = artifact.version;
    const [major, minor, patch] = currentVersion.split('.').map(Number);
    const newVersion = `${major}.${minor}.${patch + 1}`;

    const newVersionEntry: Version = {
      version: newVersion,
      artifactId,
      content: versionEntry.content,
      metadata: versionEntry.metadata,
      createdAt: new Date(),
      createdBy: artifact.createdBy,
      changeDescription: `Restored from version ${version}`,
    };

    const versions = this.versions.get(artifactId) || [];
    versions.push(newVersionEntry);
    this.versions.set(artifactId, versions);

    // Update artifact
    const updatedArtifact: Artifact = {
      ...artifact,
      content: versionEntry.content,
      metadata: versionEntry.metadata,
      version: newVersion,
      updatedAt: new Date(),
    };

    this.artifacts.set(artifactId, updatedArtifact);
  }

  async compareArtifactVersions(artifactId: ArtifactId, version1: string, version2: string): Promise<any> {
    const v1 = await this.getArtifactVersion(artifactId, version1);
    const v2 = await this.getArtifactVersion(artifactId, version2);

    if (!v1 || !v2) {
      throw new Error('One or both versions not found');
    }

    // Simple diff for text content
    if (Buffer.isBuffer(v1.content) && Buffer.isBuffer(v2.content)) {
      const text1 = v1.content.toString('utf-8');
      const text2 = v2.content.toString('utf-8');
      return {
        version1: v1.version,
        version2: v2.version,
        changes: this.calculateTextDiff(text1, text2),
        metadataDiff: this.calculateMetadataDiff(v1.metadata, v2.metadata),
      };
    }

    // For binary content, just return metadata comparison
    return {
      version1: v1.version,
      version2: v2.version,
      metadataDiff: this.calculateMetadataDiff(v1.metadata, v2.metadata),
    };
  }

  // Search
  async searchArtifacts(query: SearchQuery): Promise<Artifact[]> {
    const queryTerms = this.extractTerms(query.query);
    const matchingIds = new Set<ArtifactId>();

    for (const term of queryTerms) {
      const ids = this.searchIndex.get(term.toLowerCase());
      if (ids) {
        for (const id of ids) {
          matchingIds.add(id);
        }
      }
    }

    let artifacts: Artifact[] = [];
    for (const id of matchingIds) {
      const artifact = this.artifacts.get(id);
      if (artifact) {
        artifacts.push(artifact);
      }
    }

    // Apply filters
    if (query.filters) {
      artifacts = this.filterArtifacts(artifacts, query.filters);
    }

    // Calculate relevance scores and sort
    const scoredArtifacts = artifacts.map(artifact => ({
      artifact,
      score: this.calculateRelevance(artifact, queryTerms),
    }));

    scoredArtifacts.sort((a, b) => b.score - a.score);

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 50;
    const paginated = scoredArtifacts.slice(offset, offset + limit);

    return paginated.map(item => item.artifact);
  }

  async fullTextSearch(query: string, filters?: ArtifactFilter): Promise<Artifact[]> {
    return this.searchArtifacts({ query, filters });
  }

  // Visual Rendering
  async renderVisualArtifact(artifactId: ArtifactId): Promise<RenderResult> {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    // In production, this would use actual rendering libraries
    // For now, return the content as-is
    return {
      rendered: artifact.content,
      format: 'png',
      metadata: {
        width: 1024,
        height: 768,
      },
    };
  }

  async generateThumbnail(artifactId: ArtifactId): Promise<Buffer> {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    // In production, this would generate actual thumbnails
    // For now, return a placeholder
    return Buffer.from('thumbnail-placeholder');
  }

  async extractMetadata(artifactId: ArtifactId): Promise<ArtifactMetadata> {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    return artifact.metadata;
  }

  // Helper methods
  private calculateChecksum(content: Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private updateSearchIndex(artifactId: ArtifactId, artifact: Artifact): void {
    // Remove old index entries
    this.removeFromSearchIndex(artifactId);

    // Add new entries
    const terms = this.extractTerms(artifact.name);
    terms.push(...this.extractTerms(artifact.metadata.description || ''));

    for (const tag of artifact.tags) {
      terms.push(...this.extractTerms(tag));
    }

    for (const term of terms) {
      const normalized = term.toLowerCase();
      if (!this.searchIndex.has(normalized)) {
        this.searchIndex.set(normalized, new Set());
      }
      this.searchIndex.get(normalized)!.add(artifactId);
    }
  }

  private removeFromSearchIndex(artifactId: ArtifactId): void {
    for (const [term, ids] of this.searchIndex.entries()) {
      ids.delete(artifactId);
      if (ids.size === 0) {
        this.searchIndex.delete(term);
      }
    }
  }

  private extractTerms(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  private calculateRelevance(artifact: Artifact, queryTerms: string[]): number {
    let score = 0;
    const nameTerms = this.extractTerms(artifact.name);
    const descTerms = this.extractTerms(artifact.metadata.description || '');
    const tagTerms = artifact.tags.flatMap(t => this.extractTerms(t));

    // Exact match in name
    for (const term of queryTerms) {
      if (nameTerms.includes(term)) score += 1.0;
      if (descTerms.includes(term)) score += 0.7;
      if (tagTerms.includes(term)) score += 0.9;
    }

    // Partial match
    for (const term of queryTerms) {
      for (const nameTerm of nameTerms) {
        if (nameTerm.includes(term) || term.includes(nameTerm)) score += 0.5;
      }
    }

    return Math.min(score, 1.0);
  }

  private filterArtifacts(artifacts: Artifact[], filters: ArtifactFilter): Artifact[] {
    let filtered = artifacts;

    if (filters.type) {
      filtered = filtered.filter(a => a.type === filters.type);
    }
    if (filters.tags && filters.tags.length > 0) {
      filtered = filtered.filter(a =>
        filters.tags!.every(tag => a.tags.includes(tag))
      );
    }
    if (filters.missionId) {
      filtered = filtered.filter(a => a.missionId === filters.missionId);
    }
    if (filters.projectId) {
      filtered = filtered.filter(a => a.projectId === filters.projectId);
    }
    if (filters.organizationId) {
      filtered = filtered.filter(a => a.organizationId === filters.organizationId);
    }
    if (filters.createdBy) {
      filtered = filtered.filter(a => a.createdBy === filters.createdBy);
    }
    if (filters.dateRange) {
      filtered = filtered.filter(a =>
        a.createdAt >= filters.dateRange!.start &&
        a.createdAt <= filters.dateRange!.end
      );
    }

    return filtered;
  }

  private async wouldCreateCycle(fromId: ArtifactId, toId: ArtifactId): Promise<boolean> {
    // Use DFS to detect cycles
    const visited = new Set<ArtifactId>();
    const stack = [toId];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === fromId) {
        return true;
      }
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      // Get all artifacts that current depends on
      for (const [key, relation] of this.relations.entries()) {
        if (relation.fromId === current && relation.relation === 'depends_on') {
          stack.push(relation.toId);
        }
      }
    }

    return false;
  }

  private calculateTextDiff(text1: string, text2: string): any {
    // Simple line-by-line diff
    const lines1 = text1.split('\n');
    const lines2 = text2.split('\n');
    const maxLines = Math.max(lines1.length, lines2.length);

    const changes: any[] = [];
    for (let i = 0; i < maxLines; i++) {
      const line1 = lines1[i] || '';
      const line2 = lines2[i] || '';
      if (line1 !== line2) {
        changes.push({
          line: i + 1,
          old: line1,
          new: line2,
        });
      }
    }

    return changes;
  }

  private calculateMetadataDiff(meta1: ArtifactMetadata, meta2: ArtifactMetadata): any {
    const diff: any = {};
    for (const key of Object.keys(meta1)) {
      if (meta1[key as keyof ArtifactMetadata] !== meta2[key as keyof ArtifactMetadata]) {
        diff[key] = {
          old: meta1[key as keyof ArtifactMetadata],
          new: meta2[key as keyof ArtifactMetadata],
        };
      }
    }
    return diff;
  }

  getStats() {
    return {
      totalArtifacts: this.artifacts.size,
      totalRelations: this.relations.size,
      totalVersions: Array.from(this.versions.values()).reduce((sum, v) => sum + v.length, 0),
      searchIndexSize: this.searchIndex.size,
      artifactsByType: this.getArtifactsByType(),
    };
  }

  private getArtifactsByType(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const artifact of this.artifacts.values()) {
      counts[artifact.type] = (counts[artifact.type] || 0) + 1;
    }
    return counts;
  }

  exportState(): Record<string, any> {
    const setSearchIndex = (m: Map<string, Set<ArtifactId>>) =>
      Array.from(m.entries()).map(([k, v]) => [k, Array.from(v)]);
    return {
      artifacts: Array.from(this.artifacts.entries()),
      relations: Array.from(this.relations.entries()),
      versions: Array.from(this.versions.entries()),
      searchIndex: setSearchIndex(this.searchIndex),
    };
  }

  importState(state: Record<string, any>): void {
    this.artifacts = new Map(state.artifacts || []);
    this.relations = new Map(state.relations || []);
    this.versions = new Map(state.versions || []);
    this.searchIndex = new Map(
      (state.searchIndex || []).map(([k, v]: [string, string[]]) => [k, new Set(v)])
    );
  }
}

// Singleton instance
export const myAIDocs = new MyAIDocs();

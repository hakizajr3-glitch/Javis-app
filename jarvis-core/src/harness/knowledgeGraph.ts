/**
 * Knowledge Graph — entities and relationships connecting people, projects,
 * missions, tasks, agents, artifacts, skills, conversations, decisions, and
 * memories.
 *
 * Per the master spec (Section 15):
 *   "Knowledge Graph: entities and relationships connect people, projects,
 *    missions, tasks, agents, artifacts, skills, conversations, decisions,
 *    and memories. Relationships can include supports, contradicts,
 *    derived-from, depends-on, created-by, and related-to."
 */
import { v4 as uuidv4 } from 'uuid';
import { eventBus, EventType } from '../observability/eventBus.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EntityId = string;
export type RelationshipId = string;

export type EntityType =
  | 'person' | 'project' | 'mission' | 'task' | 'agent'
  | 'artifact' | 'skill' | 'conversation' | 'decision' | 'memory'
  | 'device' | 'organization' | 'department' | 'team' | 'event'
  | 'document' | 'note' | 'connector' | 'model' | 'tool';

export type RelationshipType =
  | 'supports' | 'contradicts' | 'derived-from' | 'depends-on'
  | 'created-by' | 'related-to' | 'assigned-to' | 'part-of'
  | 'uses' | 'produces' | 'consumes' | 'references' | 'replaces'
  | 'parent-of' | 'child-of' | 'member-of' | 'owns' | 'manages'
  | 'collaborates-with' | 'reviewed-by' | 'verified-by' | 'blocks';

export interface GraphEntity {
  id: EntityId;
  type: EntityType;
  name: string;
  description?: string;
  /** Arbitrary metadata. */
  properties: Record<string, any>;
  /** Tags for quick filtering. */
  tags: string[];
  /** Owner/user ID. */
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GraphRelationship {
  id: RelationshipId;
  sourceId: EntityId;
  targetId: EntityId;
  type: RelationshipType;
  /** Strength: 0..1 — how strong is this relationship. */
  strength: number;
  /** Evidence backing this relationship. */
  evidence?: string;
  /** When this relationship was established. */
  createdAt: Date;
  /** Properties. */
  properties: Record<string, any>;
}

export interface GraphQuery {
  /** Filter by entity type. */
  type?: EntityType;
  /** Filter by tags. */
  tags?: string[];
  /** Full-text search on name/description. */
  search?: string;
  /** Filter by owner. */
  ownerId?: string;
  /** Limit results. */
  limit?: number;
}

export interface GraphTraversal {
  startId: EntityId;
  /** Relationship types to follow (empty = all). */
  relationshipTypes?: RelationshipType[];
  /** Max depth (default 2). */
  maxDepth?: number;
  /** Direction: 'outgoing', 'incoming', or 'both'. */
  direction?: 'outgoing' | 'incoming' | 'both';
}

export interface TraversalResult {
  entity: GraphEntity;
  depth: number;
  path: { entityId: EntityId; relationshipType: RelationshipType }[];
}

// ---------------------------------------------------------------------------
// Knowledge Graph
// ---------------------------------------------------------------------------

export class KnowledgeGraph {
  private entities: Map<EntityId, GraphEntity> = new Map();
  private relationships: Map<RelationshipId, GraphRelationship> = new Map();
  /** Index: entity → outgoing relationships. */
  private outgoing: Map<EntityId, Set<RelationshipId>> = new Map();
  /** Index: entity → incoming relationships. */
  private incoming: Map<EntityId, Set<RelationshipId>> = new Map();
  /** Index: type → entities. */
  private byType: Map<EntityType, Set<EntityId>> = new Map();
  /** Index: tag → entities. */
  private byTag: Map<string, Set<EntityId>> = new Map();

  // ── Entity operations ────────────────────────────────────────────────

  createEntity(input: {
    type: EntityType;
    name: string;
    description?: string;
    properties?: Record<string, any>;
    tags?: string[];
    ownerId?: string;
  }): GraphEntity {
    const id = uuidv4();
    const now = new Date();
    const entity: GraphEntity = {
      id,
      type: input.type,
      name: input.name,
      description: input.description,
      properties: input.properties ?? {},
      tags: input.tags ?? [],
      ownerId: input.ownerId ?? 'system',
      createdAt: now,
      updatedAt: now,
    };

    this.entities.set(id, entity);

    // Update indexes
    if (!this.byType.has(entity.type)) this.byType.set(entity.type, new Set());
    this.byType.get(entity.type)!.add(id);

    for (const tag of entity.tags) {
      if (!this.byTag.has(tag)) this.byTag.set(tag, new Set());
      this.byTag.get(tag)!.add(id);
    }

    eventBus.publish({
      id: uuidv4(),
      type: EventType.ARTIFACT_CREATED,
      payload: { kind: 'kg-entity', entityId: id, type: entity.type, name: entity.name },
      timestamp: now,
      source: 'KnowledgeGraph',
    });

    return entity;
  }

  getEntity(id: EntityId): GraphEntity | undefined {
    return this.entities.get(id);
  }

  updateEntity(id: EntityId, updates: Partial<Pick<GraphEntity, 'name' | 'description' | 'properties' | 'tags'>>): GraphEntity | undefined {
    const entity = this.entities.get(id);
    if (!entity) return undefined;

    if (updates.name !== undefined) entity.name = updates.name;
    if (updates.description !== undefined) entity.description = updates.description;
    if (updates.properties) entity.properties = { ...entity.properties, ...updates.properties };
    if (updates.tags) {
      // Remove old tags from index
      for (const oldTag of entity.tags) {
        this.byTag.get(oldTag)?.delete(id);
      }
      entity.tags = updates.tags;
      // Add new tags to index
      for (const newTag of entity.tags) {
        if (!this.byTag.has(newTag)) this.byTag.set(newTag, new Set());
        this.byTag.get(newTag)!.add(id);
      }
    }
    entity.updatedAt = new Date();
    return entity;
  }

  deleteEntity(id: EntityId): boolean {
    const entity = this.entities.get(id);
    if (!entity) return false;

    // Remove all relationships involving this entity
    const outRels = this.outgoing.get(id) ?? new Set();
    const inRels = this.incoming.get(id) ?? new Set();
    for (const relId of [...outRels, ...inRels]) {
      this.deleteRelationship(relId);
    }

    // Remove from indexes
    this.byType.get(entity.type)?.delete(id);
    for (const tag of entity.tags) {
      this.byTag.get(tag)?.delete(id);
    }

    this.entities.delete(id);
    this.outgoing.delete(id);
    this.incoming.delete(id);
    return true;
  }

  // ── Relationship operations ──────────────────────────────────────────

  createRelationship(input: {
    sourceId: EntityId;
    targetId: EntityId;
    type: RelationshipType;
    strength?: number;
    evidence?: string;
    properties?: Record<string, any>;
  }): GraphRelationship | undefined {
    if (!this.entities.has(input.sourceId) || !this.entities.has(input.targetId)) {
      return undefined;
    }

    const id = uuidv4();
    const rel: GraphRelationship = {
      id,
      sourceId: input.sourceId,
      targetId: input.targetId,
      type: input.type,
      strength: input.strength ?? 1.0,
      evidence: input.evidence,
      createdAt: new Date(),
      properties: input.properties ?? {},
    };

    this.relationships.set(id, rel);

    // Update indexes
    if (!this.outgoing.has(rel.sourceId)) this.outgoing.set(rel.sourceId, new Set());
    this.outgoing.get(rel.sourceId)!.add(id);
    if (!this.incoming.has(rel.targetId)) this.incoming.set(rel.targetId, new Set());
    this.incoming.get(rel.targetId)!.add(id);

    return rel;
  }

  getRelationship(id: RelationshipId): GraphRelationship | undefined {
    return this.relationships.get(id);
  }

  deleteRelationship(id: RelationshipId): boolean {
    const rel = this.relationships.get(id);
    if (!rel) return false;
    this.outgoing.get(rel.sourceId)?.delete(id);
    this.incoming.get(rel.targetId)?.delete(id);
    this.relationships.delete(id);
    return true;
  }

  // ── Query operations ─────────────────────────────────────────────────

  query(query: GraphQuery): GraphEntity[] {
    let candidates: Set<EntityId>;

    // Start with type filter or all entities
    if (query.type) {
      candidates = new Set(this.byType.get(query.type) ?? []);
    } else {
      candidates = new Set(this.entities.keys());
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      for (const tag of query.tags) {
        const tagEntities = this.byTag.get(tag);
        if (tagEntities) {
          candidates = new Set([...candidates].filter(id => tagEntities.has(id)));
        } else {
          return []; // No entities with this tag
        }
      }
    }

    // Filter by owner
    if (query.ownerId) {
      candidates = new Set([...candidates].filter(id => {
        const e = this.entities.get(id);
        return e?.ownerId === query.ownerId;
      }));
    }

    // Filter by search text
    if (query.search) {
      const lower = query.search.toLowerCase();
      candidates = new Set([...candidates].filter(id => {
        const e = this.entities.get(id);
        if (!e) return false;
        return e.name.toLowerCase().includes(lower) ||
               (e.description?.toLowerCase().includes(lower) ?? false);
      }));
    }

    let results = [...candidates].map(id => this.entities.get(id)!).filter(Boolean);

    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Get relationships for an entity.
   */
  getRelationships(entityId: EntityId, direction: 'outgoing' | 'incoming' | 'both' = 'both'): GraphRelationship[] {
    const result: GraphRelationship[] = [];
    if (direction === 'outgoing' || direction === 'both') {
      for (const relId of this.outgoing.get(entityId) ?? []) {
        const rel = this.relationships.get(relId);
        if (rel) result.push(rel);
      }
    }
    if (direction === 'incoming' || direction === 'both') {
      for (const relId of this.incoming.get(entityId) ?? []) {
        const rel = this.relationships.get(relId);
        if (rel) result.push(rel);
      }
    }
    return result;
  }

  /**
   * Traverse the graph starting from an entity.
   */
  traverse(traversal: GraphTraversal): TraversalResult[] {
    const { startId, relationshipTypes, maxDepth = 2, direction = 'both' } = traversal;
    const visited = new Set<EntityId>();
    const results: TraversalResult[] = [];

    const queue: { entityId: EntityId; depth: number; path: { entityId: EntityId; relationshipType: RelationshipType }[] }[] = [
      { entityId: startId, depth: 0, path: [] },
    ];

    while (queue.length > 0) {
      const { entityId, depth, path } = queue.shift()!;
      if (visited.has(entityId)) continue;
      if (depth > maxDepth) continue;
      visited.add(entityId);

      const entity = this.entities.get(entityId);
      if (!entity) continue;

      results.push({ entity, depth, path });

      if (depth >= maxDepth) continue;

      // Get relationships
      const rels = this.getRelationships(entityId, direction);
      for (const rel of rels) {
        if (relationshipTypes && relationshipTypes.length > 0 && !relationshipTypes.includes(rel.type)) {
          continue;
        }
        const nextEntityId = rel.sourceId === entityId ? rel.targetId : rel.sourceId;
        if (!visited.has(nextEntityId)) {
          queue.push({
            entityId: nextEntityId,
            depth: depth + 1,
            path: [...path, { entityId: nextEntityId, relationshipType: rel.type }],
          });
        }
      }
    }

    return results;
  }

  /**
   * Find the shortest path between two entities.
   */
  findPath(fromId: EntityId, toId: EntityId, maxDepth = 5): TraversalResult[] | null {
    const results = this.traverse({ startId: fromId, maxDepth, direction: 'both' });
    const target = results.find(r => r.entity.id === toId);
    if (!target) return null;
    // Reconstruct path
    const path: TraversalResult[] = [];
    let current = target;
    while (current) {
      path.unshift(current);
      if (current.depth === 0) break;
      // Find predecessor
      const prevEntityId = current.path[current.path.length - 1]?.entityId;
      if (!prevEntityId) break;
      current = results.find(r => r.entity.id === prevEntityId && r.depth === current!.depth - 1)!;
    }
    return path;
  }

  /**
   * Get entities related to a given entity by a specific relationship type.
   */
  getRelated(entityId: EntityId, relType: RelationshipType): GraphEntity[] {
    const rels = this.getRelationships(entityId, 'both');
    const result: GraphEntity[] = [];
    for (const rel of rels) {
      if (rel.type !== relType) continue;
      const otherId = rel.sourceId === entityId ? rel.targetId : rel.sourceId;
      const entity = this.entities.get(otherId);
      if (entity) result.push(entity);
    }
    return result;
  }

  // ── Stats ────────────────────────────────────────────────────────────

  getStats(): { entities: number; relationships: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    for (const [type, ids] of this.byType) {
      byType[type] = ids.size;
    }
    return {
      entities: this.entities.size,
      relationships: this.relationships.size,
      byType,
    };
  }

  // ── Export/Import ────────────────────────────────────────────────────

  exportGraph(): { entities: GraphEntity[]; relationships: GraphRelationship[] } {
    return {
      entities: Array.from(this.entities.values()),
      relationships: Array.from(this.relationships.values()),
    };
  }

  importGraph(data: { entities: GraphEntity[]; relationships: GraphRelationship[] }): void {
    for (const entity of data.entities) {
      this.entities.set(entity.id, entity);
      if (!this.byType.has(entity.type)) this.byType.set(entity.type, new Set());
      this.byType.get(entity.type)!.add(entity.id);
      for (const tag of entity.tags) {
        if (!this.byTag.has(tag)) this.byTag.set(tag, new Set());
        this.byTag.get(tag)!.add(entity.id);
      }
    }
    for (const rel of data.relationships) {
      this.relationships.set(rel.id, rel);
      if (!this.outgoing.has(rel.sourceId)) this.outgoing.set(rel.sourceId, new Set());
      this.outgoing.get(rel.sourceId)!.add(rel.id);
      if (!this.incoming.has(rel.targetId)) this.incoming.set(rel.targetId, new Set());
      this.incoming.get(rel.targetId)!.add(rel.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const knowledgeGraph = new KnowledgeGraph();

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentFactory, DEPARTMENTS } from './agentFactory.js';
import { KnowledgeGraph } from './knowledgeGraph.js';
import { WorkspaceManager } from './workspaceManager.js';

// ── Agent Factory Tests ──────────────────────────────────────────────────

describe('AgentFactory', () => {
  let factory: AgentFactory;

  beforeEach(() => {
    factory = new AgentFactory();
  });

  it('creates an agent with default role for a department', async () => {
    const created = await factory.createAgent({
      department: 'software',
    });
    expect(created.agentId).toBeDefined();
    expect(created.dna.role).toBe('Architect'); // First role in software dept
    expect(created.dna.identity.name).toBe('Architect');
    expect(created.dna.capabilityIds).toContain('code:read');
    expect(created.dna.permissions.length).toBeGreaterThan(0);
    expect(created.dna.performance.successRate).toBe(1.0);
    expect(created.dna.evolution.length).toBe(1);
  });

  it('creates an agent with a specific role', async () => {
    const created = await factory.createAgent({
      department: 'software',
      role: 'Builder',
    });
    expect(created.dna.role).toBe('Builder');
    expect(created.dna.identity.name).toBe('Builder');
    expect(created.dna.capabilityIds).toContain('code:write');
  });

  it('creates an agent with custom name and goals', async () => {
    const created = await factory.createAgent({
      department: 'executive',
      role: 'Commander',
      name: 'JARVIS Prime',
      goals: ['Build the app', 'Deploy to production'],
    });
    expect(created.dna.identity.name).toBe('JARVIS Prime');
    expect(created.dna.goals).toEqual(['Build the app', 'Deploy to production']);
  });

  it('creates a full department team', async () => {
    const team = await factory.createDepartmentTeam('qa');
    expect(team.length).toBe(DEPARTMENTS.qa.roles.length);
    expect(team.every(a => a.department === 'qa')).toBe(true);
    const roleNames = team.map(a => a.roleName);
    expect(roleNames).toContain('QA Engineer');
    expect(roleNames).toContain('Testing Agent');
  });

  it('lists all departments', () => {
    const depts = factory.listDepartments();
    expect(depts.length).toBe(16); // All 16 departments per spec
    const types = depts.map(d => d.type);
    expect(types).toContain('software');
    expect(types).toContain('research');
    expect(types).toContain('executive');
    expect(types).toContain('security');
    expect(types).toContain('data');
  });

  it('suggests department based on objective text', () => {
    expect(factory.suggestDepartment('build a web application')).toBe('software');
    expect(factory.suggestDepartment('research competitors in the market')).toBe('research');
    expect(factory.suggestDepartment('run a security audit')).toBe('security');
    expect(factory.suggestDepartment('create a marketing campaign')).toBe('marketing');
    expect(factory.suggestDepartment('deploy to production with CI/CD')).toBe('devops');
  });

  it('throws for unknown department', async () => {
    await expect(factory.createAgent({ department: 'nonexistent' as any }))
      .rejects.toThrow('Unknown department');
  });

  it('all 16 departments have at least one role', () => {
    for (const dept of Object.values(DEPARTMENTS)) {
      expect(dept.roles.length).toBeGreaterThan(0);
      expect(dept.name).toBeDefined();
      expect(dept.description).toBeDefined();
    }
  });
});

// ── Knowledge Graph Tests ────────────────────────────────────────────────

describe('KnowledgeGraph', () => {
  let kg: KnowledgeGraph;

  beforeEach(() => {
    kg = new KnowledgeGraph();
  });

  it('creates and retrieves entities', () => {
    const entity = kg.createEntity({
      type: 'project',
      name: 'JARVIS',
      description: 'Elite Agentic Harness',
      tags: ['ai', 'harness'],
    });
    expect(entity.id).toBeDefined();
    expect(kg.getEntity(entity.id)?.name).toBe('JARVIS');
  });

  it('creates and retrieves relationships', () => {
    const project = kg.createEntity({ type: 'project', name: 'Project A' });
    const mission = kg.createEntity({ type: 'mission', name: 'Mission 1' });
    const rel = kg.createRelationship({
      sourceId: mission.id,
      targetId: project.id,
      type: 'part-of',
    });
    expect(rel).toBeDefined();
    expect(rel!.type).toBe('part-of');
  });

  it('queries entities by type', () => {
    kg.createEntity({ type: 'project', name: 'P1' });
    kg.createEntity({ type: 'project', name: 'P2' });
    kg.createEntity({ type: 'mission', name: 'M1' });

    const projects = kg.query({ type: 'project' });
    expect(projects.length).toBe(2);
    const missions = kg.query({ type: 'mission' });
    expect(missions.length).toBe(1);
  });

  it('queries entities by tag', () => {
    kg.createEntity({ type: 'project', name: 'P1', tags: ['important', 'ai'] });
    kg.createEntity({ type: 'project', name: 'P2', tags: ['ai'] });
    kg.createEntity({ type: 'project', name: 'P3', tags: ['other'] });

    const aiProjects = kg.query({ tags: ['ai'] });
    expect(aiProjects.length).toBe(2);
    const importantAi = kg.query({ tags: ['important', 'ai'] });
    expect(importantAi.length).toBe(1);
  });

  it('queries entities by search text', () => {
    kg.createEntity({ type: 'project', name: 'JARVIS Harness', description: 'AI system' });
    kg.createEntity({ type: 'project', name: 'Other Project', description: 'unrelated' });

    const results = kg.query({ search: 'jarvis' });
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('JARVIS Harness');
  });

  it('gets relationships for an entity', () => {
    const a = kg.createEntity({ type: 'person', name: 'Alice' });
    const b = kg.createEntity({ type: 'project', name: 'Project X' });
    const c = kg.createEntity({ type: 'mission', name: 'Mission Y' });

    kg.createRelationship({ sourceId: a.id, targetId: b.id, type: 'created-by' });
    kg.createRelationship({ sourceId: a.id, targetId: c.id, type: 'manages' });

    const rels = kg.getRelationships(a.id, 'outgoing');
    expect(rels.length).toBe(2);
  });

  it('traverses the graph', () => {
    const a = kg.createEntity({ type: 'person', name: 'Alice' });
    const b = kg.createEntity({ type: 'project', name: 'Project' });
    const c = kg.createEntity({ type: 'mission', name: 'Mission' });
    const d = kg.createEntity({ type: 'task', name: 'Task' });

    kg.createRelationship({ sourceId: a.id, targetId: b.id, type: 'created-by' });
    kg.createRelationship({ sourceId: b.id, targetId: c.id, type: 'part-of' });
    kg.createRelationship({ sourceId: c.id, targetId: d.id, type: 'depends-on' });

    const traversal = kg.traverse({ startId: a.id, maxDepth: 3 });
    expect(traversal.length).toBe(4); // a, b, c, d
    expect(traversal[0].entity.id).toBe(a.id);
    expect(traversal[0].depth).toBe(0);
  });

  it('gets related entities by relationship type', () => {
    const project = kg.createEntity({ type: 'project', name: 'Project' });
    const m1 = kg.createEntity({ type: 'mission', name: 'M1' });
    const m2 = kg.createEntity({ type: 'mission', name: 'M2' });
    const agent = kg.createEntity({ type: 'agent', name: 'Agent1' });

    kg.createRelationship({ sourceId: m1.id, targetId: project.id, type: 'part-of' });
    kg.createRelationship({ sourceId: m2.id, targetId: project.id, type: 'part-of' });
    kg.createRelationship({ sourceId: agent.id, targetId: project.id, type: 'created-by' });

    const missions = kg.getRelated(project.id, 'part-of');
    expect(missions.length).toBe(2);
  });

  it('updates entities', () => {
    const entity = kg.createEntity({ type: 'project', name: 'Old Name' });
    kg.updateEntity(entity.id, { name: 'New Name', tags: ['updated'] });
    const updated = kg.getEntity(entity.id);
    expect(updated?.name).toBe('New Name');
    expect(updated?.tags).toContain('updated');
  });

  it('deletes entities and their relationships', () => {
    const a = kg.createEntity({ type: 'person', name: 'A' });
    const b = kg.createEntity({ type: 'project', name: 'B' });
    kg.createRelationship({ sourceId: a.id, targetId: b.id, type: 'created-by' });

    kg.deleteEntity(a.id);
    expect(kg.getEntity(a.id)).toBeUndefined();
    const rels = kg.getRelationships(b.id);
    expect(rels.length).toBe(0);
  });

  it('computes stats', () => {
    kg.createEntity({ type: 'project', name: 'P1' });
    kg.createEntity({ type: 'mission', name: 'M1' });
    const a = kg.createEntity({ type: 'agent', name: 'A1' });
    const b = kg.createEntity({ type: 'agent', name: 'A2' });
    kg.createRelationship({ sourceId: a.id, targetId: b.id, type: 'collaborates-with' });

    const stats = kg.getStats();
    expect(stats.entities).toBe(4);
    expect(stats.relationships).toBe(1);
    expect(stats.byType.agent).toBe(2);
  });

  it('exports and imports graph data', () => {
    kg.createEntity({ type: 'project', name: 'P1' });
    const data = kg.exportGraph();
    expect(data.entities.length).toBe(1);

    const kg2 = new KnowledgeGraph();
    kg2.importGraph(data);
    expect(kg2.getStats().entities).toBe(1);
  });
});

// ── Workspace Manager Tests ──────────────────────────────────────────────

describe('WorkspaceManager', () => {
  let wm: WorkspaceManager;

  beforeEach(() => {
    wm = new WorkspaceManager('/tmp/jarvis-test-ws');
  });

  it('creates an isolated workspace', async () => {
    const ws = await wm.createWorkspace({
      agentId: 'agent-1',
      isolateFs: true,
      isolateBrowser: true,
      credentials: ['github-token'],
      env: { NODE_ENV: 'test' },
    });
    expect(ws.id).toBeDefined();
    expect(ws.agentId).toBe('agent-1');
    expect(ws.fsRoot).toContain('agent-1');
    expect(ws.browserProfileDir).toBeDefined();
    expect(ws.credentialScope).toContain('github-token');
    expect(ws.terminalEnv.NODE_ENV).toBe('test');
    expect(ws.memoryScope).toBe('private');
  });

  it('retrieves workspace by agent ID', async () => {
    await wm.createWorkspace({ agentId: 'agent-2', isolateFs: true });
    const ws = wm.getWorkspace('agent-2');
    expect(ws).toBeDefined();
    expect(ws!.agentId).toBe('agent-2');
  });

  it('checks path scope', async () => {
    const ws = await wm.createWorkspace({
      agentId: 'agent-3',
      isolateFs: true,
    });
    expect(wm.isPathInScope('agent-3', `${ws.fsRoot}/file.txt`)).toBe(true);
    expect(wm.isPathInScope('agent-3', '/etc/passwd')).toBe(false);
  });

  it('checks credential access', async () => {
    await wm.createWorkspace({
      agentId: 'agent-4',
      credentials: ['api-key-1', 'api-key-2'],
    });
    expect(wm.hasCredentialAccess('agent-4', 'api-key-1')).toBe(true);
    expect(wm.hasCredentialAccess('agent-4', 'api-key-3')).toBe(false);
  });

  it('grants and revokes credentials', async () => {
    await wm.createWorkspace({ agentId: 'agent-5' });
    expect(wm.hasCredentialAccess('agent-5', 'new-key')).toBe(false);
    wm.grantCredential('agent-5', 'new-key');
    expect(wm.hasCredentialAccess('agent-5', 'new-key')).toBe(true);
    wm.revokeCredential('agent-5', 'new-key');
    expect(wm.hasCredentialAccess('agent-5', 'new-key')).toBe(false);
  });

  it('gets terminal env and working dir', async () => {
    await wm.createWorkspace({
      agentId: 'agent-6',
      isolateFs: true,
      env: { FOO: 'bar' },
    });
    expect(wm.getTerminalEnv('agent-6').FOO).toBe('bar');
    expect(wm.getWorkingDir('agent-6')).toContain('agent-6');
  });

  it('lists active workspaces', async () => {
    await wm.createWorkspace({ agentId: 'a1' });
    await wm.createWorkspace({ agentId: 'a2' });
    const list = wm.listWorkspaces();
    expect(list.length).toBe(2);
  });

  it('cleans up workspace', async () => {
    await wm.createWorkspace({ agentId: 'agent-7' });
    expect(wm.getWorkspace('agent-7')).toBeDefined();
    await wm.cleanupWorkspace('agent-7');
    expect(wm.getWorkspace('agent-7')).toBeUndefined();
    const active = wm.listWorkspaces();
    expect(active.find(ws => ws.agentId === 'agent-7')).toBeUndefined();
  });

  it('computes stats', async () => {
    await wm.createWorkspace({ agentId: 'a1' });
    await wm.createWorkspace({ agentId: 'a2' });
    await wm.cleanupWorkspace('a1');
    const stats = wm.getStats();
    expect(stats.total).toBe(2);
    expect(stats.active).toBe(1);
    expect(stats.cleanedUp).toBe(1);
  });

  it('supports git worktree configuration', async () => {
    const ws = await wm.createWorkspace({
      agentId: 'agent-8',
      gitWorktree: {
        repoRoot: '/path/to/repo',
        branch: 'feature-branch',
      },
    });
    expect(ws.gitWorktree).toBeDefined();
    expect(ws.gitWorktree!.branch).toBe('feature-branch');
    expect(ws.gitWorktree!.repoRoot).toBe('/path/to/repo');
  });
});

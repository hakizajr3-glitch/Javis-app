/**
 * Agent Factory — creates specialized agents on demand.
 *
 * Per the master spec (Section 7 & 8):
 *   "Agent Factory: create specialized agents on demand (research → define
 *    skills → select model → define tools → define permissions → create
 *    workspace → create evaluation → test → register)"
 *
 * The factory produces AgentDNA records that persist across restarts and
 * registers the agent in both the AIWorkforce and the harness AgentRuntime.
 */
import { v4 as uuidv4 } from 'uuid';
import { AgentDNA, ModelPreference, PerformanceRecord } from './types.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import type { MemoryRuntime } from './memoryRuntime.js';

// ---------------------------------------------------------------------------
// Department definitions (spec Section 7)
// ---------------------------------------------------------------------------

export type DepartmentType =
  | 'software' | 'research' | 'marketing' | 'sales' | 'design'
  | 'operations' | 'finance' | 'legal' | 'personal' | 'trading'
  | 'automation' | 'executive' | 'qa' | 'security' | 'devops' | 'data';

export interface DepartmentDefinition {
  type: DepartmentType;
  name: string;
  description: string;
  /** Default roles within this department. */
  roles: RoleDefinition[];
  /** Default capability IDs agents in this department get. */
  defaultCapabilities: string[];
  /** Default permissions. */
  defaultPermissions: string[];
  /** Preferred model needs for agents in this department. */
  modelNeeds: string[];
}

export interface RoleDefinition {
  name: string;
  description: string;
  skills: string[];
  capabilities: string[];
  permissions: string[];
  modelNeeds: string[];
}

// ---------------------------------------------------------------------------
// Default departments (spec Section 7)
// ---------------------------------------------------------------------------

export const DEPARTMENTS: Record<DepartmentType, DepartmentDefinition> = {
  executive: {
    type: 'executive',
    name: 'Executive',
    description: 'Strategic leadership and mission oversight',
    defaultCapabilities: ['reasoning', 'planning', 'delegation', 'review'],
    defaultPermissions: ['mission:create', 'mission:approve', 'agent:spawn', 'policy:override'],
    modelNeeds: ['reasoning', 'long-context'],
    roles: [
      { name: 'Commander', description: 'Overall mission command and final decisions', skills: ['strategic-planning', 'decision-making'], capabilities: ['reasoning', 'planning', 'delegation'], permissions: ['mission:*', 'agent:*', 'policy:*'], modelNeeds: ['reasoning', 'long-context'] },
      { name: 'Chief-of-Staff', description: 'Coordinates between departments', skills: ['coordination', 'communication'], capabilities: ['reasoning', 'delegation'], permissions: ['mission:*', 'agent:*'], modelNeeds: ['reasoning'] },
      { name: 'Mission Manager', description: 'Manages mission lifecycle', skills: ['project-management'], capabilities: ['planning', 'scheduling'], permissions: ['mission:*'], modelNeeds: ['reasoning'] },
      { name: 'Planner', description: 'Decomposes objectives into task graphs', skills: ['task-decomposition', 'planning'], capabilities: ['reasoning', 'planning'], permissions: ['mission:read', 'task:create'], modelNeeds: ['reasoning'] },
      { name: 'Observer', description: 'Monitors execution and collects evidence', skills: ['observation', 'evidence-collection'], capabilities: ['monitoring'], permissions: ['mission:read', 'task:read'], modelNeeds: ['fast'] },
      { name: 'Reflection', description: 'Evaluates outcomes and proposes improvements', skills: ['evaluation', 'reflection'], capabilities: ['reasoning'], permissions: ['mission:read', 'memory:write'], modelNeeds: ['reasoning'] },
      { name: 'Verification', description: 'Independent verification of results', skills: ['verification', 'testing'], capabilities: ['verification'], permissions: ['mission:read', 'task:read'], modelNeeds: ['reasoning'] },
    ],
  },
  software: {
    type: 'software',
    name: 'Software Engineering',
    description: 'Architecture, coding, testing, deployment',
    defaultCapabilities: ['code:read', 'code:write', 'terminal', 'filesystem', 'git'],
    defaultPermissions: ['file:read', 'file:write', 'shell:execute', 'git:*'],
    modelNeeds: ['coding', 'reasoning'],
    roles: [
      { name: 'Architect', description: 'System design and architecture decisions', skills: ['system-design', 'architecture'], capabilities: ['code:read', 'reasoning'], permissions: ['file:read', 'git:read'], modelNeeds: ['reasoning', 'long-context', 'coding'] },
      { name: 'Explorer', description: 'Explores codebase and maps structure', skills: ['codebase-exploration'], capabilities: ['code:read', 'filesystem'], permissions: ['file:read'], modelNeeds: ['coding', 'fast'] },
      { name: 'Builder', description: 'Implements features and fixes', skills: ['coding', 'testing'], capabilities: ['code:write', 'terminal', 'filesystem'], permissions: ['file:read', 'file:write', 'shell:execute'], modelNeeds: ['coding'] },
      { name: 'UI Engineer', description: 'Frontend implementation', skills: ['frontend', 'css', 'react'], capabilities: ['code:write', 'browser'], permissions: ['file:read', 'file:write'], modelNeeds: ['coding'] },
      { name: 'Backend Engineer', description: 'Server and API implementation', skills: ['backend', 'api', 'database'], capabilities: ['code:write', 'terminal'], permissions: ['file:read', 'file:write', 'shell:execute'], modelNeeds: ['coding'] },
      { name: 'Database Engineer', description: 'Schema, migrations, queries', skills: ['database', 'sql'], capabilities: ['code:write', 'terminal'], permissions: ['file:read', 'file:write', 'shell:execute'], modelNeeds: ['coding', 'reasoning'] },
      { name: 'Debugger', description: 'Diagnoses and fixes bugs', skills: ['debugging', 'logging'], capabilities: ['code:read', 'code:write', 'terminal'], permissions: ['file:read', 'file:write', 'shell:execute'], modelNeeds: ['coding', 'reasoning'] },
      { name: 'Reviewer', description: 'Code review and quality gates', skills: ['code-review', 'quality'], capabilities: ['code:read'], permissions: ['file:read', 'git:read'], modelNeeds: ['coding', 'reasoning'] },
      { name: 'Tester', description: 'Writes and runs tests', skills: ['testing', 'test-design'], capabilities: ['code:write', 'terminal'], permissions: ['file:read', 'file:write', 'shell:execute'], modelNeeds: ['coding'] },
      { name: 'DevOps', description: 'CI/CD, deployment, infrastructure', skills: ['ci-cd', 'docker', 'kubernetes'], capabilities: ['terminal', 'filesystem'], permissions: ['shell:execute', 'file:read'], modelNeeds: ['coding'] },
      { name: 'Performance Engineer', description: 'Optimization and profiling', skills: ['profiling', 'optimization'], capabilities: ['code:read', 'terminal'], permissions: ['file:read', 'shell:execute'], modelNeeds: ['coding', 'reasoning'] },
      { name: 'Documentation Agent', description: 'Writes docs and comments', skills: ['writing', 'documentation'], capabilities: ['code:read', 'code:write'], permissions: ['file:read', 'file:write'], modelNeeds: ['coding', 'fast'] },
      { name: 'Release Agent', description: 'Manages releases and versioning', skills: ['release-management'], capabilities: ['terminal', 'git'], permissions: ['shell:execute', 'git:*'], modelNeeds: ['coding'] },
    ],
  },
  research: {
    type: 'research',
    name: 'Research',
    description: 'Discovery, analysis, synthesis',
    defaultCapabilities: ['web:search', 'web:fetch', 'reasoning'],
    defaultPermissions: ['web:search', 'web:fetch'],
    modelNeeds: ['research', 'long-context'],
    roles: [
      { name: 'Discovery', description: 'Finds sources and initial leads', skills: ['web-search', 'source-discovery'], capabilities: ['web:search', 'web:fetch'], permissions: ['web:search', 'web:fetch'], modelNeeds: ['research', 'fast'] },
      { name: 'Web Research', description: 'Deep web research', skills: ['web-research', 'synthesis'], capabilities: ['web:search', 'web:fetch', 'browser'], permissions: ['web:search', 'web:fetch'], modelNeeds: ['research', 'long-context'] },
      { name: 'Competitive Intelligence', description: 'Analyzes competitors', skills: ['competitive-analysis'], capabilities: ['web:search', 'reasoning'], permissions: ['web:search'], modelNeeds: ['research', 'reasoning'] },
      { name: 'Market Research', description: 'Market sizing and trends', skills: ['market-analysis'], capabilities: ['web:search', 'reasoning'], permissions: ['web:search'], modelNeeds: ['research', 'reasoning'] },
      { name: 'Data Analyst', description: 'Analyzes data and produces insights', skills: ['data-analysis', 'statistics'], capabilities: ['code:write', 'terminal'], permissions: ['file:read', 'file:write', 'shell:execute'], modelNeeds: ['reasoning', 'coding'] },
      { name: 'Fact Checker', description: 'Verifies claims and sources', skills: ['fact-checking', 'verification'], capabilities: ['web:search', 'web:fetch'], permissions: ['web:search', 'web:fetch'], modelNeeds: ['research', 'reasoning'] },
      { name: 'Synthesis Agent', description: 'Synthesizes findings into reports', skills: ['synthesis', 'writing'], capabilities: ['reasoning'], permissions: ['memory:write'], modelNeeds: ['reasoning', 'long-context'] },
    ],
  },
  marketing: {
    type: 'marketing',
    name: 'Marketing',
    description: 'Content, campaigns, brand',
    defaultCapabilities: ['web:search', 'reasoning', 'code:write'],
    defaultPermissions: ['web:search', 'file:write'],
    modelNeeds: ['reasoning', 'fast'],
    roles: [
      { name: 'Content Planner', description: 'Plans content strategy', skills: ['content-strategy', 'planning'], capabilities: ['reasoning'], permissions: ['memory:read', 'memory:write'], modelNeeds: ['reasoning'] },
      { name: 'Writer', description: 'Creates content', skills: ['copywriting', 'writing'], capabilities: ['reasoning'], permissions: ['file:write'], modelNeeds: ['reasoning'] },
      { name: 'Social Media', description: 'Manages social channels', skills: ['social-media', 'scheduling'], capabilities: ['web:search'], permissions: ['web:search'], modelNeeds: ['fast'] },
      { name: 'Brand Agent', description: 'Brand consistency and guidelines', skills: ['branding', 'design'], capabilities: ['reasoning'], permissions: ['memory:read'], modelNeeds: ['reasoning'] },
    ],
  },
  sales: {
    type: 'sales',
    name: 'Sales',
    description: 'Lead generation, outreach, CRM',
    defaultCapabilities: ['web:search', 'reasoning', 'communication'],
    defaultPermissions: ['web:search', 'communication:send'],
    modelNeeds: ['reasoning', 'fast'],
    roles: [
      { name: 'Lead Generation', description: 'Finds and qualifies leads', skills: ['lead-gen', 'research'], capabilities: ['web:search'], permissions: ['web:search'], modelNeeds: ['fast'] },
      { name: 'Sales', description: 'Manages sales pipeline', skills: ['sales', 'negotiation'], capabilities: ['reasoning', 'communication'], permissions: ['communication:send'], modelNeeds: ['reasoning'] },
      { name: 'CRM', description: 'Manages customer relationships', skills: ['crm', 'organization'], capabilities: ['reasoning'], permissions: ['memory:read', 'memory:write'], modelNeeds: ['fast'] },
    ],
  },
  design: {
    type: 'design',
    name: 'Design',
    description: 'UI/UX, visual design, branding',
    defaultCapabilities: ['reasoning', 'code:write', 'browser'],
    defaultPermissions: ['file:read', 'file:write'],
    modelNeeds: ['reasoning', 'vision'],
    roles: [
      { name: 'Designer', description: 'Visual and UX design', skills: ['ui-design', 'ux-design'], capabilities: ['reasoning', 'browser'], permissions: ['file:read', 'file:write'], modelNeeds: ['reasoning', 'vision'] },
      { name: 'Video Producer', description: 'Creates video content', skills: ['video-production'], capabilities: ['code:write'], permissions: ['file:read', 'file:write'], modelNeeds: ['reasoning'] },
    ],
  },
  operations: {
    type: 'operations',
    name: 'Operations',
    description: 'Process, logistics, efficiency',
    defaultCapabilities: ['reasoning', 'terminal', 'filesystem'],
    defaultPermissions: ['file:read', 'shell:execute'],
    modelNeeds: ['reasoning', 'fast'],
    roles: [
      { name: 'Operations', description: 'Manages operational workflows', skills: ['operations', 'process'], capabilities: ['reasoning', 'terminal'], permissions: ['file:read', 'shell:execute'], modelNeeds: ['reasoning'] },
    ],
  },
  finance: {
    type: 'finance',
    name: 'Finance',
    description: 'Financial analysis, forecasting',
    defaultCapabilities: ['reasoning', 'code:write', 'terminal'],
    defaultPermissions: ['file:read', 'file:write'],
    modelNeeds: ['reasoning', 'coding'],
    roles: [
      { name: 'Finance', description: 'Financial analysis and reporting', skills: ['finance', 'accounting'], capabilities: ['reasoning', 'code:write'], permissions: ['file:read', 'file:write'], modelNeeds: ['reasoning', 'coding'] },
      { name: 'Analytics', description: 'Financial analytics', skills: ['analytics', 'statistics'], capabilities: ['code:write', 'terminal'], permissions: ['file:read'], modelNeeds: ['reasoning', 'coding'] },
    ],
  },
  legal: {
    type: 'legal',
    name: 'Legal',
    description: 'Contracts, compliance, risk',
    defaultCapabilities: ['reasoning', 'web:search'],
    defaultPermissions: ['web:search', 'memory:read'],
    modelNeeds: ['reasoning', 'long-context'],
    roles: [
      { name: 'Legal', description: 'Legal analysis and contracts', skills: ['legal', 'contracts'], capabilities: ['reasoning', 'web:search'], permissions: ['web:search', 'memory:read'], modelNeeds: ['reasoning', 'long-context'] },
    ],
  },
  personal: {
    type: 'personal',
    name: 'Personal',
    description: 'Personal assistant tasks',
    defaultCapabilities: ['reasoning', 'web:search', 'communication'],
    defaultPermissions: ['web:search', 'memory:read', 'memory:write'],
    modelNeeds: ['reasoning', 'fast'],
    roles: [
      { name: 'Personal Assistant', description: 'Daily tasks and reminders', skills: ['scheduling', 'organization'], capabilities: ['reasoning', 'communication'], permissions: ['memory:read', 'memory:write'], modelNeeds: ['fast'] },
    ],
  },
  trading: {
    type: 'trading',
    name: 'Trading',
    description: 'Market analysis, trading strategies',
    defaultCapabilities: ['reasoning', 'code:write', 'terminal'],
    defaultPermissions: ['web:search', 'file:read'],
    modelNeeds: ['reasoning', 'coding', 'fast'],
    roles: [
      { name: 'Trading Analyst', description: 'Market analysis and signals', skills: ['trading', 'market-analysis'], capabilities: ['reasoning', 'code:write'], permissions: ['web:search', 'file:read'], modelNeeds: ['reasoning', 'fast'] },
    ],
  },
  automation: {
    type: 'automation',
    name: 'Automation',
    description: 'Workflow automation, scripting',
    defaultCapabilities: ['terminal', 'filesystem', 'code:write'],
    defaultPermissions: ['shell:execute', 'file:read', 'file:write'],
    modelNeeds: ['coding', 'fast'],
    roles: [
      { name: 'Automation Engineer', description: 'Builds and runs automations', skills: ['automation', 'scripting'], capabilities: ['terminal', 'filesystem', 'code:write'], permissions: ['shell:execute', 'file:read', 'file:write'], modelNeeds: ['coding', 'fast'] },
    ],
  },
  qa: {
    type: 'qa',
    name: 'Quality Assurance',
    description: 'Testing, quality gates, validation',
    defaultCapabilities: ['code:read', 'code:write', 'terminal'],
    defaultPermissions: ['file:read', 'file:write', 'shell:execute'],
    modelNeeds: ['coding', 'reasoning'],
    roles: [
      { name: 'QA Engineer', description: 'Test planning and execution', skills: ['testing', 'test-design', 'quality'], capabilities: ['code:read', 'code:write', 'terminal'], permissions: ['file:read', 'file:write', 'shell:execute'], modelNeeds: ['coding', 'reasoning'] },
      { name: 'Testing Agent', description: 'Runs tests and reports results', skills: ['test-execution'], capabilities: ['terminal'], permissions: ['shell:execute', 'file:read'], modelNeeds: ['fast'] },
    ],
  },
  security: {
    type: 'security',
    name: 'Security',
    description: 'Defensive security, auditing, incident response',
    defaultCapabilities: ['terminal', 'filesystem', 'reasoning'],
    defaultPermissions: ['shell:execute', 'file:read', 'security:audit'],
    modelNeeds: ['reasoning', 'coding'],
    roles: [
      { name: 'Security Engineer', description: 'Security analysis and hardening', skills: ['security', 'vulnerability-analysis'], capabilities: ['terminal', 'filesystem', 'reasoning'], permissions: ['shell:execute', 'file:read', 'security:audit'], modelNeeds: ['reasoning', 'coding'] },
      { name: 'Safety/Policy Reviewer', description: 'Reviews changes for safety', skills: ['policy-review', 'risk-assessment'], capabilities: ['reasoning'], permissions: ['memory:read'], modelNeeds: ['reasoning'] },
    ],
  },
  devops: {
    type: 'devops',
    name: 'DevOps',
    description: 'Infrastructure, CI/CD, deployment',
    defaultCapabilities: ['terminal', 'filesystem', 'code:write'],
    defaultPermissions: ['shell:execute', 'file:read', 'file:write'],
    modelNeeds: ['coding', 'fast'],
    roles: [
      { name: 'DevOps Engineer', description: 'CI/CD and infrastructure', skills: ['ci-cd', 'docker', 'infrastructure'], capabilities: ['terminal', 'filesystem', 'code:write'], permissions: ['shell:execute', 'file:read', 'file:write'], modelNeeds: ['coding'] },
    ],
  },
  data: {
    type: 'data',
    name: 'Data',
    description: 'Data engineering, analytics, ML',
    defaultCapabilities: ['code:write', 'terminal', 'reasoning'],
    defaultPermissions: ['file:read', 'file:write', 'shell:execute'],
    modelNeeds: ['coding', 'reasoning'],
    roles: [
      { name: 'Data Engineer', description: 'Data pipelines and ETL', skills: ['data-engineering', 'etl'], capabilities: ['code:write', 'terminal'], permissions: ['file:read', 'file:write', 'shell:execute'], modelNeeds: ['coding'] },
      { name: 'Data Analyst', description: 'Data analysis and visualization', skills: ['data-analysis', 'statistics'], capabilities: ['code:write', 'terminal'], permissions: ['file:read', 'shell:execute'], modelNeeds: ['reasoning', 'coding'] },
    ],
  },
};

// ---------------------------------------------------------------------------
// Agent Factory
// ---------------------------------------------------------------------------

export interface CreateAgentRequest {
  name?: string;
  department: DepartmentType;
  role?: string;
  /** Override default skills. */
  skills?: string[];
  /** Override default capabilities. */
  capabilities?: string[];
  /** Override default permissions. */
  permissions?: string[];
  /** Override model preference. */
  model?: ModelPreference;
  /** Goals for this agent. */
  goals?: string[];
  /** Owner/user ID. */
  ownerId?: string;
}

export interface CreatedAgent {
  agentId: string;
  dna: AgentDNA;
  department: DepartmentType;
  roleName: string;
}

function freshPerformance(): PerformanceRecord {
  return {
    tasksAttempted: 0,
    tasksSucceeded: 0,
    tasksFailed: 0,
    successRate: 1.0,
    averageDurationMs: 0,
    verificationPassRate: 0,
    recoveries: 0,
    escalations: 0,
    lastUpdatedAt: new Date(),
  };
}

export class AgentFactory {
  private memory: MemoryRuntime | null = null;

  /** Set the memory runtime — called by the harness facade on construction. */
  setMemoryRuntime(memory: MemoryRuntime): void {
    this.memory = memory;
  }

  /**
   * Create a specialized agent on demand.
   *
   * Flow per spec: research → define skills → select model → define tools →
   * define permissions → create workspace → create evaluation → test → register
   */
  async createAgent(req: CreateAgentRequest): Promise<CreatedAgent> {
    const dept = DEPARTMENTS[req.department];
    if (!dept) throw new Error(`Unknown department: ${req.department}`);

    // Select role — either the one requested or the first role in the department
    const role = req.role
      ? dept.roles.find(r => r.name.toLowerCase() === req.role!.toLowerCase()) || dept.roles[0]
      : dept.roles[0];
    if (!role) throw new Error(`No roles defined for department: ${req.department}`);

    // Merge capabilities and permissions (role + department defaults)
    const capabilities = req.capabilities ?? [
      ...new Set([...dept.defaultCapabilities, ...role.capabilities]),
    ];
    const permissions = req.permissions ?? [
      ...new Set([...dept.defaultPermissions, ...role.permissions]),
    ];
    const skills = req.skills ?? role.skills;
    const model: ModelPreference = req.model ?? {
      needs: role.modelNeeds as any[],
    };

    const agentId = uuidv4();
    const now = new Date();

    const dna: AgentDNA = {
      agentId,
      role: role.name,
      identity: {
        name: req.name ?? `${role.name}`,
        description: role.description,
      },
      goals: req.goals ?? [],
      skillIds: skills,
      capabilityIds: capabilities,
      permissions,
      model,
      performance: freshPerformance(),
      evolution: [{
        at: now,
        kind: 'promoted',
        detail: `Agent created in ${dept.name} department as ${role.name}`,
      }],
      createdAt: now,
      updatedAt: now,
    };

    // Register DNA in memory runtime (persists across restarts)
    if (this.memory) {
      await this.memory.saveMemory({
        kind: 'semantic',
        ownerId: req.ownerId ?? 'system',
        scope: 'shared',
        content: JSON.stringify(dna),
        importance: 0.9,
        tags: ['agent-dna', dept.type, role.name.toLowerCase()],
        provenance: {
          source: 'agent-factory',
          confidence: 1.0,
          evidence: [{ kind: 'assertion', detail: `Created by AgentFactory for ${dept.name}/${role.name}` }],
        },
      });
    }

    // Publish creation event
    eventBus.publish({
      id: uuidv4(),
      type: EventType.COWORKER_ASSIGNED,
      payload: { agentId, department: dept.type, role: role.name, dna },
      timestamp: now,
      source: 'AgentFactory',
    });

    return {
      agentId,
      dna,
      department: req.department,
      roleName: role.name,
    };
  }

  /**
   * Create a full team for a department — all default roles.
   */
  async createDepartmentTeam(department: DepartmentType, ownerId?: string): Promise<CreatedAgent[]> {
    const dept = DEPARTMENTS[department];
    if (!dept) throw new Error(`Unknown department: ${department}`);

    const agents: CreatedAgent[] = [];
    for (const role of dept.roles) {
      const created = await this.createAgent({
        department,
        role: role.name,
        ownerId,
      });
      agents.push(created);
    }
    return agents;
  }

  /**
   * List all departments with their roles.
   */
  listDepartments(): DepartmentDefinition[] {
    return Object.values(DEPARTMENTS);
  }

  /**
   * Get a specific department definition.
   */
  getDepartment(type: DepartmentType): DepartmentDefinition | undefined {
    return DEPARTMENTS[type];
  }

  /**
   * Find the best department for a given objective text.
   * Simple keyword matching — the reasoning engine can do better.
   */
  suggestDepartment(objective: string): DepartmentType {
    const lower = objective.toLowerCase();
    const keywords: Record<DepartmentType, string[]> = {
      software: ['code', 'build', 'app', 'api', 'bug', 'feature', 'refactor', 'test', 'deploy', 'git', 'repository'],
      research: ['research', 'analyze', 'investigate', 'study', 'report', 'survey', 'compare'],
      marketing: ['market', 'content', 'campaign', 'brand', 'social', 'advertis'],
      sales: ['sale', 'lead', 'outreach', 'crm', 'customer', 'pipeline'],
      design: ['design', 'ui', 'ux', 'visual', 'logo', 'wireframe', 'prototype'],
      operations: ['operation', 'process', 'workflow', 'logistics', 'efficiency'],
      finance: ['finance', 'budget', 'cost', 'revenue', 'invoice', 'tax'],
      legal: ['legal', 'contract', 'compliance', 'regulation', 'terms', 'privacy'],
      personal: ['personal', 'remind', 'schedule', 'calendar', 'todo', 'organize'],
      trading: ['trade', 'stock', 'market', 'portfolio', 'investment'],
      automation: ['automate', 'script', 'pipeline', 'cron', 'schedule', 'integration'],
      executive: ['plan', 'strategy', 'mission', 'objective', 'delegate', 'oversee'],
      qa: ['test', 'quality', 'qa', 'validation', 'verify', 'regression'],
      security: ['security', 'vulnerab', 'audit', 'penetration', 'malware', 'threat'],
      devops: ['devops', 'ci', 'cd', 'deploy', 'infrastructure', 'docker', 'kubernetes'],
      data: ['data', 'etl', 'pipeline', 'analytics', 'ml', 'machine learning', 'dataset'],
    };

    let best: DepartmentType = 'executive';
    let bestScore = 0;
    for (const [dept, words] of Object.entries(keywords)) {
      let score = 0;
      for (const w of words) {
        if (lower.includes(w)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        best = dept as DepartmentType;
      }
    }
    return best;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const agentFactory = new AgentFactory();

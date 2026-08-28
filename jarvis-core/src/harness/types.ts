/**
 * JARVIS Elite Agentic Harness — core types.
 *
 * This is the unified type surface for the 12 harness pillars. It deliberately
 * does NOT redefine the existing mission-runtime / agent-harness types; those
 * remain the source of truth for their own modules and are reached through the
 * adapter layer (see ./adapters). What lives here is the harness-level
 * vocabulary: capabilities, policy decisions, verification, recovery, DNA
 * memory, and the autonomy model.
 *
 * Design principles embedded here (from the NOOA architecture):
 *  - Typed I/O: capabilities declare input/output schemas and are validated.
 *  - Pass-by-reference: agents hold handles to live objects, not serialized dumps.
 *  - Code as action: capabilities are composable in TypeScript, not just tool calls.
 *  - Programmable loops: each agent kind declares its own loop phases.
 *  - Explicit object state: agent state lives on AgentDNA, not chat history.
 *  - Model-callable harness APIs: see HarnessApi.
 */

// ---------------------------------------------------------------------------
// Autonomy
// ---------------------------------------------------------------------------

/**
 * How much latitude the harness has without asking the user.
 * 0 Observe · 1 Recommend · 2 Execute safe · 3 Autonomous mission
 * 4 Self-improving · 5 High-impact (always requires explicit authorization)
 */
export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5;

export const AUTONOMY_LABELS: Record<AutonomyLevel, string> = {
  0: 'observe',
  1: 'recommend',
  2: 'execute-safe',
  3: 'autonomous-mission',
  4: 'self-improving',
  5: 'high-impact',
};

/** Risk classification for a single proposed action. */
export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

// ---------------------------------------------------------------------------
// Pillar 5: Tool Runtime / Capability Fabric
// ---------------------------------------------------------------------------

export type CapabilitySource = 'native' | 'mcp' | 'sdk' | 'api' | 'plugin';

/** Minimal JSON-Schema subset used for typed capability I/O. */
export interface SchemaSpec {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array' | 'null' | 'any';
  properties?: Record<string, SchemaSpec>;
  items?: SchemaSpec;
  required?: string[];
  enum?: any[];
  description?: string;
}

export interface CapabilityDescriptor {
  id: string;
  name: string;
  /** Short natural-language purpose — used for intent-based discovery. */
  description: string;
  source: CapabilitySource;
  /** Free-form tags used by progressive disclosure (e.g. 'browser', 'git'). */
  tags: string[];
  inputSchema: SchemaSpec;
  outputSchema: SchemaSpec;
  /** Permission strings this capability requires (checked by policyEngine). */
  requiredPermissions: string[];
  /** Baseline risk for invoking this capability at all. */
  risk: RiskLevel;
  /** True when the effect can be undone (informs recovery + policy). */
  reversible: boolean;
}

export interface Capability<I = any, O = any> extends CapabilityDescriptor {
  execute(input: I, ctx: CapabilityContext): Promise<O>;
}

export interface CapabilityContext {
  userId: string;
  missionId?: string;
  agentId?: string;
  /** Correlation id used for audit + event tracing. */
  traceId: string;
}

export interface CapabilityInvocation {
  capabilityId: string;
  input: any;
  ctx: CapabilityContext;
}

export interface CapabilityResult<O = any> {
  capabilityId: string;
  ok: boolean;
  output?: O;
  error?: string;
  durationMs: number;
  /** Populated when policy denied or deferred the call. */
  policy?: PolicyDecision;
}

/** A narrowed view of the registry handed to an agent (progressive disclosure). */
export interface CapabilityView {
  capabilities: CapabilityDescriptor[];
  /** Total registry size, so the agent knows more exist. */
  totalAvailable: number;
  /** How this view was derived, for observability. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Pillar 8: Policy & Governance
// ---------------------------------------------------------------------------

export type PolicyOutcome = 'allow' | 'deny' | 'require-approval';

export interface PolicyRequest {
  userId: string;
  /** Capability id or a free-form action type. */
  action: string;
  resource: string;
  description?: string;
  risk?: RiskLevel;
  reversible?: boolean;
  requiredPermissions?: string[];
  autonomyLevel?: AutonomyLevel;
  metadata?: Record<string, any>;
}

export interface PolicyDecision {
  outcome: PolicyOutcome;
  reason: string;
  risk: RiskLevel;
  /** Set when outcome is 'require-approval'. */
  approvalId?: string;
  /** Permissions that were missing, when denied for that reason. */
  missingPermissions?: string[];
  decidedAt: Date;
}

// ---------------------------------------------------------------------------
// Pillar 9: Verification & Recovery
// ---------------------------------------------------------------------------

/** A captured observation of the world used to verify an action. */
export interface StateSnapshot {
  /** What kind of state this is: 'file', 'process', 'http', 'memory', ... */
  kind: string;
  /** Stable identifier of the thing observed (path, url, pid, key). */
  target: string;
  /** Observed value — kept small; large payloads should be hashed. */
  value: any;
  capturedAt: Date;
}

export interface Discrepancy {
  field: string;
  expected: any;
  actual: any;
  message: string;
}

export interface Evidence {
  kind: 'snapshot' | 'log' | 'exit-code' | 'assertion' | 'external-check';
  detail: string;
  data?: any;
}

export interface VerificationResult {
  passed: boolean;
  expected?: StateSnapshot;
  actual?: StateSnapshot;
  discrepancies: Discrepancy[];
  evidence: Evidence[];
  verifiedAt: Date;
}

export type FailureClass =
  | 'transient'
  | 'bad-input'
  | 'wrong-strategy'
  | 'wrong-tool'
  | 'permission'
  | 'environment'
  | 'unknown';

export type RecoveryAction =
  | 'retry'
  | 'correct'
  | 'replan'
  | 'alternate-agent'
  | 'alternate-tool'
  | 'escalate';

export interface RecoveryPlan {
  failureClass: FailureClass;
  action: RecoveryAction;
  reason: string;
  attempt: number;
  maxAttempts: number;
  /** Delay before the next attempt, for transient failures. */
  backoffMs?: number;
  escalationTarget?: string;
}

// ---------------------------------------------------------------------------
// Pillar 7: Memory Runtime / DNA Memory
// ---------------------------------------------------------------------------

export type MemoryKind =
  | 'episodic'
  | 'semantic'
  | 'procedural'
  | 'working'
  | 'reflective'
  | 'skill'
  | 'relational'
  | 'performance';

export type MemoryRelation = 'supports' | 'contradicts' | 'derived-from' | 'relates-to';

export interface MemoryProvenance {
  /** Agent or subsystem that produced this memory. */
  source: string;
  agentId?: string;
  missionId?: string;
  taskId?: string;
  /** 0..1 — how much the system trusts this record. */
  confidence: number;
  evidence: Evidence[];
  /** Times this memory has been used successfully. */
  successfulUses: number;
  lastValidatedAt?: Date;
}

export interface MemoryRecord {
  id: string;
  kind: MemoryKind;
  /** Owning scope. 'shared' means workforce-wide. */
  ownerId: string;
  scope: 'private' | 'shared' | 'organization' | 'system';
  content: string;
  /** 0..1 — drives retention and retrieval ranking. */
  importance: number;
  tags: string[];
  provenance: MemoryProvenance;
  relations: Array<{ relation: MemoryRelation; targetId: string }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryQuery {
  ownerId?: string;
  scope?: MemoryRecord['scope'];
  kind?: MemoryKind;
  tags?: string[];
  text?: string;
  minImportance?: number;
  minConfidence?: number;
  limit?: number;
}

/**
 * Persistent identity + experience layer for one agent.
 * This is the "explicit object state" principle: an agent is its DNA, not its
 * transcript. Survives process restarts via the persistence layer.
 */
export interface AgentDNA {
  agentId: string;
  role: string;
  /** Human-facing identity. */
  identity: {
    name: string;
    description: string;
    personality?: string;
  };
  goals: string[];
  skillIds: string[];
  capabilityIds: string[];
  permissions: string[];
  /** Preferred model routing for this agent. */
  model?: ModelPreference;
  performance: PerformanceRecord;
  evolution: EvolutionEvent[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PerformanceRecord {
  tasksAttempted: number;
  tasksSucceeded: number;
  tasksFailed: number;
  /** 0..1 rolling success rate. */
  successRate: number;
  averageDurationMs: number;
  /** Verification pass rate — stronger signal than raw success. */
  verificationPassRate: number;
  recoveries: number;
  escalations: number;
  lastUpdatedAt: Date;
}

export interface EvolutionEvent {
  at: Date;
  kind: 'skill-learned' | 'skill-improved' | 'strategy-changed' | 'model-changed' | 'demoted' | 'promoted';
  detail: string;
  /** Measured effect, when known. */
  delta?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Pillar 3: Reasoning Engine / Model Fabric
// ---------------------------------------------------------------------------

export type ModelCapabilityNeed =
  | 'reasoning'
  | 'coding'
  | 'vision'
  | 'fast'
  | 'cheap'
  | 'long-context'
  | 'research';

export interface ModelPreference {
  provider?: string;
  model?: string;
  needs?: ModelCapabilityNeed[];
  temperature?: number;
  maxTokens?: number;
}

export interface ReasoningRequest {
  prompt: string;
  systemPrompt?: string;
  needs?: ModelCapabilityNeed[];
  preference?: ModelPreference;
  userId: string;
  traceId: string;
}

export interface ReasoningResponse {
  text: string;
  provider: string;
  model: string;
  durationMs: number;
  tokensUsed?: number;
}

// ---------------------------------------------------------------------------
// Pillar 4: Orchestrator
// ---------------------------------------------------------------------------

export interface HarnessTask {
  id: string;
  title: string;
  description: string;
  /** Capability or agent role expected to handle this. */
  kind: 'reason' | 'capability' | 'agent' | 'verify';
  capabilityId?: string;
  agentRole?: string;
  input?: any;
  dependsOn: string[];
  status: 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'skipped' | 'blocked';
  result?: any;
  error?: string;
  verification?: VerificationResult;
  recovery?: RecoveryPlan;
  attempts: number;
  startedAt?: Date;
  completedAt?: Date;
}

export interface TaskGraph {
  id: string;
  objective: string;
  tasks: HarnessTask[];
  createdAt: Date;
}

export interface OrchestrationPlan {
  graph: TaskGraph;
  /** Execution waves — each wave can run in parallel. */
  waves: string[][];
  estimatedDurationMs: number;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Pillar 11: Event Runtime
// ---------------------------------------------------------------------------

export type TriggerKind = 'interval' | 'cron-ish' | 'event' | 'webhook' | 'manual';

export interface Trigger {
  id: string;
  name: string;
  kind: TriggerKind;
  enabled: boolean;
  /** For 'interval': milliseconds between fires. */
  intervalMs?: number;
  /** For 'cron-ish': simplified cron expression (min hour dom month dow). */
  cronExpression?: string;
  /** For 'event': the EventType name to listen for. */
  eventType?: string;
  /** What to do when it fires. */
  action: TriggerAction;
  lastFiredAt?: Date;
  fireCount: number;
  createdAt: Date;
}

export interface TriggerAction {
  kind: 'capability' | 'mission' | 'callback';
  capabilityId?: string;
  input?: any;
  objective?: string;
  callback?: (trigger: Trigger) => Promise<void> | void;
}

// ---------------------------------------------------------------------------
// Pillar 12: Learning Runtime
// ---------------------------------------------------------------------------

export interface Reflection {
  id: string;
  subjectKind: 'task' | 'mission' | 'agent' | 'capability';
  subjectId: string;
  whatWorked: string[];
  whatFailed: string[];
  lessons: string[];
  /** Suggested follow-up, if any. */
  proposalId?: string;
  createdAt: Date;
}

export interface ImprovementProposal {
  id: string;
  title: string;
  rationale: string;
  targetKind: 'skill' | 'prompt' | 'strategy' | 'capability' | 'model-routing';
  targetId?: string;
  /** The concrete change being proposed. */
  change: Record<string, any>;
  status: 'proposed' | 'testing' | 'validated' | 'rejected' | 'deployed';
  /** Measured effect from sandbox evaluation. */
  evaluation?: ProposalEvaluation;
  /** Level-5 changes always need a human. */
  requiresApproval: boolean;
  createdAt: Date;
}

export interface ProposalEvaluation {
  baselineScore: number;
  candidateScore: number;
  improved: boolean;
  sampleSize: number;
  notes: string[];
  evaluatedAt: Date;
}

/** JARVIS's model of its own capabilities and weaknesses. */
export interface SelfModel {
  capabilities: Record<string, number>;
  weaknesses: string[];
  activeImprovements: string[];
  /** Aggregate across all agents. */
  overallVerificationPassRate: number;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Pillar 10: Skill Runtime
// ---------------------------------------------------------------------------

export interface HarnessSkill {
  id: string;
  name: string;
  purpose: string;
  instructions: string;
  preconditions: string[];
  capabilityIds: string[];
  modelPreference?: ModelPreference;
  /** Loop phases this skill drives, when it defines its own. */
  loop?: LoopPhase[];
  version: number;
  performance: PerformanceRecord;
  requiresApproval: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Programmable loops (NOOA principle 4)
// ---------------------------------------------------------------------------

export type LoopPhase =
  | 'perceive'
  | 'assemble-context'
  | 'reason'
  | 'plan'
  | 'policy-check'
  | 'allocate'
  | 'select-agent'
  | 'select-tool'
  | 'execute'
  | 'observe'
  | 'verify'
  | 'recover'
  | 'validate'
  | 'remember'
  | 'reflect'
  | 'update-state'
  | 'report';

/** The canonical Elite Loop. Agent kinds may declare narrower loops. */
export const ELITE_LOOP: LoopPhase[] = [
  'perceive',
  'assemble-context',
  'reason',
  'plan',
  'policy-check',
  'allocate',
  'select-agent',
  'select-tool',
  'execute',
  'observe',
  'verify',
  'recover',
  'validate',
  'remember',
  'reflect',
  'update-state',
  'report',
];

export interface LoopDefinition {
  name: string;
  phases: LoopPhase[];
  maxIterations: number;
}

// ---------------------------------------------------------------------------
// Harness configuration + facade
// ---------------------------------------------------------------------------

export interface HarnessConfig {
  userId?: string;
  autonomyLevel?: AutonomyLevel;
  /** Max tasks executed in parallel within one wave. */
  maxConcurrency?: number;
  /** Global default for recovery attempts. */
  maxAttemptsPerTask?: number;
  /** Turn verification on/off (off is for tests only). */
  verificationEnabled?: boolean;
  /** Enable the reflection/learning pass after missions. */
  learningEnabled?: boolean;
}

export interface HarnessRunRequest {
  objective: string;
  userId: string;
  context?: Record<string, any>;
  autonomyLevel?: AutonomyLevel;
  /** When true, plan only — do not execute. */
  dryRun?: boolean;
}

export interface HarnessRunResult {
  runId: string;
  objective: string;
  status: 'completed' | 'failed' | 'partial' | 'planned' | 'blocked';
  plan: OrchestrationPlan;
  completedTasks: number;
  failedTasks: number;
  verificationsPassed: number;
  verificationsFailed: number;
  recoveries: number;
  escalations: string[];
  reflection?: Reflection;
  startedAt: Date;
  finishedAt?: Date;
  error?: string;
}

/**
 * Model-callable harness APIs (NOOA principle 6). These are the functions an
 * agent is allowed to call to inspect and manage its own execution.
 */
export interface HarnessApi {
  getContext(): Promise<Record<string, any>>;
  inspectState(): Promise<Record<string, any>>;
  searchMemory(query: MemoryQuery): Promise<MemoryRecord[]>;
  saveMemory(record: Omit<MemoryRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<string>;
  queryKnowledge(text: string, limit?: number): Promise<MemoryRecord[]>;
  inspectEvents(limit?: number): Promise<any[]>;
  createTask(task: Omit<HarnessTask, 'id' | 'status' | 'attempts'>): Promise<string>;
  delegate(objective: string, role?: string): Promise<string>;
  requestTool(intent: string): Promise<CapabilityView>;
  createSkill(skill: Omit<HarnessSkill, 'id' | 'version' | 'performance' | 'createdAt' | 'updatedAt'>): Promise<string>;
  evaluate(subjectKind: Reflection['subjectKind'], subjectId: string): Promise<Reflection>;
}

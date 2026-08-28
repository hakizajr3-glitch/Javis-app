/**
 * Browser-safe entry point for jarvis-core.
 *
 * The full index.ts pulls in Node-only modules (securityLayer uses node:crypto,
 * myaidocs uses node:crypto, connectorRegistry/desktopAutomation/browserControl
 * depend on securityLayer). Vite cannot bundle those into the desktop app, so
 * this barrel re-exports ONLY the modules whose transitive dependency graph is
 * browser-safe (uuid, eventBus, memoryEngine + the feature managers built on
 * them). All singleton managers here share the same in-memory Maps, so data
 * written through one import is visible through every other.
 */

// Observability
export { eventBus, EventBus, EventType } from './observability/eventBus.js';
export type {
  Event,
  EventFilter,
  Subscription,
  EventHandler,
} from './observability/eventBus.js';

// Persistence
export { persistentStore, PersistentStore } from './persistence/persistentStore.js';
export type {
  PersistenceBackend,
  BackendKind,
} from './persistence/persistentStore.js';

// LLM Orchestrator (uses fetch + guarded env — browser-safe)
export { llmOrchestrator, LLMOrchestrator } from './llm-orchestrator/llmOrchestrator.js';
export type {
  Provider,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  CostEstimate,
  RoutingDecision,
} from './llm-orchestrator/types.js';

// Memory Engine
export { memoryEngine, MemoryEngine } from './memory-engine/memoryEngine.js';
export type {
  MemoryTier,
  MemoryResult,
  MemoryFilter,
  ConsolidationResult,
  ArchivalResult,
} from './memory-engine/types.js';

// Identity & Permissions
export { identityPermissions, IdentityPermissions } from './identity-permissions/identityPermissions.js';
export type {
  UserId,
  OrgId,
  Role,
  ApprovalId,
  User,
  Organization,
  Permission,
  ApprovalRequest,
  Tool,
  Resource,
  Action,
} from './identity-permissions/types.js';

// Self-Improving Skills
export { taskLogger, TaskLogger } from './self-improving-skills/taskLogger.js';
export { patternDetection, PatternDetection } from './self-improving-skills/patternDetection.js';
export { skillProposal, SkillProposalManager } from './self-improving-skills/skillProposal.js';
export type {
  TaskId,
  SkillId,
  TaskLog,
  Pattern,
  Skill,
  SkillParameter,
  SkillPerformance,
  SkillProposal,
} from './self-improving-skills/types.js';

// Cowork v2 — workforce, organization, executive dashboard
export { aiWorkforce, AIWorkforce } from './cowork-v2/aiWorkforce.js';
export { organizationBuilder, OrganizationBuilder } from './cowork-v2/organizationBuilder.js';
export { executiveDashboard, ExecutiveDashboard } from './cowork-v2/executiveDashboard.js';
export type {
  AgentId,
  TeamId,
  Agent,
  AgentPerformance,
  Team,
  WorkforceAssignment,
  WorkforceCoordination,
  AgentCommunication,
  WorkforceMetrics,
  CoworkOrgId,
  CoworkOrganization,
  OrgStructure,
  OrgRole,
  OrgMember,
  DashboardId,
  Dashboard,
  DashboardWidget,
  DashboardMetric,
  DashboardAlert,
  DashboardReport,
} from './cowork-v2/types.js';

// Mission Runtime
export { missionCompiler, MissionCompiler } from './mission-runtime/missionCompiler.js';
export { missionScheduler, MissionScheduler } from './mission-runtime/missionScheduler.js';
export { missionSupervisor, MissionSupervisor } from './mission-runtime/missionSupervisor.js';
export type {
  MissionId,
  MissionTaskId,
  Mission,
  MissionPlan,
  Task,
  MissionSchedule,
  MissionExecution,
  ExecutionLog,
  ExecutionMetrics,
  CompiledMission,
} from './mission-runtime/types.js';

// Feature managers
export { tasksManager, TasksManager } from './tasks/tasks.js';
export type {
  UserTaskId,
  ProjectId,
  UserTask,
  Subtask,
  Project,
  TaskFilter,
  TaskAssignment,
} from './tasks/types.js';

export { notesManager, NotesManager } from './notes/notes.js';
export type {
  NoteId,
  NotebookId,
  Note,
  Notebook,
  NoteFilter,
  NoteShare,
} from './notes/types.js';

export { contactsManager, ContactsManager } from './contacts/contacts.js';
export type {
  ContactId,
  GroupId,
  Contact,
  ContactGroup,
  ContactFilter,
  ContactInteraction,
} from './contacts/types.js';

// Proactive Intelligence
export { usefulnessDetection, UsefulnessDetection } from './proactive-intelligence/usefulnessDetection.js';
export { eventDrivenSpeech, EventDrivenSpeech } from './proactive-intelligence/eventDrivenSpeech.js';
export type {
  SpeechTrigger,
  SpeechEvent,
  UsefulnessScore,
  ProactiveConfig,
} from './proactive-intelligence/types.js';

// ────────────────────────────────────────────────────────────────────────────
// Elite Agentic Harness — browser-safe pillars only.
// The following pillars are pure TypeScript + in-memory state and are safe
// to bundle into the desktop renderer:
//   - CapabilityRouter, VerificationEngine, MemoryRuntime, Orchestrator,
//     EventRuntime, LearningRuntime, SkillRuntime
//
// Excluded (pull in Node-only deps through their transitive imports):
//   - PolicyEngine (→ securityLayer → node:crypto)
//   - EnvironmentRuntime (→ desktop-browser-control → securityLayer)
//   - AgentRuntime (→ agentHarness → persistenceAdapter → fs/promises, better-sqlite3)
//   - MissionRuntime (→ missionSupervisor → agentHarness → persistenceAdapter)
//   - ReasoningEngine (→ vision-reasoning-engine → screenCapture → node:fs)
// These will be exposed to the renderer via Tauri IPC commands in Tier 2.
// ────────────────────────────────────────────────────────────────────────────
export { CapabilityRouter } from './harness/capabilityRouter.js';
export { VerificationEngine } from './harness/verificationEngine.js';
export { MemoryRuntime, freshDNA } from './harness/memoryRuntime.js';
export { Orchestrator } from './harness/orchestrator.js';
export { EventRuntime, nextCronDelay } from './harness/eventRuntime.js';
export { LearningRuntime } from './harness/learningRuntime.js';
export { SkillRuntime } from './harness/skillRuntime.js';
// Tier 2: Agent Factory, Workspaces, Knowledge Graph
export { AgentFactory, agentFactory, DEPARTMENTS } from './harness/agentFactory.js';
export type { DepartmentType, DepartmentDefinition, RoleDefinition, CreateAgentRequest, CreatedAgent } from './harness/agentFactory.js';
export { WorkspaceManager, workspaceManager } from './harness/workspaceManager.js';
export type { AgentWorkspace, WorkspaceCreateOptions } from './harness/workspaceManager.js';
export { KnowledgeGraph, knowledgeGraph } from './harness/knowledgeGraph.js';
export type { GraphEntity, GraphRelationship, EntityType, RelationshipType, GraphQuery, GraphTraversal } from './harness/knowledgeGraph.js';
export type {
  HarnessConfig,
  AutonomyLevel,
  RiskLevel,
  CapabilitySource,
  CapabilityDescriptor,
  Capability,
  CapabilityContext,
  CapabilityInvocation,
  CapabilityResult,
  CapabilityView,
  PolicyOutcome,
  PolicyRequest,
  PolicyDecision,
  StateSnapshot,
  Discrepancy,
  Evidence,
  VerificationResult,
  FailureClass,
  RecoveryAction,
  RecoveryPlan,
  MemoryKind,
  MemoryRelation,
  MemoryProvenance,
  MemoryRecord,
  MemoryQuery,
  AgentDNA,
  PerformanceRecord,
  EvolutionEvent,
  ModelCapabilityNeed,
  ModelPreference,
  ReasoningRequest,
  ReasoningResponse,
  HarnessTask,
  TaskGraph,
  OrchestrationPlan,
  TriggerKind,
  Trigger,
  TriggerAction,
  Reflection,
  ImprovementProposal,
  ProposalEvaluation,
  SelfModel,
  HarnessSkill,
  LoopPhase,
  LoopDefinition,
  HarnessRunRequest,
  HarnessRunResult,
  HarnessApi,
} from './harness/types.js';
export { AUTONOMY_LABELS, ELITE_LOOP } from './harness/types.js';

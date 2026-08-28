/**
 * JARVIS Elite Agentic Harness — public facade.
 *
 * One object that wires together all 12 pillars and exposes the HarnessApi
 * surface agents call into. This is the single entry point for "run an
 * objective through the harness".
 *
 * Construction is lazy: pillars are instantiated on first use so importing
 * the facade is cheap, and so tests can inject individual pieces without
 * having to construct the whole graph.
 */
import { v4 as uuidv4 } from 'uuid';
import {
  AutonomyLevel,
  HarnessApi,
  HarnessConfig,
  HarnessRunRequest,
  HarnessRunResult,
  HarnessSkill,
  HarnessTask,
  LoopDefinition,
  MemoryQuery,
  MemoryRecord,
  CapabilityView,
  Reflection,
} from './types.js';
import { PolicyEngine, policyEngine } from './policyEngine.js';
import { CapabilityRouter } from './capabilityRouter.js';
import { VerificationEngine } from './verificationEngine.js';
import { MemoryRuntime, freshDNA } from './memoryRuntime.js';
import { Orchestrator } from './orchestrator.js';
import { EventRuntime } from './eventRuntime.js';
import { LearningRuntime } from './learningRuntime.js';
import { MissionRuntime, missionRuntime } from './missionRuntime.js';
import { AgentRuntime, agentRuntime } from './agentRuntime.js';
import { ReasoningEngine, reasoningEngine } from './reasoningEngine.js';
import { SkillRuntime, skillRuntime } from './skillRuntime.js';
import { EnvironmentRuntime, environmentRuntime } from './environmentRuntime.js';
import { DeviceFabric, deviceFabric } from './deviceFabric.js';
import { DeviceDiscovery, deviceDiscovery } from './deviceDiscovery.js';
import { RemoteGateway, remoteGateway } from './remoteGateway.js';
import { SecurityFabric, securityFabric } from './securityFabric.js';
import { AgentFactory, agentFactory } from './agentFactory.js';
import { WorkspaceManager, workspaceManager } from './workspaceManager.js';
import { KnowledgeGraph, knowledgeGraph } from './knowledgeGraph.js';
import type { PersistenceAdapter } from '../persistence/types.js';

export interface HarnessFacadeOptions {
  config?: HarnessConfig;
  persistence?: PersistenceAdapter;
  /** Inject any pillar to override the default. */
  policy?: PolicyEngine;
  capabilityRouter?: CapabilityRouter;
  verificationEngine?: VerificationEngine;
  memoryRuntime?: MemoryRuntime;
  orchestrator?: Orchestrator;
  eventRuntime?: EventRuntime;
  learningRuntime?: LearningRuntime;
  /** Reasoning function for the orchestrator (see LLMAdapter.makeReasonFn). */
  reasonFn?: OrchestratorOptions['reasonFn'];
  /** Agent dispatch for the orchestrator (see AgentHarnessAdapter.makeAgentDispatch). */
  agentDispatch?: OrchestratorOptions['agentDispatch'];
}

// Re-export the orchestrator options type so callers don't need to import it separately.
import type { OrchestratorOptions } from './orchestrator.js';

export class HarnessFacade implements HarnessApi {
  readonly config: Required<HarnessConfig>;
  private policy: PolicyEngine;
  private router: CapabilityRouter;
  private verifier: VerificationEngine;
  private memory: MemoryRuntime;
  private orchestrator: Orchestrator;
  private events: EventRuntime;
  private learning: LearningRuntime;
  private missions: MissionRuntime;
  private agents: AgentRuntime;
  private reasoning: ReasoningEngine;
  private skills: SkillRuntime;
  private environment: EnvironmentRuntime;
  private deviceFabric: DeviceFabric;
  private deviceDiscovery: DeviceDiscovery;
  private remoteGateway: RemoteGateway;
  private securityFabric: SecurityFabric;
  private agentFactory: AgentFactory;
  private workspaceManager: WorkspaceManager;
  private knowledgeGraph: KnowledgeGraph;
  private started = false;

  constructor(opts: HarnessFacadeOptions = {}) {
    this.config = {
      userId: opts.config?.userId ?? 'system',
      autonomyLevel: opts.config?.autonomyLevel ?? 2,
      maxConcurrency: opts.config?.maxConcurrency ?? 4,
      maxAttemptsPerTask: opts.config?.maxAttemptsPerTask ?? 3,
      verificationEnabled: opts.config?.verificationEnabled ?? true,
      learningEnabled: opts.config?.learningEnabled ?? true,
    };
    this.policy = opts.policy ?? policyEngine;
    this.router = opts.capabilityRouter ?? new CapabilityRouter({ policy: this.policy });
    this.verifier = opts.verificationEngine ?? new VerificationEngine({ maxAttempts: this.config.maxAttemptsPerTask });
    this.memory = opts.memoryRuntime ?? new MemoryRuntime({ persistence: opts.persistence });
    this.orchestrator = opts.orchestrator ?? new Orchestrator({
      capabilityRouter: this.router,
      verificationEngine: this.verifier,
      memoryRuntime: this.memory,
      config: this.config,
      reasonFn: opts.reasonFn,
      agentDispatch: opts.agentDispatch,
    });
    this.events = opts.eventRuntime ?? new EventRuntime({
      capabilityRouter: this.router,
      orchestrator: this.orchestrator,
    });
    this.learning = opts.learningRuntime ?? new LearningRuntime({
      memoryRuntime: this.memory,
      verificationEngine: this.verifier,
    });
    this.missions = missionRuntime;
    this.agents = agentRuntime;
    this.reasoning = reasoningEngine;
    this.skills = new SkillRuntime(this.memory);
    this.environment = environmentRuntime;
    this.deviceFabric = deviceFabric;
    this.deviceDiscovery = deviceDiscovery;
    this.remoteGateway = remoteGateway;
    this.securityFabric = securityFabric;
    this.agentFactory = agentFactory;
    this.workspaceManager = workspaceManager;
    this.knowledgeGraph = knowledgeGraph;
    // Wire the agent factory to the memory runtime so created agents persist.
    this.agentFactory.setMemoryRuntime(this.memory);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.started) return;
    await this.memory.load();
    this.events.start();
    this.securityFabric.startMonitoring();
    this.started = true;
  }

  stop(): void {
    this.events.stop();
    this.securityFabric.stopMonitoring();
    this.deviceDiscovery.stopDiscovery();
    this.remoteGateway.disconnect();
    this.started = false;
  }

  // -------------------------------------------------------------------------
  // Top-level run
  // -------------------------------------------------------------------------

  async run(request: HarnessRunRequest): Promise<HarnessRunResult> {
    if (!this.started) await this.start();
    const result = await this.orchestrator.run({
      ...request,
      autonomyLevel: request.autonomyLevel ?? this.config.autonomyLevel,
    });
    // Learning pass — reflect on the mission, if enabled.
    if (this.config.learningEnabled && result.status !== 'planned') {
      result.reflection = await this.learning.evaluate({
        subjectKind: 'mission',
        subjectId: result.runId,
        run: result,
      });
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // Pillar accessors
  // -------------------------------------------------------------------------

  getPolicy(): PolicyEngine { return this.policy; }
  getCapabilityRouter(): CapabilityRouter { return this.router; }
  getVerificationEngine(): VerificationEngine { return this.verifier; }
  getMemoryRuntime(): MemoryRuntime { return this.memory; }
  getOrchestrator(): Orchestrator { return this.orchestrator; }
  getEventRuntime(): EventRuntime { return this.events; }
  getLearningRuntime(): LearningRuntime { return this.learning; }
  getMissionRuntime(): MissionRuntime { return this.missions; }
  getAgentRuntime(): AgentRuntime { return this.agents; }
  getReasoningEngine(): ReasoningEngine { return this.reasoning; }
  getSkillRuntime(): SkillRuntime { return this.skills; }
  getEnvironmentRuntime(): EnvironmentRuntime { return this.environment; }
  getDeviceFabric(): DeviceFabric { return this.deviceFabric; }
  getDeviceDiscovery(): DeviceDiscovery { return this.deviceDiscovery; }
  getRemoteGateway(): RemoteGateway { return this.remoteGateway; }
  getSecurityFabric(): SecurityFabric { return this.securityFabric; }
  getAgentFactory(): AgentFactory { return this.agentFactory; }
  getWorkspaceManager(): WorkspaceManager { return this.workspaceManager; }
  getKnowledgeGraph(): KnowledgeGraph { return this.knowledgeGraph; }

  // -------------------------------------------------------------------------
  // HarnessApi surface (model-callable)
  // -------------------------------------------------------------------------

  async getContext(): Promise<Record<string, any>> {
    return {
      config: this.config,
      capabilities: this.router.list().length,
      memoryStats: this.memory.getStats(),
      selfModel: this.learning.getSelfModel(),
    };
  }

  async inspectState(): Promise<Record<string, any>> {
    return {
      started: this.started,
      policy: this.policy.constructor.name,
      triggers: this.events.list().length,
      proposals: this.learning.listProposals().length,
      reflections: this.learning.listReflections().length,
      deviceFabric: this.deviceFabric.getStats(),
      securityFabric: this.securityFabric.getStats(),
      remoteGateway: this.remoteGateway.getStats(),
      knowledgeGraph: this.knowledgeGraph.getStats(),
      workspaces: this.workspaceManager.getStats(),
    };
  }

  async searchMemory(query: MemoryQuery): Promise<MemoryRecord[]> {
    return this.memory.searchMemory(query);
  }

  async saveMemory(record: Omit<MemoryRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    return this.memory.saveMemory({
      kind: record.kind,
      ownerId: record.ownerId,
      scope: record.scope,
      content: record.content,
      importance: record.importance,
      tags: record.tags,
      provenance: record.provenance,
      relations: record.relations,
    });
  }

  async queryKnowledge(text: string, limit?: number): Promise<MemoryRecord[]> {
    return this.memory.queryKnowledge(text, limit);
  }

  async inspectEvents(limit?: number): Promise<any[]> {
    // Delegate to the event bus history.
    const { eventBus } = await import('../observability/eventBus.js');
    return eventBus.getEventHistory().slice(0, limit ?? 50);
  }

  async createTask(task: Omit<HarnessTask, 'id' | 'status' | 'attempts'>): Promise<string> {
    const t = this.orchestrator.createTask(task);
    return t.id;
  }

  async delegate(objective: string, role?: string): Promise<string> {
    // Delegate = run a sub-mission through the orchestrator with an agent task.
    if (!this.started) await this.start();
    const result = await this.orchestrator.run({
      objective,
      userId: this.config.userId,
      context: { delegated: true, role },
    });
    return result.runId;
  }

  async requestTool(intent: string): Promise<CapabilityView> {
    return this.router.viewFor(intent);
  }

  async createSkill(skill: Omit<HarnessSkill, 'id' | 'version' | 'performance' | 'createdAt' | 'updatedAt'>): Promise<string> {
    // Skills are stored as procedural memory records for now; a dedicated
    // SkillRuntime can be layered on top later without changing this API.
    const id = uuidv4();
    await this.memory.saveMemory({
      kind: 'skill',
      ownerId: this.config.userId,
      scope: 'shared',
      content: `${skill.name}: ${skill.instructions}`,
      importance: 0.8,
      tags: ['skill', skill.name],
      provenance: {
        source: 'harness:api',
        confidence: 0.8,
        evidence: [{ kind: 'assertion', detail: skill.purpose }],
      },
    });
    return id;
  }

  async evaluate(subjectKind: Reflection['subjectKind'], subjectId: string): Promise<Reflection> {
    return this.learning.evaluate({ subjectKind, subjectId });
  }
}

/**
 * Convenience: a lazily-constructed singleton harness. Most CLI / API entry
 * points should use this; tests should construct their own HarnessFacade.
 */
let _singleton: HarnessFacade | undefined;

export function getHarness(opts?: HarnessFacadeOptions): HarnessFacade {
  if (!_singleton) _singleton = new HarnessFacade(opts);
  return _singleton;
}

export function resetHarness(): void {
  if (_singleton) {
    _singleton.stop();
    _singleton = undefined;
  }
}

// Re-export the pillar classes + types so callers can import everything from one place.
export * from './types.js';
export * from './policyEngine.js';
export * from './capabilityRouter.js';
export * from './verificationEngine.js';
export * from './memoryRuntime.js';
export * from './orchestrator.js';
export * from './eventRuntime.js';
export * from './learningRuntime.js';
export * from './missionRuntime.js';
export * from './agentRuntime.js';
export * from './reasoningEngine.js';
export * from './skillRuntime.js';
export * from './environmentRuntime.js';
export * from './deviceFabric.js';
export * from './deviceDiscovery.js';
export * from './remoteGateway.js';
export * from './securityFabric.js';
export * from './agentFactory.js';
export * from './workspaceManager.js';
export * from './knowledgeGraph.js';
export * from './adapters/index.js';

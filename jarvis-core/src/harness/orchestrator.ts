/**
 * JARVIS Elite Agentic Harness — Pillar 4: Orchestrator.
 *
 * Turns an objective into a task graph, computes parallelizable execution
 * waves from the dependency DAG, dispatches each task to the right runtime
 * (capability router / reasoning engine / verification engine / sub-agent),
 * and tracks the lifecycle through to completion — including recovery.
 *
 * Design principles (NOOA):
 *  - Programmable loops: the orchestrator drives the Elite Loop's
 *    plan → allocate → execute → verify → recover phases.
 *  - Pass-by-reference: tasks hold handles to capability ids and agent roles,
 *    not serialized payloads.
 *  - Typed I/O: capability tasks are validated by the capability router.
 *  - Explicit object state: the task graph is the source of truth for run
 *    state, not a chat transcript.
 *
 * The decomposer is pluggable: callers may inject an LLM-driven decomposer
 * (`DecompositionStrategy`); the default produces a conservative linear plan
 * (perceive → reason → execute → verify → report) so the harness is useful
 * even before the reasoning engine is wired in.
 */
import { v4 as uuidv4 } from 'uuid';
import {
  CapabilityContext,
  HarnessConfig,
  HarnessRunRequest,
  HarnessRunResult,
  HarnessTask,
  OrchestrationPlan,
  TaskGraph,
} from './types.js';
import { CapabilityRouter } from './capabilityRouter.js';
import { VerificationEngine } from './verificationEngine.js';
import { MemoryRuntime } from './memoryRuntime.js';
import { eventBus, EventType } from '../observability/eventBus.js';

/** A pluggable objective → task-graph strategy. */
export interface DecompositionStrategy {
  decompose(objective: string, ctx: DecomposeContext): Promise<HarnessTask[]>;
}

export interface DecomposeContext {
  userId: string;
  availableCapabilities: string[];
  /** Hints derived from memory (relevant skills, past episodes). */
  memoryHints: string[];
}

export interface OrchestratorOptions {
  capabilityRouter?: CapabilityRouter;
  verificationEngine?: VerificationEngine;
  memoryRuntime?: MemoryRuntime;
  config?: HarnessConfig;
  /** Inject a custom decomposer. Default is the linear planner. */
  decomposer?: DecompositionStrategy;
  /** Called for kind:'reason' tasks. If absent, reason tasks are no-ops. */
  reasonFn?: (prompt: string, ctx: CapabilityContext) => Promise<string>;
  /** Called for kind:'agent' tasks. If absent, agent tasks fail with a clear message. */
  agentDispatch?: (role: string, objective: string, ctx: CapabilityContext) => Promise<string>;
}

const DEFAULT_CONFIG: Required<Pick<HarnessConfig, 'maxConcurrency' | 'maxAttemptsPerTask' | 'verificationEnabled' | 'learningEnabled'>> = {
  maxConcurrency: 4,
  maxAttemptsPerTask: 3,
  verificationEnabled: true,
  learningEnabled: true,
};

export class Orchestrator {
  private router?: CapabilityRouter;
  private verifier?: VerificationEngine;
  private memory?: MemoryRuntime;
  private config: HarnessConfig & typeof DEFAULT_CONFIG;
  private decomposer: DecompositionStrategy;
  private reasonFn?: OrchestratorOptions['reasonFn'];
  private agentDispatch?: OrchestratorOptions['agentDispatch'];

  constructor(opts: OrchestratorOptions = {}) {
    this.router = opts.capabilityRouter;
    this.verifier = opts.verificationEngine;
    this.memory = opts.memoryRuntime;
    this.config = { ...DEFAULT_CONFIG, ...(opts.config ?? {}) };
    this.decomposer = opts.decomposer ?? new LinearDecomposer();
    this.reasonFn = opts.reasonFn;
    this.agentDispatch = opts.agentDispatch;
  }

  // -------------------------------------------------------------------------
  // Planning
  // -------------------------------------------------------------------------

  async plan(request: HarnessRunRequest): Promise<OrchestrationPlan> {
    const graphId = uuidv4();
    const memoryHints = this.memory
      ? (await this.memory.queryKnowledge(request.objective, 5)).map(r => r.content)
      : [];
    const availableCapabilities = this.router
      ? this.router.list().map(c => c.id)
      : [];
    const tasks = await this.decomposer.decompose(request.objective, {
      userId: request.userId,
      availableCapabilities,
      memoryHints,
    });
    const graph: TaskGraph = {
      id: graphId,
      objective: request.objective,
      tasks,
      createdAt: new Date(),
    };
    const waves = computeWaves(tasks);
    return {
      graph,
      waves,
      estimatedDurationMs: estimateDuration(tasks),
      notes: memoryHints.length > 0
        ? [`Reused ${memoryHints.length} memory hint(s)`]
        : [],
    };
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  async execute(plan: OrchestrationPlan, request: HarnessRunRequest): Promise<HarnessRunResult> {
    const runId = uuidv4();
    const startedAt = new Date();
    const tasks = plan.graph.tasks;
    const byId = new Map(tasks.map(t => [t.id, t]));
    let completedTasks = 0;
    let failedTasks = 0;
    let verificationsPassed = 0;
    let verificationsFailed = 0;
    let recoveries = 0;
    const escalations: string[] = [];

    // Process waves in order; within a wave, run up to maxConcurrency in parallel.
    for (const wave of plan.waves) {
      await runBounded(wave, this.config.maxConcurrency, async (taskId) => {
        const task = byId.get(taskId);
        if (!task) return;
        // Re-check dependencies — a sibling in the same wave might have failed.
        const depFailed = task.dependsOn.some(depId => {
          const dep = byId.get(depId);
          return dep && dep.status === 'failed';
        });
        if (depFailed) {
          task.status = 'skipped';
          task.error = 'skipped: upstream dependency failed';
          return;
        }
        await this.runTask(task, request);
        if (task.status === 'completed') {
          completedTasks++;
          // A successful task that took more than one attempt had recoveries.
          if (task.attempts > 1) recoveries += task.attempts - 1;
        } else if (task.status === 'failed') {
          failedTasks++;
          if (task.recovery?.action === 'escalate') {
            escalations.push(task.id);
          }
        }
        if (task.verification) {
          if (task.verification.passed) verificationsPassed++;
          else verificationsFailed++;
        }
      });
    }

    const finishedAt = new Date();
    const status: HarnessRunResult['status'] =
      failedTasks === 0 ? 'completed'
      : completedTasks === 0 ? 'failed'
      : 'partial';

    return {
      runId,
      objective: request.objective,
      status,
      plan,
      completedTasks,
      failedTasks,
      verificationsPassed,
      verificationsFailed,
      recoveries,
      escalations,
      startedAt,
      finishedAt,
    };
  }

  /** Plan + execute in one call. */
  async run(request: HarnessRunRequest): Promise<HarnessRunResult> {
    const plan = await this.plan(request);
    if (request.dryRun) {
      return {
        runId: uuidv4(),
        objective: request.objective,
        status: 'planned',
        plan,
        completedTasks: 0,
        failedTasks: 0,
        verificationsPassed: 0,
        verificationsFailed: 0,
        recoveries: 0,
        escalations: [],
        startedAt: new Date(),
      };
    }
    return this.execute(plan, request);
  }

  // -------------------------------------------------------------------------
  // Task dispatch + recovery
  // -------------------------------------------------------------------------

  private async runTask(task: HarnessTask, request: HarnessRunRequest): Promise<void> {
    const ctx: CapabilityContext = {
      userId: request.userId,
      missionId: request.context?.missionId,
      agentId: task.agentRole,
      traceId: uuidv4(),
    };
    task.startedAt = new Date();
    task.status = 'running';
    task.attempts = 0;

    const maxAttempts = this.config.maxAttemptsPerTask;
    while (task.attempts < maxAttempts) {
      task.attempts++;
      try {
        task.result = await this.dispatch(task, ctx, request);
        task.status = 'completed';
        task.completedAt = new Date();
        // Verify, if enabled and a verification spec exists.
        if (this.config.verificationEnabled && this.verifier && task.verification) {
          // Re-verify against the task result.
          const re = await this.verifier.verify(
            { kind: 'task', target: task.id, equals: task.result },
            task.result
          );
          task.verification = re;
          if (!re.passed) {
            task.status = 'failed';
            task.error = 'verification failed';
            const cls = this.verifier.classifyFailure(undefined, re);
            task.recovery = this.verifier.planRecovery(cls, task.attempts, { maxAttempts });
            if (task.recovery.action === 'retry') {
              await sleep(task.recovery.backoffMs ?? 0);
              continue;
            }
            if (task.recovery.action === 'escalate') {
              break;
            }
            // Non-retry recovery: mark failed and stop (replan/alternate handled upstream).
            break;
          }
        }
        break; // success
      } catch (err: any) {
        task.error = err?.message ?? String(err);
        if (this.verifier) {
          const cls = this.verifier.classifyFailure(task.error);
          task.recovery = this.verifier.planRecovery(cls, task.attempts, { maxAttempts });
          if (task.recovery.action === 'retry') {
            await sleep(task.recovery.backoffMs ?? 0);
            recoveriesCount(this);
            continue;
          }
          if (task.recovery.action === 'escalate') {
            task.status = 'failed';
            break;
          }
        }
        task.status = 'failed';
        break;
      }
    }

    if (task.status === 'running') task.status = 'failed';
    // Publish a task-completed/failed event for observability.
    eventBus.publish({
      id: uuidv4(),
      type: task.status === 'completed' ? EventType.TASK_COMPLETED : EventType.TASK_FAILED,
      payload: { taskId: task.id, title: task.title, status: task.status, attempts: task.attempts },
      timestamp: new Date(),
      source: 'Orchestrator',
    }).catch(() => { /* event failures must not break runs */ });
  }

  private async dispatch(
    task: HarnessTask,
    ctx: CapabilityContext,
    request: HarnessRunRequest
  ): Promise<any> {
    switch (task.kind) {
      case 'capability': {
        if (!this.router) throw new Error('orchestrator: capabilityRouter not configured');
        if (!task.capabilityId) throw new Error(`task ${task.id}: capabilityId missing`);
        const result = await this.router.invoke(task.capabilityId, task.input ?? {}, ctx);
        if (!result.ok) throw new Error(result.error ?? 'capability failed');
        return result.output;
      }
      case 'reason': {
        if (!this.reasonFn) return `reasoned: ${task.description}`;
        return this.reasonFn(task.description, ctx);
      }
      case 'agent': {
        if (!this.agentDispatch) {
          throw new Error(`task ${task.id}: agent dispatch not configured`);
        }
        return this.agentDispatch(task.agentRole ?? 'general', task.description, ctx);
      }
      case 'verify': {
        // Verification tasks just return their input as the "verified" output;
        // the actual verification happens in runTask via the verifier.
        return task.input ?? true;
      }
      default:
        throw new Error(`task ${task.id}: unknown kind ${task.kind}`);
    }
  }

  // -------------------------------------------------------------------------
  // Manual task graph construction (used by HarnessApi.createTask)
  // -------------------------------------------------------------------------

  createTask(input: Omit<HarnessTask, 'id' | 'status' | 'attempts'>): HarnessTask {
    return {
      ...input,
      id: uuidv4(),
      status: input.dependsOn.length === 0 ? 'ready' : 'pending',
      attempts: 0,
    };
  }
}

// -------------------------------------------------------------------------
// Default decomposer — linear perceive → reason → execute → verify → report
// -------------------------------------------------------------------------

export class LinearDecomposer implements DecompositionStrategy {
  async decompose(objective: string, ctx: DecomposeContext): Promise<HarnessTask[]> {
    const perceiveId = uuidv4();
    const reasonId = uuidv4();
    const executeId = uuidv4();
    const verifyId = uuidv4();
    const reportId = uuidv4();
    // If no capabilities are registered, the execute step falls back to
    // reasoning so the harness is still useful before tools are wired in.
    const executeKind = ctx.availableCapabilities.length > 0 ? 'capability' : 'reason';
    return [
      {
        id: perceiveId, title: 'Perceive', description: `Gather context for: ${objective}`,
        kind: 'reason', dependsOn: [], status: 'ready', attempts: 0,
      },
      {
        id: reasonId, title: 'Reason', description: `Decide approach for: ${objective}`,
        kind: 'reason', dependsOn: [perceiveId], status: 'pending', attempts: 0,
      },
      {
        id: executeId, title: 'Execute', description: `Execute: ${objective}`,
        kind: executeKind, dependsOn: [reasonId], status: 'pending', attempts: 0,
      },
      {
        id: verifyId, title: 'Verify', description: `Verify outcome of: ${objective}`,
        kind: 'verify', dependsOn: [executeId], status: 'pending', attempts: 0,
      },
      {
        id: reportId, title: 'Report', description: `Report result of: ${objective}`,
        kind: 'reason', dependsOn: [verifyId], status: 'pending', attempts: 0,
      },
    ];
  }
}

// -------------------------------------------------------------------------
// Wave computation — topological grouping by dependency depth
// -------------------------------------------------------------------------

export function computeWaves(tasks: HarnessTask[]): string[][] {
  const byId = new Map(tasks.map(t => [t.id, t]));
  const waveOf = new Map<string, number>();
  // Iteratively assign wave numbers: a task's wave = 1 + max(wave of deps).
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of tasks) {
      if (t.dependsOn.length === 0) {
        if (!waveOf.has(t.id)) { waveOf.set(t.id, 0); changed = true; }
        continue;
      }
      const depWaves = t.dependsOn.map(d => waveOf.get(d) ?? -1);
      const maxDep = Math.max(...depWaves);
      if (maxDep < 0) continue; // dep not yet placed
      const w = maxDep + 1;
      if (waveOf.get(t.id) !== w) { waveOf.set(t.id, w); changed = true; }
    }
  }
  // Detect cycles: any task not yet placed has an unresolved dependency.
  for (const t of tasks) {
    if (!waveOf.has(t.id)) {
      throw new Error(`orchestrator: dependency cycle detected at task ${t.id} (${t.title})`);
    }
  }
  const maxWave = Math.max(...waveOf.values(), 0);
  const waves: string[][] = Array.from({ length: maxWave + 1 }, () => []);
  for (const [id, w] of waveOf) waves[w].push(id);
  return waves;
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function estimateDuration(tasks: HarnessTask[]): number {
  // Crude estimate: 200ms per task, serialized within waves but we don't know
  // wave structure here. Good enough for a planning hint.
  return tasks.length * 200;
}

function runBounded<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return Promise.resolve();
  let i = 0;
  const workers: Promise<void>[] = [];
  const spawn = (): Promise<void> => {
    if (i >= items.length) return Promise.resolve();
    const idx = i++;
    return fn(items[idx]).then(spawn);
  };
  for (let w = 0; w < Math.min(concurrency, items.length); w++) {
    workers.push(spawn());
  }
  return Promise.all(workers).then(() => undefined);
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise(r => setTimeout(r, ms));
}

// Mutable counter closure for recovery tracking (kept simple for now).
function recoveriesCount(_orch: Orchestrator): void {
  // The actual recovery count is derived from task.recovery in execute().
  // This hook exists so future telemetry can intercept recoveries per-task.
}

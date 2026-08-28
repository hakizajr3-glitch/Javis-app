/**
 * JARVIS Elite Agentic Harness — Pillar 1: Agent Runtime.
 *
 * Wraps the existing agent-harness module (agentHarness + agentRegistry +
 * subAgentRunner) behind the harness's typed interface. Agents are the
 * workers that execute tasks — each has identity, role, tools, permissions,
 * and a lifecycle.
 *
 * Design principles (NOOA):
 *  - Explicit object state: agent state lives on AgentDNA (via memoryRuntime),
 *    not in chat history.
 *  - Pass-by-reference: agents hold handles to live objects.
 *  - Sub-agent spawning: agents can delegate to child agents.
 */
import { v4 as uuidv4 } from 'uuid';
import { agentHarness } from '../agent-harness/agentHarness.js';
import { agentRegistry } from '../agent-harness/agentRegistry.js';
import { subAgentRunner } from '../agent-harness/subAgentRunner.js';
import type { AgentBlueprint, AgentInstance, AgentRun, AgentRole } from '../agent-harness/types.js';
import { eventBus, EventType } from '../observability/eventBus.js';

export interface SpawnAgentInput {
  blueprintId?: string;
  role?: AgentRole;
  name?: string;
  goal: string;
  parentAgentId?: string;
  parentRunId?: string;
  userId: string;
  context?: Record<string, any>;
  tools?: AgentBlueprint['tools'];
}

export interface AgentState {
  agentId: string;
  runId: string;
  state: AgentInstance['state'];
  role: AgentRole;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export class AgentRuntime {
  /**
   * Spawn an agent — creates an agent instance and starts its run loop.
   * If a blueprintId is given, uses that blueprint; otherwise picks one by role.
   */
  async spawn(input: SpawnAgentInput): Promise<AgentInstance> {
    const blueprint = input.blueprintId
      ? agentRegistry.get(input.blueprintId)
      : this.pickBlueprintForRole(input.role ?? 'custom');

    if (!blueprint) {
      throw new Error(`AgentRuntime: no blueprint found for role "${input.role ?? 'custom'}"`);
    }

    const instance = await agentHarness.spawnSubAgent({
      goal: input.goal,
      role: input.role,
      blueprintId: blueprint.id,
      name: input.name,
      tools: input.tools,
      context: input.context,
      parentAgentId: input.parentAgentId ?? 'harness',
      parentRunId: input.parentRunId ?? `harness-${uuidv4()}`,
      userId: input.userId,
    });

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.COWORKER_ASSIGNED,
      payload: { agentId: instance.id, role: instance.role, name: instance.name },
      timestamp: new Date(),
      source: 'AgentRuntime',
    });

    return instance;
  }

  /** Run an agent to completion (waits for the run to finish). */
  async run(agentId: string, timeoutMs = 120_000): Promise<AgentRun | undefined> {
    const instance = agentHarness.getInstance(agentId);
    if (!instance) throw new Error(`AgentRuntime: agent ${agentId} not found`);
    return agentHarness.waitForRunCompletion(instance.runId, timeoutMs);
  }

  /** Stop a running agent. */
  async stop(agentId: string): Promise<void> {
    const instance = agentHarness.getInstance(agentId);
    if (!instance) throw new Error(`AgentRuntime: agent ${agentId} not found`);
    await agentHarness.cancelRun(instance.runId);
  }

  /** Pause a running agent (best-effort). */
  async pause(agentId: string): Promise<void> {
    const instance = agentHarness.getInstance(agentId);
    if (!instance) throw new Error(`AgentRuntime: agent ${agentId} not found`);
    // The legacy harness doesn't have a pause method; we set state directly.
    instance.state = 'paused';
    await eventBus.publish({
      id: uuidv4(),
      type: EventType.COWORKER_STATUS_CHANGED,
      payload: { agentId, state: 'paused' },
      timestamp: new Date(),
      source: 'AgentRuntime',
    });
  }

  /** Resume a paused agent. */
  async resume(agentId: string): Promise<void> {
    const instance = agentHarness.getInstance(agentId);
    if (!instance) throw new Error(`AgentRuntime: agent ${agentId} not found`);
    instance.state = 'running';
    await eventBus.publish({
      id: uuidv4(),
      type: EventType.COWORKER_STATUS_CHANGED,
      payload: { agentId, state: 'running' },
      timestamp: new Date(),
      source: 'AgentRuntime',
    });
  }

  /** Get the current state of an agent. */
  getState(agentId: string): AgentState | undefined {
    const instance = agentHarness.getInstance(agentId);
    if (!instance) return undefined;
    return {
      agentId: instance.id,
      runId: instance.runId,
      state: instance.state,
      role: instance.role,
      name: instance.name,
      createdAt: instance.createdAt,
      updatedAt: instance.updatedAt,
    };
  }

  /** List all active agents. */
  listAgents(): AgentState[] {
    return agentHarness.listInstances().map(i => ({
      agentId: i.id,
      runId: i.runId,
      state: i.state,
      role: i.role,
      name: i.name,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));
  }

  /** Register a blueprint (agent template). */
  registerBlueprint(blueprint: AgentBlueprint): void {
    agentRegistry.register(blueprint);
  }

  /** List all registered blueprints. */
  listBlueprints(): AgentBlueprint[] {
    return agentRegistry.list();
  }

  /** Get a blueprint by id. */
  getBlueprint(id: string): AgentBlueprint | undefined {
    return agentRegistry.get(id);
  }

  /** Get blueprints by role. */
  getBlueprintsByRole(role: AgentRole): AgentBlueprint[] {
    return agentRegistry.getByRole(role);
  }

  /** Delegate a sub-task from one agent to another. */
  async delegate(
    parentAgentId: string,
    goal: string,
    role: AgentRole,
    userId: string,
    context?: Record<string, any>
  ): Promise<AgentInstance> {
    const parent = agentHarness.getInstance(parentAgentId);
    if (!parent) throw new Error(`AgentRuntime: parent agent ${parentAgentId} not found`);

    return this.spawn({
      goal,
      role,
      parentAgentId,
      parentRunId: parent.runId,
      userId,
      context,
    });
  }

  private pickBlueprintForRole(role: AgentRole): AgentBlueprint | undefined {
    const byRole = agentRegistry.getByRole(role);
    if (byRole.length > 0) return byRole[0];
    return agentRegistry.list().find(b => b.role === 'custom');
  }
}

/** Singleton instance. */
export const agentRuntime = new AgentRuntime();

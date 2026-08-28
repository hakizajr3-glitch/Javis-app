/**
 * AgentHarnessAdapter — bridges the existing agent-harness subsystem into
 * the orchestrator's `agentDispatch` slot.
 *
 * When the orchestrator encounters a `kind: 'agent'` task, it calls
 * `agentDispatch(role, objective, ctx)`. This adapter spawns a sub-agent
 * via `agentHarness.spawnSubAgent` and waits for its run to complete,
 * returning the agent's final message as the task result.
 */
import { CapabilityContext } from '../types.js';
import { agentHarness } from '../../agent-harness/agentHarness.js';
import { agentRegistry } from '../../agent-harness/agentRegistry.js';
import type { AgentBlueprint, AgentRole } from '../../agent-harness/types.js';

/**
 * Returns an `agentDispatch` function suitable for `Orchestrator({ agentDispatch })`.
 * It looks up a blueprint by role, spawns a sub-agent for the objective, and
 * returns the agent's final assistant message.
 */
export function makeAgentDispatch() {
  return async (role: string, objective: string, ctx: CapabilityContext): Promise<string> => {
    // Find a blueprint whose role matches.
    const blueprints = agentRegistry.list();
    const byRole = blueprints.filter(b => b.role === role);
    const blueprint = byRole[0] ?? blueprints.find(b => b.role === 'custom');
    if (!blueprint) {
      throw new Error(`AgentHarnessAdapter: no blueprint found for role "${role}"`);
    }
    const instance = await agentHarness.spawnSubAgent({
      parentAgentId: ctx.agentId ?? 'harness',
      parentRunId: ctx.missionId ?? `harness-${ctx.traceId}`,
      blueprintId: blueprint.id,
      goal: objective,
      userId: ctx.userId,
      context: { missionId: ctx.missionId, traceId: ctx.traceId },
    });
    // Wait for the run to finish (best-effort; timeout is handled by the harness).
    const run = await agentHarness.waitForRunCompletion(instance.runId, 60_000);
    if (!run) {
      throw new Error(`AgentHarnessAdapter: agent run ${instance.runId} timed out`);
    }
    // Return the last assistant message, or a summary if none.
    const inst = agentHarness.getInstance(instance.id);
    const messages = inst?.messages ?? [];
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    return lastAssistant?.content ?? `agent ${role} completed (no message)`;
  };
}

/** Register a harness AgentBlueprint derived from a harness-level role spec. */
export function registerBlueprintFromRole(
  role: string,
  spec: {
    name: string;
    description: string;
    systemPrompt: string;
    modelProvider?: AgentBlueprint['modelConfig']['provider'];
    modelName?: string;
  }
): AgentBlueprint {
  const blueprint: AgentBlueprint = {
    id: `harness-${role}-${Date.now()}`,
    name: spec.name,
    role: (role as AgentRole) ?? 'custom',
    description: spec.description,
    systemPrompt: spec.systemPrompt,
    tools: [],
    modelConfig: {
      provider: spec.modelProvider ?? 'openai',
      model: spec.modelName,
    },
    maxIterations: 10,
    allowSubAgents: false,
  };
  agentRegistry.register(blueprint);
  return blueprint;
}

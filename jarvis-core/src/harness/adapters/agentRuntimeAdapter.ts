/**
 * Adapter — bridges the existing agent-harness module into the harness
 * AgentRuntime. This is a thin wrapper that lets the harness spawn, run,
 * stop, and manage agents through the existing agentHarness/agentRegistry
 * stack.
 */
export { AgentRuntime, agentRuntime } from '../agentRuntime.js';
export type { SpawnAgentInput, AgentState } from '../agentRuntime.js';

// Also re-export the agentHarnessAdapter for backward compatibility.
export { makeAgentDispatch, registerBlueprintFromRole } from './agentHarnessAdapter.js';

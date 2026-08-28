/**
 * JARVIS Elite Agentic Harness — Adapter Layer.
 *
 * Bridges the new harness runtime (Pillars 1–12) to the existing JARVIS
 * modules so the harness can be adopted incrementally without rewriting
 * working code. Each adapter wraps one legacy subsystem and exposes it
 * through the harness's typed interfaces.
 *
 * Adapters are intentionally thin: they translate types and delegate. They
 * do NOT duplicate logic, persist state, or make policy decisions — those
 * concerns live in the harness runtimes.
 *
 * Adapters:
 *  - missionRuntimeAdapter:  mission-runtime → MissionRuntime
 *  - agentRuntimeAdapter:    agent-harness → AgentRuntime
 *  - agentHarnessAdapter:    agent-harness → Orchestrator.agentDispatch
 *  - llmAdapter:             llm-orchestrator → ReasoningEngine
 *  - memoryRuntimeAdapter:   memory-engine → MemoryRuntime
 *  - memoryEngineAdapter:    memory-engine → MemoryRuntime (one-way import)
 *  - skillRuntimeAdapter:    self-improving-skills → SkillRuntime
 *  - securityAdapter:        securityLayer → PolicyEngine
 *  - eventBusAdapter:        eventBus → EventRuntime
 *  - connectorAdapter:       integrations-connector-layer → CapabilityRouter
 */
export * from './missionRuntimeAdapter.js';
export * from './agentRuntimeAdapter.js';
export * from './agentHarnessAdapter.js';
export * from './llmAdapter.js';
export * from './memoryRuntimeAdapter.js';
export * from './memoryEngineAdapter.js';
export * from './skillRuntimeAdapter.js';
export * from './securityAdapter.js';
export * from './eventBusAdapter.js';
export * from './connectorAdapter.js';

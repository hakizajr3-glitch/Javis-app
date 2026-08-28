import dotenv from 'dotenv';

dotenv.config();

// Export core services
export { eventBus, EventBus, EventType } from './observability/eventBus.js';
export type { Event, EventFilter, Subscription, EventHandler } from './observability/eventBus.js';
export { securityLayer, SecurityLayer } from './security/securityLayer.js';
export { processSandbox, ProcessSandbox } from './security/sandbox.js';
import { identityPermissions } from './identity-permissions/identityPermissions.js';
export { llmOrchestrator, LLMOrchestrator } from './llm-orchestrator/llmOrchestrator.js';
export { memoryEngine, MemoryEngine } from './memory-engine/memoryEngine.js';
export { myAIDocs, MyAIDocs } from './myaidocs/myaidocs.js';
export { taskLogger, TaskLogger } from './self-improving-skills/taskLogger.js';
export { patternDetection, PatternDetection } from './self-improving-skills/patternDetection.js';
export { skillProposal, SkillProposalManager } from './self-improving-skills/skillProposal.js';
export { usefulnessDetection, UsefulnessDetection } from './proactive-intelligence/usefulnessDetection.js';
export { eventDrivenSpeech, EventDrivenSpeech } from './proactive-intelligence/eventDrivenSpeech.js';
export { screenCapture, ScreenCaptureManager } from './vision-reasoning-engine/screenCapture.js';
export { imageUnderstanding, ImageUnderstanding } from './vision-reasoning-engine/imageUnderstanding.js';
export { feedbackLoop, FeedbackLoop } from './vision-reasoning-engine/feedbackLoop.js';
export { desktopAutomation, DesktopAutomation } from './desktop-browser-control/desktopAutomation.js';
export { browserControl, BrowserControl } from './desktop-browser-control/browserControl.js';
export { connectorRegistry, ConnectorRegistry } from './integrations-connector-layer/connectorRegistry.js';
export { FileSystemConnector } from './integrations-connector-layer/connectors/fileSystemConnector.js';
export { HttpConnector } from './integrations-connector-layer/connectors/httpConnector.js';
export { DatabaseConnector } from './integrations-connector-layer/connectors/databaseConnector.js';
export { GitHubConnector } from './integrations-connector-layer/connectors/githubConnector.js';
export { GmailConnector } from './integrations-connector-layer/connectors/gmailConnector.js';
export { GoogleCalendarConnector } from './integrations-connector-layer/connectors/googleCalendarConnector.js';
export { SlackConnector } from './integrations-connector-layer/connectors/slackConnector.js';
export { TelegramConnector } from './integrations-connector-layer/connectors/telegramConnector.js';
export { DiscordConnector } from './integrations-connector-layer/connectors/discordConnector.js';
export { ShellSandboxConnector } from './integrations-connector-layer/connectors/shellSandboxConnector.js';
export { missionCompiler, MissionCompiler } from './mission-runtime/missionCompiler.js';
export {
  InMemoryPersistence,
  JsonFilePersistence,
  RedisPersistence,
  SqlitePersistence,
  PersistenceManager,
  persistenceManager,
} from './persistence/persistenceAdapter.js';
export { persistenceWrapper, PersistenceWrapper } from './persistence/persistenceWrapper.js';
export type { Persistable } from './persistence/persistenceWrapper.js';
export { createApiServer } from './api/server.js';
export type { ApiServerOptions } from './api/server.js';
export { missionScheduler, MissionScheduler } from './mission-runtime/missionScheduler.js';
export { missionSupervisor, MissionSupervisor } from './mission-runtime/missionSupervisor.js';
export { workspaceManager, WorkspaceManager } from './mission-runtime/workspaceManager.js';
export { aiWorkforce, AIWorkforce } from './cowork-v2/aiWorkforce.js';
export { organizationBuilder, OrganizationBuilder } from './cowork-v2/organizationBuilder.js';
export { executiveDashboard, ExecutiveDashboard } from './cowork-v2/executiveDashboard.js';
export { agentHarness, AgentHarness } from './agent-harness/agentHarness.js';
export { agentRegistry, AgentRegistry } from './agent-harness/agentRegistry.js';
export { subAgentRunner, SubAgentRunner } from './agent-harness/subAgentRunner.js';
export { notesManager, NotesManager } from './notes/notes.js';
export { tasksManager, TasksManager } from './tasks/tasks.js';
export { contactsManager, ContactsManager } from './contacts/contacts.js';

// Elite Agentic Harness — the unified 12-pillar runtime.
export {
  HarnessFacade,
  getHarness,
  resetHarness,
} from './harness/index.js';
export type { HarnessFacadeOptions } from './harness/index.js';

// Device Fabric — device discovery, identity, pairing, remote access.
export { deviceFabric, DeviceFabric } from './harness/deviceFabric.js';
export { deviceDiscovery, DeviceDiscovery } from './harness/deviceDiscovery.js';
export { remoteGateway, RemoteGateway } from './harness/remoteGateway.js';

// Security Fabric — defensive security auditing, monitoring, incident response.
export { securityFabric, SecurityFabric } from './harness/securityFabric.js';

// Agent Factory — create specialized agents on demand with departments.
export { agentFactory, AgentFactory, DEPARTMENTS } from './harness/agentFactory.js';
export type { DepartmentType, DepartmentDefinition, RoleDefinition, CreateAgentRequest, CreatedAgent } from './harness/agentFactory.js';

// Workspace Manager — isolated per-agent workspaces (harness).
export { workspaceManager as agentWorkspaceManager, WorkspaceManager as AgentWorkspaceManager } from './harness/workspaceManager.js';
export type { AgentWorkspace, WorkspaceCreateOptions } from './harness/workspaceManager.js';

// Knowledge Graph — entities and relationships.
export { knowledgeGraph, KnowledgeGraph } from './harness/knowledgeGraph.js';
export type { GraphEntity, GraphRelationship, EntityType, RelationshipType, GraphQuery, GraphTraversal } from './harness/knowledgeGraph.js';

// Playwright browser sidecar client — real browser automation.
export { playwrightSidecar } from './browser-control/playwrightSidecarClient.js';

// Export types
export * from './identity-permissions/types.js';
export * from './security/types.js';
export * from './llm-orchestrator/types.js';
export * from './memory-engine/types.js';
export * from './myaidocs/types.js';
export * from './self-improving-skills/types.js';
export * from './proactive-intelligence/types.js';
export * from './vision-reasoning-engine/types.js';
export * from './desktop-browser-control/types.js';
export * from './integrations-connector-layer/types.js';
export * from './mission-runtime/types.js';
export * from './persistence/types.js';
export * from './cowork-v2/types.js';
export * from './agent-harness/types.js';
export * from './notes/types.js';
export * from './tasks/types.js';
export * from './contacts/types.js';

// Auto-initialize persistence — default to SQLite, fall back to JSON file if JARVIS_PERSISTENCE_PATH set
const persistencePath = process.env.JARVIS_PERSISTENCE_PATH;
const defaultSqlitePath = `${process.env.HOME || process.env.USERPROFILE || '.'}/.jarvis/state.db`;

if (persistencePath) {
  const { JsonFilePersistence } = await import('./persistence/persistenceAdapter.js');
  const { persistenceWrapper } = await import('./persistence/persistenceWrapper.js');
  const adapter = new JsonFilePersistence({
    filePath: persistencePath,
    autoSave: true,
    autoSaveIntervalMs: 5000,
  });
  await persistenceWrapper.init(adapter);
  console.log(`[jarvis-core] persistence initialized at ${persistencePath}`);
} else {
  const { SqlitePersistence } = await import('./persistence/persistenceAdapter.js');
  const { persistenceWrapper } = await import('./persistence/persistenceWrapper.js');
  const adapter = new SqlitePersistence({ filePath: defaultSqlitePath });
  await persistenceWrapper.init(adapter);
  console.log(`[jarvis-core] persistence initialized at ${defaultSqlitePath}`);
}

console.log('[jarvis-core] platform initialized');

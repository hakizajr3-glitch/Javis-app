import { describe, it, expect, beforeEach } from 'vitest';
import { AgentHarness } from './agentHarness.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { persistenceManager, InMemoryPersistence } from '../persistence/persistenceAdapter.js';

describe('AgentHarness', () => {
  let harness: AgentHarness;
  const events: any[] = [];
  let subscriptionId: string;

  beforeEach(async () => {
    harness = new AgentHarness();
    persistenceManager.setAdapter(new InMemoryPersistence());
    await persistenceManager.connect();

    events.length = 0;
    const sub = eventBus.subscribe(EventType.MISSION_CREATED, (event) => {
      events.push(event);
    });
    subscriptionId = sub.id;
  });

  it('starts a run and publishes MISSION_CREATED event', async () => {
    const run = await harness.startRun({ goal: 'deploy site', userId: 'user-1' });
    expect(run.goal).toBe('deploy site');
    expect(run.state).toBe('queued');
    expect(run.userId).toBe('user-1');

    const missionCreated = events.find(e => e.type === 'MISSION_CREATED');
    expect(missionCreated).toBeDefined();
    expect(missionCreated.payload.goal).toBe('deploy site');
    expect(missionCreated.correlationId).toBe('user-1');
  });

  it('spawns an agent instance from a subagent request', async () => {
    const run = await harness.startRun({ goal: 'plan deployment', userId: 'user-1' });
    const commander = await harness.spawnSubAgent({
      goal: 'understand goal',
      parentRunId: run.id,
      parentAgentId: '',
      userId: 'user-1',
      role: 'commander',
      name: 'Commander Alpha',
      tools: [],
    });
    const instance = await harness.spawnSubAgent({
      goal: 'build task graph',
      parentRunId: run.id,
      parentAgentId: commander.id,
      userId: 'user-1',
      role: 'planner',
      name: 'Planner Alpha',
      tools: [],
    });

    expect(instance.runId).toBe(run.id);
    expect(instance.state).toBe('idle');
    expect(instance.role).toBe('planner');
    expect(instance.name).toBe('Planner Alpha');
    expect(instance.parentAgentId).toBe(commander.id);
  });

  it('routes known tools to the correct connector and capability', async () => {
    const route = (harness as any).toolRoutes.get('send_slack_message');
    expect(route).toBeDefined();
    expect(route.connectorId).toBe('slack');
    expect(route.capability).toBe('send_message');
    expect(route.requiresApproval).toBe(true);
  });

  it('routes GitHub create_issue through approval gate', async () => {
    const route = (harness as any).toolRoutes.get('github_create_issue');
    expect(route.connectorId).toBe('github');
    expect(route.capability).toBe('create_issue');
    expect(route.requiresApproval).toBe(true);
  });

  it('persists a run after creation', async () => {
    const run = await harness.startRun({ goal: 'persisted run', userId: 'user-2' });
    const stored = await persistenceManager.getAdapter().get(`agent:run:${run.id}`);
    expect(stored).toBeDefined();
    expect(stored.goal).toBe('persisted run');
  });

  it('hydrates previously persisted runs', async () => {
    const run = await harness.startRun({ goal: 'hydrate test', userId: 'user-3' });

    const freshHarness = new AgentHarness();
    await freshHarness.hydrate();
    const hydrated = freshHarness.getRun(run.id);
    expect(hydrated).toBeDefined();
    expect(hydrated?.goal).toBe('hydrate test');
  });

  it('lists runs', async () => {
    await harness.startRun({ goal: 'run a', userId: 'alice' });
    await harness.startRun({ goal: 'run b', userId: 'alice' });
    await harness.startRun({ goal: 'run c', userId: 'bob' });

    const allRuns = harness.listRuns();
    expect(allRuns).toHaveLength(3);
  });
});

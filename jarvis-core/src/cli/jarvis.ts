#!/usr/bin/env node
import { agentHarness } from '../agent-harness/agentHarness.js';
import { connectorRegistry } from '../integrations-connector-layer/connectorRegistry.js';
import { persistenceManager, JsonFilePersistence } from '../persistence/persistenceAdapter.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { FileSystemConnector } from '../integrations-connector-layer/connectors/fileSystemConnector.js';
import { ShellSandboxConnector } from '../integrations-connector-layer/connectors/shellSandboxConnector.js';
import { GitHubConnector } from '../integrations-connector-layer/connectors/githubConnector.js';
import { SlackConnector } from '../integrations-connector-layer/connectors/slackConnector.js';
import { createApiServer } from '../api/server.js';
import { v4 as uuidv4 } from 'uuid';
import { HarnessFacade } from '../harness/index.js';
import { registerAllConnectors } from '../harness/adapters/connectorAdapter.js';
import { makeReasonFn } from '../harness/adapters/llmAdapter.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const nonFlagArgs: string[] = [];
  let userId = 'cli-user';
  let persistPath = `${process.env.HOME || process.env.USERPROFILE || '.'}/.jarvis/runtime-state.json`;
  let dryRun = false;
  let apiMode = false;
  let apiPort = 3001;
  let useHarness = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--user' || arg === '-u') {
      userId = args[++i];
    } else if (arg === '--persist') {
      persistPath = args[++i];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--api') {
      apiMode = true;
    } else if (arg === '--api-port') {
      apiPort = parseInt(args[++i]) || 3001;
    } else if (arg === '--harness') {
      useHarness = true;
    } else if (arg.startsWith('-')) {
      console.error(`Unknown flag: ${arg}`);
      process.exit(1);
    } else {
      nonFlagArgs.push(arg);
    }
  }

  const goal = nonFlagArgs.join(' ').trim();

  if (apiMode) {
    // Start API server mode
    console.log(`[JARVIS] Starting API server on port ${apiPort}...`);
    const { server } = createApiServer({ port: apiPort });
    console.log(`[JARVIS] API server running at http://localhost:${apiPort}`);
    console.log(`[JARVIS] Health check: http://localhost:${apiPort}/health`);

    // Keep process alive
    process.on('SIGINT', () => {
      console.log('\n[JARVIS] Shutting down API server...');
      server.close(() => process.exit(0));
    });
    return;
  }

  if (!goal) {
    console.log(`
J.A.R.V.I.S. CLI — harness runner

Usage:
  jarvis [options] <goal>

Options:
  --user, -u <id>   User ID for the run (default: cli-user)
  --persist <path>  Path to JSON persistence file
  --dry-run         Plan without executing tasks
  --api             Start REST API server mode
  --api-port <port> API server port (default: 3001)
  --harness         Run through the Elite Agentic Harness (12-pillar runtime)

Examples:
  jarvis "Deploy the marketing site to Vercel and notify Slack"
  jarvis --harness "Research and summarize the latest Claude release notes"
  jarvis --api --api-port 3001
`);
    process.exit(0);
  }

  // Setup persistence
  persistenceManager.setAdapter(new JsonFilePersistence({ filePath: persistPath }));
  await persistenceManager.connect();
  await agentHarness.hydrate();

  // Register core connectors
  await connectorRegistry.registerConnector(new FileSystemConnector(), {
    id: 'local-filesystem',
    name: 'Local Filesystem',
    type: 'filesystem',
    version: '1.0.0',
    enabled: true,
    configuration: { basePath: process.cwd() },
    permissions: ['read', 'write'],
  });
  await connectorRegistry.registerConnector(new ShellSandboxConnector(), {
    id: 'shell-sandbox',
    name: 'Shell Sandbox',
    type: 'shell-sandbox',
    version: '1.0.0',
    enabled: true,
    configuration: { defaultPolicy: 'read-only' },
    permissions: ['execute'],
  });
  await connectorRegistry.registerConnector(new GitHubConnector(), {
    id: 'github',
    name: 'GitHub',
    type: 'github',
    version: '1.0.0',
    enabled: !!process.env.GITHUB_TOKEN,
    configuration: { token: process.env.GITHUB_TOKEN },
    permissions: ['read', 'write'],
  });
  await connectorRegistry.registerConnector(new SlackConnector(), {
    id: 'slack',
    name: 'Slack',
    type: 'slack',
    version: '1.0.0',
    enabled: !!process.env.SLACK_BOT_TOKEN,
    configuration: { token: process.env.SLACK_BOT_TOKEN },
    permissions: ['send_message'],
  });

  // Stream events to console
  const formatEvent = (event: any): string => {
    const time = event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();
    return `[${time}] ${event.source || 'JARVIS'} ${event.type}: ${JSON.stringify(event.payload || {})}`;
  };

  const subs = [
    EventType.MISSION_CREATED,
    EventType.MISSION_STARTED,
    EventType.MISSION_COMPLETED,
    EventType.MISSION_FAILED,
    EventType.TASK_STARTED,
    EventType.TASK_COMPLETED,
    EventType.TASK_FAILED,
    EventType.APPROVAL_REQUIRED,
  ];

  for (const type of subs) {
    eventBus.subscribe(type, (event) => {
      console.log(formatEvent(event));
    });
  }

  // --- Elite Agentic Harness path -----------------------------------------
  if (useHarness) {
    try {
      const harness = new HarnessFacade({
        config: { userId, maxAttemptsPerTask: 3, verificationEnabled: true, learningEnabled: true },
        reasonFn: makeReasonFn(),
      });
      await harness.start();
      // Register all enabled connectors as harness capabilities.
      await registerAllConnectors(harness.getCapabilityRouter());

      const result = await harness.run({ objective: goal, userId, dryRun });
      console.log(`\n[harness] run ${result.runId} — ${result.status}`);
      console.log(`[harness] tasks: ${result.completedTasks} completed, ${result.failedTasks} failed`);
      console.log(`[harness] verifications: ${result.verificationsPassed} passed, ${result.verificationsFailed} failed`);
      if (result.recoveries > 0) console.log(`[harness] recoveries: ${result.recoveries}`);
      if (result.escalations.length > 0) console.log(`[harness] escalations: ${result.escalations.length}`);
      if (result.reflection) {
        console.log(`[harness] reflection:`);
        for (const lesson of result.reflection.lessons) console.log(`  - ${lesson}`);
      }
      harness.stop();
      await persistenceManager.disconnect();
      process.exit(result.status === 'completed' ? 0 : 1);
    } catch (error) {
      console.error('[harness] fatal error:', error);
      await persistenceManager.disconnect();
      process.exit(1);
    }
  }

  // --- Legacy agent-harness path ------------------------------------------
  try {
    const run = await agentHarness.startRun({
      goal,
      userId,
      context: { dryRun },
    });

    console.log(`\nRun started: ${run.id}`);
    console.log(`Goal: ${run.goal}\n`);

    const finalRun = dryRun
      ? run
      : await agentHarness.waitForRunCompletion(run.id, 120_000);

    console.log(`\nRun ${finalRun?.state || 'unknown'}: ${finalRun?.result || finalRun?.error || ''}`);

    await persistenceManager.disconnect();
    process.exit(finalRun?.state === 'completed' ? 0 : 1);
  } catch (error) {
    console.error('Fatal error:', error);
    await persistenceManager.disconnect();
    process.exit(1);
  }
}

main();

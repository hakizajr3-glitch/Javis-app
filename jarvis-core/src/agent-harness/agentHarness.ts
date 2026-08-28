import { v4 as uuidv4 } from 'uuid';
import {
  AgentBlueprint,
  AgentInstance,
  AgentRun,
  AgentTask,
  AgentRole,
  AgentMessage,
  ToolCall,
  SubAgentRequest,
  AgentRunOptions,
  ToolExecutionResult,
} from './types.js';
import { agentRegistry } from './agentRegistry.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { memoryEngine } from '../memory-engine/memoryEngine.js';
import { llmOrchestrator } from '../llm-orchestrator/llmOrchestrator.js';
import { connectorRegistry } from '../integrations-connector-layer/connectorRegistry.js';
import { securityLayer } from '../security/securityLayer.js';
import { persistenceManager } from '../persistence/persistenceAdapter.js';

interface ToolRoute {
  connectorId: string;
  capability: string;
  requiresApproval: boolean;
}

export class AgentHarness {
  private instances = new Map<string, AgentInstance>();
  private runs = new Map<string, AgentRun>();

  private toolRoutes: Map<string, ToolRoute> = new Map([
    ['read_file', { connectorId: 'local-filesystem', capability: 'read_file', requiresApproval: false }],
    ['write_file', { connectorId: 'local-filesystem', capability: 'write_file', requiresApproval: true }],
    ['run_shell', { connectorId: 'shell-sandbox', capability: 'execute', requiresApproval: true }],
    ['launch_app', { connectorId: 'desktop-automation', capability: 'launch_app', requiresApproval: false }],
    ['list_windows', { connectorId: 'desktop-automation', capability: 'list_windows', requiresApproval: false }],
    ['browser_navigate', { connectorId: 'browser-automation', capability: 'navigate', requiresApproval: false }],
    ['browser_click', { connectorId: 'browser-automation', capability: 'click', requiresApproval: false }],
    ['browser_type', { connectorId: 'browser-automation', capability: 'type', requiresApproval: false }],
    ['browser_screenshot', { connectorId: 'browser-automation', capability: 'screenshot', requiresApproval: false }],
    ['send_email', { connectorId: 'gmail', capability: 'send_message', requiresApproval: true }],
    ['send_slack_message', { connectorId: 'slack', capability: 'send_message', requiresApproval: true }],
    ['send_telegram_message', { connectorId: 'telegram', capability: 'send_message', requiresApproval: true }],
    ['send_discord_message', { connectorId: 'discord', capability: 'send_message', requiresApproval: true }],
    ['github_search_repositories', { connectorId: 'github', capability: 'search_repositories', requiresApproval: false }],
    ['github_get_repository', { connectorId: 'github', capability: 'get_repository', requiresApproval: false }],
    ['github_list_issues', { connectorId: 'github', capability: 'list_issues', requiresApproval: false }],
    ['github_create_issue', { connectorId: 'github', capability: 'create_issue', requiresApproval: true }],
    ['github_create_pull_request', { connectorId: 'github', capability: 'create_pull_request', requiresApproval: true }],
    ['github_search_code', { connectorId: 'github', capability: 'search_code', requiresApproval: false }],
    ['calendar_list_events', { connectorId: 'google-calendar', capability: 'list_events', requiresApproval: false }],
    ['calendar_create_event', { connectorId: 'google-calendar', capability: 'create_event', requiresApproval: true }],
    ['search_web', { connectorId: 'web-search', capability: 'search', requiresApproval: false }],
    ['get_screenshot', { connectorId: 'vision', capability: 'capture_screen', requiresApproval: false }],
    ['get_agent_status', { connectorId: 'internal', capability: 'agent_status', requiresApproval: false }],
  ]);

  // Persistence helpers

  private async persistRun(run: AgentRun): Promise<void> {
    try {
      await persistenceManager.getAdapter().set(`agent:run:${run.id}`, run);
    } catch (error) {
      console.error('[AgentHarness] persistRun failed:', error);
    }
  }

  private async persistInstance(instance: AgentInstance): Promise<void> {
    try {
      await persistenceManager.getAdapter().set(`agent:instance:${instance.id}`, instance);
    } catch (error) {
      console.error('[AgentHarness] persistInstance failed:', error);
    }
  }

  /**
   * Hydrate runs and instances from the configured persistence adapter.
   * Call this once after persistenceManager.connect().
   */
  async hydrate(): Promise<void> {
    const adapter = persistenceManager.getAdapter();
    const runEntries = await adapter.query({ prefix: 'agent:run:' });
    for (const entry of runEntries) {
      const run = entry.value as AgentRun;
      if (run && run.id) {
        this.runs.set(run.id, run);
      }
    }

    const instanceEntries = await adapter.query({ prefix: 'agent:instance:' });
    for (const entry of instanceEntries) {
      const instance = entry.value as AgentInstance;
      if (instance && instance.id) {
        this.instances.set(instance.id, instance);
      }
    }
  }

  // Public API

  async startRun(options: AgentRunOptions): Promise<AgentRun> {
    const run: AgentRun = {
      id: uuidv4(),
      goal: options.goal,
      userId: options.userId,
      parentRunId: options.parentRunId,
      state: 'queued',
      executorIds: [],
      tasks: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: options.context || {},
    };

    this.runs.set(run.id, run);
    await this.persistRun(run);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.MISSION_CREATED,
      payload: {
        runId: run.id,
        goal: run.goal,
        userId: run.userId,
        parentRunId: run.parentRunId,
      },
      timestamp: new Date(),
      source: 'AgentHarness',
      correlationId: run.userId,
    });

    // Kick off asynchronously so the caller gets the run ID immediately.
    this.runLoop(run.id, options).catch(error => {
      console.error(`[AgentHarness] runLoop failed for ${run.id}:`, error);
      this.failRun(run.id, error instanceof Error ? error.message : String(error));
    });

    return run;
  }

  async spawnSubAgent(request: SubAgentRequest): Promise<AgentInstance> {
    const blueprint = request.blueprintId
      ? agentRegistry.get(request.blueprintId)
      : this.pickBlueprintForRole(request.role || 'custom');

    if (!blueprint) {
      throw new Error(`No blueprint found for sub-agent request: ${JSON.stringify(request)}`);
    }

    const name = request.name || `${blueprint.name} ${uuidv4().slice(0, 4)}`;
    return this.spawnAgent(blueprint.id, request.parentRunId, request.parentAgentId, name, {
      ...request.context,
      subGoal: request.goal,
      tools: request.tools,
    }, request.userId);
  }

  async cancelRun(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    run.state = 'cancelled';
    run.updatedAt = new Date();
    await this.publishRunUpdate(run, 'run_cancelled');
  }

  getRun(runId: string): AgentRun | undefined {
    return this.runs.get(runId);
  }

  getInstance(instanceId: string): AgentInstance | undefined {
    return this.instances.get(instanceId);
  }

  listRuns(): AgentRun[] {
    return Array.from(this.runs.values());
  }

  async waitForRunCompletion(runId: string, timeoutMs = 120_000): Promise<AgentRun | undefined> {
    const terminalStates = new Set(['completed', 'failed', 'cancelled']);
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const run = this.runs.get(runId);
      if (run && terminalStates.has(run.state)) {
        return run;
      }
      await this.sleep(200);
    }

    return this.runs.get(runId);
  }

  listInstances(): AgentInstance[] {
    return Array.from(this.instances.values());
  }

  // Internal orchestration

  private async runLoop(runId: string, options: AgentRunOptions): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);

    // 1. Commander: understand the goal
    const commander = await this.spawnAgent(
      options.preferredBlueprints?.commander || 'commander',
      runId,
      undefined,
      'Commander',
      { goal: run.goal, context: run.metadata },
      run.userId
    );
    run.commanderId = commander.id;

    const commanderResult = await this.runAgentStep(commander);
    const missionBrief = this.safeJsonParse(commanderResult) || { intent: 'general', entities: {}, successCriteria: [], constraints: [] };
    run.metadata.missionBrief = missionBrief;
    run.state = 'planning';
    run.updatedAt = new Date();
    await this.publishRunUpdate(run, 'commander_complete');

    // 2. Planner: build task graph
    const planner = await this.spawnAgent(
      options.preferredBlueprints?.planner || 'planner',
      runId,
      commander.id,
      'Planner',
      { brief: missionBrief, goal: run.goal },
      run.userId
    );
    run.plannerId = planner.id;

    const plannerResult = await this.runAgentStep(planner);
    const plan = this.safeJsonParse(plannerResult) || { tasks: [] };
    run.tasks = (plan.tasks || []).map((t: any) => this.normalizeTask(t, runId));
    run.state = 'executing';
    run.updatedAt = new Date();
    await this.publishRunUpdate(run, 'plan_created');

    // 3. Observer: start monitoring
    const observer = await this.spawnAgent(
      options.preferredBlueprints?.observer || 'observer',
      runId,
      commander.id,
      'Observer',
      { runId, goal: run.goal },
      run.userId
    );
    run.observerId = observer.id;
    const terminalStates = new Set(['completed', 'failed', 'cancelled']);
    const observerInterval = setInterval(async () => {
      if (terminalStates.has(run.state)) {
        clearInterval(observerInterval);
        return;
      }
      await this.runObserverCheck(observer, run);
    }, 5000);

    // 4. Execute tasks respecting dependencies
    await this.executeRunTasks(run, options, run.userId);

    clearInterval(observerInterval);

    if ((run.state as string) === 'cancelled') return;
    if ((run.state as string) === 'failed') return;

    run.state = 'monitoring';
    run.updatedAt = new Date();
    await this.publishRunUpdate(run, 'execution_complete');

    // 5. Memory agent stores learnings
    const memoryAgent = await this.spawnAgent(
      options.preferredBlueprints?.memory || 'memory-agent',
      runId,
      commander.id,
      'Memory Agent',
      { runId, goal: run.goal, result: run.result, tasks: run.tasks },
      run.userId
    );
    run.memoryAgentId = memoryAgent.id;
    const memoryResult = await this.runAgentStep(memoryAgent);
    await this.storeMemoryResult(run.userId, run.id, memoryResult);

    // 6. Reflection agent reviews outcome
    const reflectionAgent = await this.spawnAgent(
      options.preferredBlueprints?.reflection || 'reflection-agent',
      runId,
      commander.id,
      'Reflection Agent',
      { runId, goal: run.goal, result: run.result, tasks: run.tasks },
      run.userId
    );
    run.reflectionAgentId = reflectionAgent.id;
    const reflectionResult = await this.runAgentStep(reflectionAgent);
    run.metadata.reflection = this.safeJsonParse(reflectionResult);

    run.state = 'completed';
    run.updatedAt = new Date();
    await this.publishRunUpdate(run, 'run_completed');
  }

  private async executeRunTasks(run: AgentRun, options: AgentRunOptions, userId: string): Promise<void> {
    const completed = new Set<string>();
    const failed = new Set<string>();
    const inProgress = new Set<string>();

    const executableTasks = () =>
      run.tasks.filter(
        t =>
          t.status === 'pending' &&
          !inProgress.has(t.id) &&
          t.dependencies.every(dep => completed.has(dep))
      );

    // Simple parallel execution with dependency awareness
    while (completed.size + failed.size < run.tasks.length) {
      const ready = executableTasks();
      if (ready.length === 0) {
        // Check for deadlock
        const blocked = run.tasks.filter(
          t => t.status === 'pending' && !inProgress.has(t.id) && t.dependencies.some(dep => failed.has(dep))
        );
        if (blocked.length > 0) {
          run.state = 'failed';
          run.error = `Task dependencies failed: ${blocked.map(t => t.id).join(', ')}`;
          run.updatedAt = new Date();
          await this.publishRunUpdate(run, 'run_failed');
          return;
        }
        // Otherwise wait a bit for in-progress tasks
        await this.sleep(500);
        continue;
      }

      const batch = ready.slice(0, 4); // max 4 parallel
      await Promise.all(
        batch.map(async task => {
          inProgress.add(task.id);
          task.status = 'in_progress';
          task.startedAt = new Date();
          await this.publishTaskUpdate(run, task);

          const blueprintId = this.pickExecutorBlueprintId(task.assignedTo, options);
          const executor = await this.spawnAgent(
            blueprintId,
            run.id,
            undefined,
            `Executor-${task.title}`,
            { task, goal: run.goal, context: run.metadata },
            userId
          );
          run.executorIds.push(executor.id);

          try {
            await this.executeTask(task, executor, userId);
            task.status = 'completed';
            task.completedAt = new Date();
            completed.add(task.id);
          } catch (error) {
            task.status = 'failed';
            task.error = error instanceof Error ? error.message : String(error);
            failed.add(task.id);
            await this.publishTaskUpdate(run, task);
            // Mark run as failed if any critical task fails; otherwise continue
            if (task.dependencies.length === 0) {
              run.state = 'failed';
              run.error = task.error;
              run.updatedAt = new Date();
              await this.publishRunUpdate(run, 'run_failed');
              return;
            }
          } finally {
            inProgress.delete(task.id);
          }
          await this.publishTaskUpdate(run, task);
        })
      );
    }

    // Summarize results into run.result
    const results = run.tasks
      .filter(t => t.status === 'completed')
      .map(t => `${t.title}: ${t.result || 'done'}`)
      .join('\n');
    run.result = results || 'All tasks completed.';
  }

  private async executeTask(task: AgentTask, executor: AgentInstance, userId: string): Promise<void> {
    const blueprint = agentRegistry.get(executor.blueprintId);
    const maxIterations = blueprint?.maxIterations || 10;

    for (let i = 0; i < maxIterations; i++) {
      const response = await this.runAgentStep(executor);
      let parsed: any;
      try {
        parsed = this.safeJsonParse(response);
      } catch {
        // If model didn't return JSON, treat as final result
        task.result = response;
        task.completedAt = new Date();
        return;
      }

      if (parsed.done) {
        task.result = parsed.result || 'Task completed.';
        task.completedAt = new Date();
        return;
      }

      if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
        for (const call of parsed.tool_calls) {
          const toolResult = await this.executeToolCall(call, userId);
          task.toolCalls.push({
            id: call.id || uuidv4(),
            name: call.name,
            arguments: call.arguments || {},
          });

          executor.messages.push({
            role: 'tool',
            content: JSON.stringify(toolResult),
            toolCallId: call.id,
            timestamp: new Date(),
          });

          if (!toolResult.success) {
            task.error = toolResult.error;
            throw new Error(toolResult.error);
          }
        }
      } else {
        // No tool calls and not done - treat as result
        task.result = response;
        task.completedAt = new Date();
        return;
      }
    }

    throw new Error(`Task exceeded max iterations (${maxIterations})`);
  }

  async executeToolCall(call: ToolCall, userId: string): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const route = this.toolRoutes.get(call.name);

    if (!route) {
      return {
        success: false,
        error: `Unknown tool: ${call.name}`,
        duration: Date.now() - startTime,
      };
    }

    // Approval gate for destructive/sensitive operations
    if (route.requiresApproval) {
      const decision = await securityLayer.enforceApprovalGate({
        userId,
        type: `agent_tool:${call.name}`,
        resource: call.name,
        description: `Agent requested tool ${call.name} with arguments ${JSON.stringify(call.arguments)}`,
      });
      if (!decision.approved) {
        return {
          success: false,
          error: `Tool ${call.name} was not approved: ${decision.reason || 'approval denied'}`,
          duration: Date.now() - startTime,
        };
      }
    }

    try {
      // Internal tools do not need connectors
      if (route.connectorId === 'internal') {
        if (call.name === 'get_agent_status') {
          const agentId = call.arguments.agentId as string;
          const instance = this.instances.get(agentId);
          return {
            success: true,
            data: instance ? { state: instance.state, role: instance.role, updatedAt: instance.updatedAt } : null,
            duration: Date.now() - startTime,
          };
        }
      }

      // Try connector if registered
      const connector = Array.from(connectorRegistry['connectors']?.keys?.() || []).length
        ? true
        : false;

      // Since connectorRegistry stores private maps, we call its public execute method.
      // If connector is not registered, we fall back to simulated results for development.
      try {
        const result = await connectorRegistry.executeConnector(
          route.connectorId,
          route.capability,
          call.arguments,
          userId
        );
        return {
          success: true,
          data: result,
          duration: Date.now() - startTime,
        };
      } catch (connectorError) {
        // Simulated fallback when connector is not registered (development mode)
        const errorMessage = connectorError instanceof Error ? connectorError.message : String(connectorError);
        if (errorMessage.includes('not found') || errorMessage.includes('Connector not found')) {
          return {
            success: true,
            data: this.simulateToolResult(call.name, call.arguments),
            duration: Date.now() - startTime,
          };
        }
        throw connectorError;
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  private simulateToolResult(name: string, args: Record<string, any>): any {
    switch (name) {
      case 'read_file':
        return { simulated: true, content: `// Simulated contents of ${args.path}` };
      case 'write_file':
        return { simulated: true, bytesWritten: args.content?.length || 0 };
      case 'run_shell':
        return { simulated: true, output: `$ ${args.command}\n(sandboxed simulated output)` };
      case 'launch_app':
        return { simulated: true, launched: args.name };
      case 'list_windows':
        return { simulated: true, windows: [] };
      case 'browser_navigate':
        return { simulated: true, url: args.url };
      case 'browser_click':
      case 'browser_type':
      case 'browser_screenshot':
        return { simulated: true, action: name };
      case 'send_email':
        return { simulated: true, sent: true, to: args.to };
      case 'send_slack_message':
        return { simulated: true, sent: true, channel: args.channel };
      case 'search_web':
        return { simulated: true, results: [{ title: `Result for ${args.query}`, url: 'https://example.com' }] };
      case 'get_screenshot':
        return { simulated: true, screenshot: 'base64_simulated_screenshot' };
      default:
        return { simulated: true };
    }
  }

  private async runAgentStep(instance: AgentInstance): Promise<string> {
    instance.state = 'running';
    instance.updatedAt = new Date();

    const blueprint = agentRegistry.get(instance.blueprintId);
    if (!blueprint) throw new Error(`Blueprint not found: ${instance.blueprintId}`);

    const prompt = this.buildAgentPrompt(instance, blueprint);

    try {
      const response = await llmOrchestrator.executeRequest({
        prompt,
        provider: blueprint.modelConfig.provider,
        model: blueprint.modelConfig.model,
        temperature: blueprint.modelConfig.temperature,
        maxTokens: blueprint.modelConfig.maxTokens,
        context: instance.context,
      });

      instance.messages.push({
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
      });

      instance.state = 'completed';
      instance.updatedAt = new Date();
      await this.persistInstance(instance);

      await eventBus.publish({
        id: uuidv4(),
        type: EventType.TASK_COMPLETED,
        payload: {
          action: 'agent_step_complete',
          instanceId: instance.id,
          blueprintId: blueprint.id,
          role: blueprint.role,
          runId: instance.runId,
        },
        timestamp: new Date(),
        source: 'AgentHarness',
        correlationId: instance.runId,
      });

      return response.content;
    } catch (error) {
      instance.state = 'failed';
      instance.updatedAt = new Date();
      await this.persistInstance(instance);
      throw error;
    }
  }

  private buildAgentPrompt(instance: AgentInstance, blueprint: AgentBlueprint): string {
    const messages = instance.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
    const tools = blueprint.tools.map(t => `- ${t.name}: ${t.description}`).join('\n');

    return `${blueprint.systemPrompt}

You are ${blueprint.name} (role: ${blueprint.role}).
${tools ? `Available tools:\n${tools}\n` : ''}
Context:\n${JSON.stringify(instance.context, null, 2)}

Conversation history:\n${messages}

Respond now.`;
  }

  private async runObserverCheck(observer: AgentInstance, run: AgentRun): Promise<void> {
    const statusResponse = await this.runAgentStep(observer);
    try {
      const status = this.safeJsonParse(statusResponse);
      if (status?.shouldPause) {
        run.state = 'failed';
        run.error = status.issues?.join('; ') || 'Observer requested pause';
        run.updatedAt = new Date();
        await this.publishRunUpdate(run, 'observer_pause');
      }
    } catch {
      // ignore non-JSON observer output
    }
  }

  private async storeMemoryResult(userId: string, runId: string, memoryResult: string): Promise<void> {
    try {
      const parsed = this.safeJsonParse(memoryResult) || {};
      const episodic = parsed.episodicMemories || [];
      const semantic = parsed.semanticMemories || [];
      const procedural = parsed.proceduralMemories || [];

      for (const m of episodic) {
        await memoryEngine.setPersonalMemory(userId, `episodic:${m.title || 'event'}`, m.content);
      }
      for (const m of semantic) {
        await memoryEngine.setPersonalMemory(userId, `semantic:${m.title || 'fact'}`, m.content);
      }
      for (const m of procedural) {
        await memoryEngine.setPersonalMemory(userId, `procedural:${m.title || 'workflow'}`, m.content);
      }
    } catch (error) {
      console.error('[AgentHarness] Failed to store memory result:', error);
    }
  }

  private async spawnAgent(
    blueprintId: string,
    runId: string,
    parentAgentId: string | undefined,
    name: string,
    context: Record<string, any>,
    userId: string
  ): Promise<AgentInstance> {
    const blueprint = agentRegistry.get(blueprintId);
    if (!blueprint) throw new Error(`Blueprint not found: ${blueprintId}`);

    const instance: AgentInstance = {
      id: uuidv4(),
      blueprintId,
      name,
      role: blueprint.role,
      state: 'idle',
      context,
      messages: [
        {
          role: 'system',
          content: blueprint.systemPrompt,
          timestamp: new Date(),
        },
      ],
      parentAgentId,
      runId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.instances.set(instance.id, instance);
    await this.persistInstance(instance);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_STARTED,
      payload: {
        action: 'agent_spawned',
        instanceId: instance.id,
        blueprintId,
        name,
        role: blueprint.role,
        runId,
        parentAgentId,
      },
      timestamp: new Date(),
      source: 'AgentHarness',
      correlationId: userId,
    });

    return instance;
  }

  private pickBlueprintForRole(role: AgentRole): AgentBlueprint | undefined {
    const blueprints = agentRegistry.getByRole(role);
    return blueprints[0];
  }

  private pickExecutorBlueprintId(assignedTo: string, options: AgentRunOptions): string {
    // assignedTo is currently an agent instance id placeholder; planner sets role strings.
    // Normalize: if it contains 'browser', use browser executor; 'file' or 'code' -> file executor;
    // 'system' or 'shell' -> system executor; 'communication' or 'email'/'slack' -> communication executor.
    const roleHint = String(assignedTo).toLowerCase();
    const preferred = options.preferredBlueprints?.executors;

    if (roleHint.includes('browser')) return preferred?.find(id => id.includes('browser')) || 'browser-executor';
    if (roleHint.includes('file') || roleHint.includes('code')) return preferred?.find(id => id.includes('file')) || 'file-executor';
    if (roleHint.includes('system') || roleHint.includes('shell')) return preferred?.find(id => id.includes('system')) || 'system-executor';
    if (roleHint.includes('communication') || roleHint.includes('email') || roleHint.includes('slack')) return preferred?.find(id => id.includes('communication')) || 'communication-executor';

    return preferred?.[0] || 'file-executor';
  }

  private normalizeTask(raw: any, runId: string): AgentTask {
    return {
      id: raw.id || uuidv4(),
      runId,
      parentTaskId: raw.parentTaskId,
      title: raw.title || 'Untitled task',
      description: raw.description || '',
      assignedTo: raw.role || raw.assignedTo || 'file-executor',
      dependencies: raw.dependencies || [],
      status: 'pending',
      toolCalls: [],
    };
  }

  private async publishRunUpdate(run: AgentRun, action: string): Promise<void> {
    await eventBus.publish({
      id: uuidv4(),
      type:
        run.state === 'failed'
          ? EventType.MISSION_FAILED
          : run.state === 'completed'
          ? EventType.MISSION_COMPLETED
          : EventType.MISSION_STARTED,
      payload: {
        action,
        runId: run.id,
        state: run.state,
        goal: run.goal,
        userId: run.userId,
        result: run.result,
        error: run.error,
        taskCount: run.tasks.length,
      },
      timestamp: new Date(),
      source: 'AgentHarness',
      correlationId: run.userId,
    });

    await this.persistRun(run);
  }

  private async publishTaskUpdate(run: AgentRun, task: AgentTask): Promise<void> {
    await eventBus.publish({
      id: uuidv4(),
      type:
        task.status === 'failed'
          ? EventType.TASK_FAILED
          : task.status === 'completed'
          ? EventType.TASK_COMPLETED
          : EventType.TASK_STARTED,
      payload: {
        runId: run.id,
        taskId: task.id,
        taskTitle: task.title,
        status: task.status,
        error: task.error,
        result: task.result,
        userId: run.userId,
      },
      timestamp: new Date(),
      source: 'AgentHarness',
      correlationId: run.userId,
    });

    await this.persistRun(run);
  }

  private async failRun(runId: string, error: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    run.state = 'failed';
    run.error = error;
    run.updatedAt = new Date();
    await this.publishRunUpdate(run, 'run_failed');
  }

  private safeJsonParse(text: string): any {
    try {
      const cleaned = text.replace(/^```json\n?/, '').replace(/```$/, '').trim();
      return JSON.parse(cleaned);
    } catch {
      try {
        return JSON.parse(text);
      } catch {
        return undefined;
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const agentHarness = new AgentHarness();

import { v4 as uuidv4 } from 'uuid';
import {
  MissionId,
  MissionTaskId,
  MissionExecution,
  ExecutionLog,
  ExecutionMetrics,
  Task,
} from './types.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { memoryEngine } from '../memory-engine/memoryEngine.js';
import { taskLogger } from '../self-improving-skills/taskLogger.js';
import { llmOrchestrator } from '../llm-orchestrator/llmOrchestrator.js';
import { environmentRuntime } from '../harness/environmentRuntime.js';
import { connectorRegistry } from '../integrations-connector-layer/connectorRegistry.js';
import { screenCapture } from '../vision-reasoning-engine/screenCapture.js';
import { imageUnderstanding } from '../vision-reasoning-engine/imageUnderstanding.js';

export class MissionSupervisor {
  private executions: Map<MissionId, MissionExecution> = new Map();
  private taskTimeout: number = 300000; // 5 minutes default

  async startMission(missionId: MissionId, plan: any, userId: string): Promise<void> {
    const execution: MissionExecution = {
      missionId,
      status: 'running',
      progress: 0,
      logs: [],
      metrics: {
        totalTasks: plan.tasks.length,
        completedTasks: 0,
        failedTasks: 0,
        averageTaskDuration: 0,
        totalDuration: 0,
        resourceUsage: {
          cpu: 0,
          memory: 0,
          disk: 0,
          network: 0,
        },
      },
    };

    this.executions.set(missionId, execution);

    await memoryEngine.setWorkingMemory(missionId, 'execution', execution);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.MISSION_STARTED,
      payload: { missionId },
      timestamp: new Date(),
      source: 'MissionSupervisor',
      correlationId: userId,
    });

    // Start executing tasks
    await this.executeTasks(missionId, plan.tasks, plan.dependencies, userId);
  }

  async pauseMission(missionId: MissionId): Promise<void> {
    const execution = this.executions.get(missionId);
    if (execution) {
      execution.status = 'paused';
      this.executions.set(missionId, execution);

      await memoryEngine.setWorkingMemory(missionId, 'execution', execution);

      await eventBus.publish({
        id: uuidv4(),
        type: EventType.TASK_COMPLETED,
        payload: { missionId, action: 'paused' },
        timestamp: new Date(),
        source: 'MissionSupervisor',
      });
    }
  }

  async resumeMission(missionId: MissionId, userId: string): Promise<void> {
    const execution = this.executions.get(missionId);
    if (execution && execution.status === 'paused') {
      execution.status = 'running';
      this.executions.set(missionId, execution);

      await memoryEngine.setWorkingMemory(missionId, 'execution', execution);

      await eventBus.publish({
        id: uuidv4(),
        type: EventType.TASK_COMPLETED,
        payload: { missionId, action: 'resumed' },
        timestamp: new Date(),
        source: 'MissionSupervisor',
        correlationId: userId,
      });
    }
  }

  async cancelMission(missionId: MissionId): Promise<void> {
    const execution = this.executions.get(missionId);
    if (execution) {
      execution.status = 'cancelled';
      this.executions.set(missionId, execution);

      await memoryEngine.setWorkingMemory(missionId, 'execution', execution);

      await eventBus.publish({
        id: uuidv4(),
        type: EventType.TASK_COMPLETED,
        payload: { missionId, action: 'cancelled' },
        timestamp: new Date(),
        source: 'MissionSupervisor',
      });
    }
  }

  async getExecution(missionId: MissionId): Promise<MissionExecution | null> {
    return this.executions.get(missionId) || null;
  }

  async getLogs(missionId: MissionId, level?: 'info' | 'warn' | 'error' | 'debug'): Promise<ExecutionLog[]> {
    const execution = this.executions.get(missionId);
    if (!execution) return [];

    let logs = execution.logs;

    if (level) {
      logs = logs.filter(l => l.level === level);
    }

    return logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async addLog(missionId: MissionId, level: 'info' | 'warn' | 'error' | 'debug', message: string, taskId?: MissionTaskId): Promise<void> {
    const execution = this.executions.get(missionId);
    if (!execution) return;

    const log: ExecutionLog = {
      timestamp: new Date(),
      level,
      message,
      taskId,
    };

    execution.logs.push(log);
    this.executions.set(missionId, execution);

    await memoryEngine.setWorkingMemory(missionId, 'execution', execution);
  }

  async updateProgress(missionId: MissionId, progress: number): Promise<void> {
    const execution = this.executions.get(missionId);
    if (!execution) return;

    execution.progress = Math.max(0, Math.min(100, progress));
    this.executions.set(missionId, execution);

    await memoryEngine.setWorkingMemory(missionId, 'execution', execution);
  }

  async updateMetrics(missionId: MissionId, metrics: Partial<ExecutionMetrics>): Promise<void> {
    const execution = this.executions.get(missionId);
    if (!execution) return;

    execution.metrics = { ...execution.metrics, ...metrics };
    this.executions.set(missionId, execution);

    await memoryEngine.setWorkingMemory(missionId, 'execution', execution);
  }

  async setTaskTimeout(timeout: number): Promise<void> {
    this.taskTimeout = timeout;
  }

  getTaskTimeout(): number {
    return this.taskTimeout;
  }

  private async executeTasks(
    missionId: MissionId,
    tasks: Task[],
    dependencies: Map<MissionTaskId, MissionTaskId[]>,
    userId: string
  ): Promise<void> {
    const execution = this.executions.get(missionId);
    if (!execution) return;

    const taskById = new Map<MissionTaskId, Task>(tasks.map(t => [t.id, t]));
    // pending tracks tasks not yet started. A task is runnable when every one
    // of its dependencies is no longer pending (completed or failed).
    const pending = new Set<MissionTaskId>(tasks.map(t => t.id));
    let madeProgress = true;

    // Loop in rounds instead of a single pass: a task whose dependencies
    // appear later in the array must still run once its deps complete.
    // (The previous single-pass `continue` silently skipped those tasks.)
    while (pending.size > 0 && madeProgress) {
      madeProgress = false;

      for (const task of tasks) {
        if (!pending.has(task.id)) continue;

        const deps = dependencies.get(task.id) || [];
        const depsSatisfied = deps.every(depId => !pending.has(depId));
        if (!depsSatisfied) continue;

        pending.delete(task.id);
        madeProgress = true;
        await this.addLog(missionId, 'info', `Starting task: ${task.name}`, task.id);

        const startTime = Date.now();

        try {
          const result = await this.executeTask(task, userId);
          const duration = Date.now() - startTime;

          task.status = 'completed';
          task.result = result;
          task.completedAt = new Date();
          task.duration = duration;

          execution.metrics.completedTasks++;
          execution.metrics.totalDuration += duration;
          execution.metrics.averageTaskDuration = execution.metrics.totalDuration / execution.metrics.completedTasks;

          await this.addLog(missionId, 'info', `Completed task: ${task.name} (${duration}ms)`, task.id);
          await this.updateProgress(missionId, ((tasks.length - pending.size) / tasks.length) * 100);

          await taskLogger.logTask({
            description: task.name,
            context: { missionId, taskId: task.id },
            parameters: task.parameters,
            result,
            success: true,
            duration,
            userId,
            tags: ['mission', task.type],
          });
        } catch (error) {
          const duration = Date.now() - startTime;

          task.status = 'failed';
          task.error = error as Error;
          task.completedAt = new Date();
          task.duration = duration;

          execution.metrics.failedTasks++;

          await this.addLog(missionId, 'error', `Failed task: ${task.name} - ${(error as Error).message}`, task.id);

          await taskLogger.logTask({
            description: task.name,
            context: { missionId, taskId: task.id },
            parameters: task.parameters,
            result: { error: (error as Error).message },
            success: false,
            duration,
            userId,
            tags: ['mission', task.type, 'failed'],
          });

          // Critical task failure aborts the mission immediately.
          if (task.critical) {
            execution.status = 'failed';
            await this.addLog(missionId, 'error', 'Mission failed due to critical task failure');
            await eventBus.publish({
              id: uuidv4(),
              type: EventType.TASK_FAILED,
              payload: { missionId, error: (error as Error).message },
              timestamp: new Date(),
              source: 'MissionSupervisor',
              correlationId: userId,
            });
            return;
          }
        }
      }
    }

    // Any tasks still pending could not be started — unresolved dependency
    // cycle or a dependency that failed. Mark them failed instead of letting
    // the mission silently 'complete' without them.
    for (const taskId of pending) {
      const task = taskById.get(taskId);
      if (!task) continue;
      task.status = 'failed';
      task.error = new Error('Unresolvable dependency (cycle or failed prerequisite)');
      execution.metrics.failedTasks++;
      await this.addLog(missionId, 'error', `Task blocked by dependency cycle: ${task.name}`, task.id);
    }

    if (pending.size > 0) {
      execution.status = 'failed';
      await eventBus.publish({
        id: uuidv4(),
        type: EventType.TASK_FAILED,
        payload: { missionId, error: 'Dependency cycle detected', blocked: Array.from(pending) },
        timestamp: new Date(),
        source: 'MissionSupervisor',
        correlationId: userId,
      });
      return;
    }

    // Mission completed
    execution.status = 'completed';
    execution.progress = 100;

    await memoryEngine.setWorkingMemory(missionId, 'execution', execution);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.MISSION_COMPLETED,
      payload: { missionId, metrics: execution.metrics },
      timestamp: new Date(),
      source: 'MissionSupervisor',
      correlationId: userId,
    });
  }

  private async executeTask(task: Task, userId: string): Promise<any> {
    console.log(`[Mission Supervisor] Executing task: ${task.name}`, task.parameters);

    switch (task.type) {
      case 'llm':
        return await this.executeLLMTask(task);
      case 'automation':
        return await this.executeAutomationTask(task, userId);
      case 'connector':
        return await this.executeConnectorTask(task, userId);
      case 'memory':
        return await this.executeMemoryTask(task);
      case 'vision':
        return await this.executeVisionTask(task, userId);
      default:
        return await this.executeCustomTask(task, userId);
    }
  }

  private async executeLLMTask(task: Task): Promise<any> {
    // Real LLM call through the orchestrator (routing + fallback + metrics).
    const prompt = String(
      task.parameters?.prompt ??
      task.parameters?.instructions ??
      task.description ??
      'Execute the task'
    );
    const response = await llmOrchestrator.executeRequest({
      prompt,
      model: task.parameters?.model,
      provider: task.parameters?.provider,
      maxTokens: task.parameters?.maxTokens,
      temperature: task.parameters?.temperature,
    });
    return {
      llmResponse: response.content,
      provider: response.provider,
      model: response.model,
      tokensUsed: response.tokensUsed,
      cost: response.cost,
    };
  }

  private async executeAutomationTask(task: Task, userId: string): Promise<any> {
    // Real automation through the environment runtime, which delegates to
    // desktopAutomation (Tauri Rust commands) or browserControl (Playwright
    // sidecar) depending on the action domain.
    const domain = task.parameters?.domain ?? 'desktop'; // 'desktop' | 'browser' | 'terminal' | 'file'
    const action = task.parameters?.action ?? task.parameters?.type ?? 'mouse_click';
    const params = task.parameters?.parameters ?? task.parameters ?? {};

    const result = await environmentRuntime.execute(domain, action, params, userId);

    if (!result.success) {
      throw new Error(result.error || `Automation task failed: ${action}`);
    }

    return {
      executed: true,
      domain,
      action,
      output: result.output,
      durationMs: result.durationMs,
    };
  }

  private async executeConnectorTask(task: Task, userId: string): Promise<any> {
    // Real connector execution through the connector registry.
    const connectorId = task.parameters?.connectorId;
    const capability = task.parameters?.capability ?? task.parameters?.action;
    const parameters = task.parameters?.parameters ?? {};

    if (!connectorId) {
      throw new Error('Connector task missing "connectorId" parameter');
    }
    if (!capability) {
      throw new Error('Connector task missing "capability" parameter');
    }

    const result = await connectorRegistry.executeConnector(
      connectorId,
      capability,
      parameters,
      userId
    );

    return {
      executed: true,
      connectorId,
      capability,
      result,
    };
  }

  private async executeMemoryTask(task: Task): Promise<any> {
    // Real memory engine operation (persisted working memory).
    const op = task.parameters?.operation ?? 'store';
    const key = task.parameters?.key ?? `task_${task.id}`;
    const value = task.parameters?.value;
    const context = task.parameters?.context ?? task.id;

    if (op === 'retrieve') {
      const retrieved = await memoryEngine.getWorkingMemory(context, key);
      return { memoryOperation: 'retrieve', key, value: retrieved ?? null };
    }
    if (op === 'delete') {
      await memoryEngine.deleteWorkingMemory(context, key);
      return { memoryOperation: 'delete', key };
    }
    await memoryEngine.setWorkingMemory(context, key, value ?? { storedAt: new Date() });
    return { memoryOperation: 'store', key };
  }

  private async executeVisionTask(task: Task, _userId: string): Promise<any> {
    // Real vision pipeline: capture the screen, then analyze with the vision
    // reasoning engine. Supports an optional pre-existing captureId.
    const operation = task.parameters?.operation ?? 'analyze';

    if (operation === 'capture') {
      const source = task.parameters?.source ?? 'desktop';
      const captureId = await screenCapture.captureScreen(source as any, task.parameters?.sourceId);
      return { executed: true, operation: 'capture', captureId };
    }

    if (operation === 'detectObjects') {
      const captureId = task.parameters?.captureId;
      if (!captureId) throw new Error('detectObjects requires a captureId parameter');
      const objects = await imageUnderstanding.detectObjects(captureId);
      return { executed: true, operation: 'detectObjects', objects };
    }

    if (operation === 'detectText') {
      const captureId = task.parameters?.captureId;
      if (!captureId) throw new Error('detectText requires a captureId parameter');
      const text = await imageUnderstanding.detectText(captureId);
      return { executed: true, operation: 'detectText', text };
    }

    // Default: full analyze pipeline (capture + analyze)
    const source = task.parameters?.source ?? 'desktop';
    const captureId = task.parameters?.captureId ?? await screenCapture.captureScreen(source as any);
    const analysis = await imageUnderstanding.analyzeCapture(captureId, task.parameters?.context);

    return {
      executed: true,
      operation: 'analyze',
      captureId,
      analysis,
    };
  }

  private async executeCustomTask(task: Task, userId: string): Promise<any> {
    // Custom tasks try the environment runtime first (which covers shell,
    // file, desktop, and browser actions). If the domain isn't specified or
    // the action isn't recognized, we fall back to an LLM reasoning pass.
    const domain = task.parameters?.domain;
    const action = task.parameters?.action ?? task.parameters?.type;

    if (domain && action) {
      const params = task.parameters?.parameters ?? task.parameters ?? {};
      try {
        const result = await environmentRuntime.execute(domain, action, params, userId);
        if (result.success) {
          return {
            executed: true,
            domain,
            action,
            output: result.output,
            durationMs: result.durationMs,
          };
        }
      } catch (_) {
        // Fall through to LLM reasoning
      }
    }

    // Fall back to LLM reasoning for custom tasks without a known domain
    const prompt = String(
      task.parameters?.prompt ??
      task.parameters?.instructions ??
      task.description ??
      `Execute custom task: ${task.name}`
    );
    const response = await llmOrchestrator.executeRequest({
      prompt,
      model: task.parameters?.model,
      provider: task.parameters?.provider,
      maxTokens: task.parameters?.maxTokens,
      temperature: task.parameters?.temperature,
    });
    return {
      executed: true,
      taskType: task.type,
      llmResponse: response.content,
      provider: response.provider,
      model: response.model,
      tokensUsed: response.tokensUsed,
      cost: response.cost,
    };
  }

  getStats() {
    return {
      totalExecutions: this.executions.size,
      running: Array.from(this.executions.values()).filter(e => e.status === 'running').length,
      completed: Array.from(this.executions.values()).filter(e => e.status === 'completed').length,
      failed: Array.from(this.executions.values()).filter(e => e.status === 'failed').length,
    };
  }

  exportState(): Record<string, any> {
    return {
      executions: Array.from(this.executions.entries()),
      taskTimeout: this.taskTimeout,
    };
  }

  importState(state: Record<string, any>): void {
    this.executions = new Map(state.executions || []);
    if (state.taskTimeout) this.taskTimeout = state.taskTimeout;
  }
}

// Singleton instance
export const missionSupervisor = new MissionSupervisor();

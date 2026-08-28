import { v4 as uuidv4 } from 'uuid';
import {
  TaskId,
  TaskLog,
} from './types.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { memoryEngine } from '../memory-engine/memoryEngine.js';

export class TaskLogger {
  private taskLogs: Map<TaskId, TaskLog> = new Map();
  private maxLogSize: number = 10000;

  async logTask(task: Omit<TaskLog, 'id' | 'timestamp'>): Promise<TaskId> {
    const taskId = uuidv4() as TaskId;
    const taskLog: TaskLog = {
      ...task,
      id: taskId,
      timestamp: new Date(),
    };

    this.taskLogs.set(taskId, taskLog);

    // Store in working memory if missionId is provided
    if (task.missionId) {
      await memoryEngine.setWorkingMemory(task.missionId, `task:${taskId}`, taskLog);
    }

    // Emit event
    await eventBus.publish({
      id: uuidv4(),
      type: task.success ? EventType.TASK_COMPLETED : EventType.TASK_FAILED,
      payload: { taskId, taskLog },
      timestamp: taskLog.timestamp,
      source: 'TaskLogger',
      correlationId: task.missionId,
    });

    // Clean old logs if needed
    if (this.taskLogs.size > this.maxLogSize) {
      this.cleanOldLogs();
    }

    return taskId;
  }

  async getTask(taskId: TaskId): Promise<TaskLog | null> {
    return this.taskLogs.get(taskId) || null;
  }

  async listTasks(filters?: {
    userId?: string;
    missionId?: string;
    success?: boolean;
    tags?: string[];
    dateRange?: { start: Date; end: Date };
  }): Promise<TaskLog[]> {
    let tasks = Array.from(this.taskLogs.values());

    if (filters) {
      if (filters.userId) {
        tasks = tasks.filter(t => t.userId === filters.userId);
      }
      if (filters.missionId) {
        tasks = tasks.filter(t => t.missionId === filters.missionId);
      }
      if (filters.success !== undefined) {
        tasks = tasks.filter(t => t.success === filters.success);
      }
      if (filters.tags && filters.tags.length > 0) {
        tasks = tasks.filter(t =>
          filters.tags!.every(tag => t.tags.includes(tag))
        );
      }
      if (filters.dateRange) {
        tasks = tasks.filter(t =>
          t.timestamp >= filters.dateRange!.start &&
          t.timestamp <= filters.dateRange!.end
        );
      }
    }

    return tasks.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getTaskHistory(userId: string, limit: number = 100): Promise<TaskLog[]> {
    const tasks = await this.listTasks({ userId });
    return tasks.slice(0, limit);
  }

  async getTasksByTag(tag: string): Promise<TaskLog[]> {
    return this.listTasks({ tags: [tag] });
  }

  async getTasksByMission(missionId: string): Promise<TaskLog[]> {
    return this.listTasks({ missionId });
  }

  async getFailedTasks(userId: string): Promise<TaskLog[]> {
    return this.listTasks({ userId, success: false });
  }

  async getSuccessfulTasks(userId: string): Promise<TaskLog[]> {
    return this.listTasks({ userId, success: true });
  }

  async getTaskStats(userId?: string): Promise<{
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    averageDuration: number;
    byTag: Record<string, number>;
  }> {
    let tasks = Array.from(this.taskLogs.values());

    if (userId) {
      tasks = tasks.filter(t => t.userId === userId);
    }

    const total = tasks.length;
    const successful = tasks.filter(t => t.success).length;
    const failed = tasks.filter(t => !t.success).length;
    const successRate = total > 0 ? successful / total : 0;

    const durations = tasks.map(t => t.duration);
    const averageDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0;

    const byTag: Record<string, number> = {};
    for (const task of tasks) {
      for (const tag of task.tags) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }
    }

    return {
      total,
      successful,
      failed,
      successRate,
      averageDuration,
      byTag,
    };
  }

  private cleanOldLogs(): void {
    const tasks = Array.from(this.taskLogs.entries())
      .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime());

    const toRemove = tasks.slice(0, tasks.length - this.maxLogSize);
    for (const [id] of toRemove) {
      this.taskLogs.delete(id);
    }
  }

  getStats() {
    return {
      totalLogs: this.taskLogs.size,
      maxLogSize: this.maxLogSize,
    };
  }

  exportState(): Record<string, any> {
    return {
      taskLogs: Array.from(this.taskLogs.entries()),
      maxLogSize: this.maxLogSize,
    };
  }

  importState(state: Record<string, any>): void {
    this.taskLogs = new Map(state.taskLogs || []);
    if (state.maxLogSize) this.maxLogSize = state.maxLogSize;
  }
}

// Singleton instance
export const taskLogger = new TaskLogger();

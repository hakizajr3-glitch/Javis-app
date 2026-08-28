import { v4 as uuidv4 } from 'uuid';
import {
  MissionId,
  Mission,
  MissionSchedule,
  MissionExecution,
} from './types.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { memoryEngine } from '../memory-engine/memoryEngine.js';
import { missionSupervisor } from './missionSupervisor.js';

export class MissionScheduler {
  private queue: Map<MissionId, MissionSchedule> = new Map();
  private running: Map<MissionId, MissionExecution> = new Map();
  /** Full missions keyed by id — the supervisor needs the compiled plan. */
  private missions: Map<MissionId, Mission> = new Map();
  private maxConcurrent: number = 3;
  private schedulerInterval: NodeJS.Timeout | null = null;

  async scheduleMission(
    mission: Mission,
    delay: number = 0
  ): Promise<void> {
    this.missions.set(mission.id, mission);

    const schedule: MissionSchedule = {
      missionId: mission.id,
      scheduledAt: new Date(Date.now() + delay),
      priority: this.getPriorityValue(mission.priority),
      estimatedDuration: mission.compiledPlan.estimatedDuration,
      dependencies: [],
    };

    this.queue.set(mission.id, schedule);

    await memoryEngine.setWorkingMemory(mission.id, 'schedule', schedule);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { missionId: mission.id, scheduledAt: schedule.scheduledAt },
      timestamp: new Date(),
      source: 'MissionScheduler',
    });
  }

  async unscheduleMission(missionId: MissionId): Promise<void> {
    this.queue.delete(missionId);
    this.missions.delete(missionId);
    await memoryEngine.deleteWorkingMemory(missionId, 'schedule');
  }

  async startScheduler(): Promise<void> {
    if (this.schedulerInterval) {
      return;
    }

    this.schedulerInterval = setInterval(async () => {
      await this.processQueue();
    }, 1000); // Check every second

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { action: 'scheduler_started' },
      timestamp: new Date(),
      source: 'MissionScheduler',
    });
  }

  async stopScheduler(): Promise<void> {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { action: 'scheduler_stopped' },
      timestamp: new Date(),
      source: 'MissionScheduler',
    });
  }

  async getQueue(): Promise<MissionSchedule[]> {
    const now = new Date();
    return Array.from(this.queue.values())
      .filter(s => s.scheduledAt <= now)
      .sort((a, b) => b.priority - a.priority);
  }

  async getRunning(): Promise<MissionExecution[]> {
    return Array.from(this.running.values());
  }

  async getMissionStatus(missionId: MissionId): Promise<'queued' | 'running' | 'not_found'> {
    if (this.running.has(missionId)) return 'running';
    if (this.queue.has(missionId)) return 'queued';
    return 'not_found';
  }

  async pauseMission(missionId: MissionId): Promise<void> {
    const execution = this.running.get(missionId);
    if (execution) {
      execution.status = 'paused';
      this.running.set(missionId, execution);
      await missionSupervisor.pauseMission(missionId);

      await eventBus.publish({
        id: uuidv4(),
        type: EventType.TASK_COMPLETED,
        payload: { missionId, action: 'paused' },
        timestamp: new Date(),
        source: 'MissionScheduler',
      });
    }
  }

  async resumeMission(missionId: MissionId): Promise<void> {
    const execution = this.running.get(missionId);
    const mission = this.missions.get(missionId);
    if (execution && execution.status === 'paused') {
      execution.status = 'running';
      this.running.set(missionId, execution);
      await missionSupervisor.resumeMission(missionId, mission?.createdBy ?? 'system');

      await eventBus.publish({
        id: uuidv4(),
        type: EventType.TASK_COMPLETED,
        payload: { missionId, action: 'resumed' },
        timestamp: new Date(),
        source: 'MissionScheduler',
      });
    }
  }

  async cancelMission(missionId: MissionId): Promise<void> {
    if (this.running.has(missionId)) {
      this.running.delete(missionId);
    }

    if (this.queue.has(missionId)) {
      this.queue.delete(missionId);
    }

    this.missions.delete(missionId);
    await missionSupervisor.cancelMission(missionId);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { missionId, action: 'cancelled' },
      timestamp: new Date(),
      source: 'MissionScheduler',
    });
  }

  async setMaxConcurrent(max: number): Promise<void> {
    this.maxConcurrent = Math.max(1, max);
  }

  getMaxConcurrent(): number {
    return this.maxConcurrent;
  }

  async getStats(): Promise<{
    queued: number;
    running: number;
    maxConcurrent: number;
    totalProcessed: number;
  }> {
    return {
      queued: this.queue.size,
      running: this.running.size,
      maxConcurrent: this.maxConcurrent,
      totalProcessed: 0, // Would track total processed missions
    };
  }

  private async processQueue(): Promise<void> {
    if (this.running.size >= this.maxConcurrent) {
      return;
    }

    const ready = await this.getQueue();
    const slotsAvailable = this.maxConcurrent - this.running.size;

    for (let i = 0; i < Math.min(ready.length, slotsAvailable); i++) {
      const schedule = ready[i];
      await this.startMission(schedule.missionId);
      this.queue.delete(schedule.missionId);
    }
  }

  private async startMission(missionId: MissionId): Promise<void> {
    const mission = this.missions.get(missionId);
    if (!mission) {
      return;
    }

    const execution: MissionExecution = {
      missionId,
      status: 'running',
      progress: 0,
      logs: [],
      metrics: {
        totalTasks: mission.compiledPlan.tasks.length,
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

    this.running.set(missionId, execution);

    await memoryEngine.setWorkingMemory(missionId, 'execution', execution);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.MISSION_STARTED,
      payload: { missionId },
      timestamp: new Date(),
      source: 'MissionScheduler',
    });

    // Dispatch to the supervisor, which owns task-level execution.
    await missionSupervisor.startMission(missionId, mission.compiledPlan, mission.createdBy);
  }

  private getPriorityValue(priority: string): number {
    const values: Record<string, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };
    return values[priority] || 2;
  }

  exportState(): Record<string, any> {
    return {
      queue: Array.from(this.queue.entries()),
      running: Array.from(this.running.entries()),
      missions: Array.from(this.missions.entries()),
      maxConcurrent: this.maxConcurrent,
    };
  }

  importState(state: Record<string, any>): void {
    this.queue = new Map(state.queue || []);
    this.running = new Map(state.running || []);
    this.missions = new Map(state.missions || []);
    if (state.maxConcurrent) this.maxConcurrent = state.maxConcurrent;
  }
}

// Singleton instance
export const missionScheduler = new MissionScheduler();

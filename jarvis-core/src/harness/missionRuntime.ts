/**
 * JARVIS Elite Agentic Harness — Pillar 2: Mission Runtime.
 *
 * Wraps the existing mission-runtime module (compiler + scheduler + supervisor)
 * behind the harness's typed interface. Missions are long-running objectives
 * with durable state, task graphs, checkpoints, and autonomy levels.
 *
 * Design principles (NOOA):
 *  - Explicit object state: mission state lives on the Mission object, not
 *    in chat history.
 *  - Programmable loops: missions drive the Elite Loop across multiple
 *    iterations.
 *  - Durable state: missions survive process restarts via persistence.
 */
import { v4 as uuidv4 } from 'uuid';
import { missionCompiler } from '../mission-runtime/missionCompiler.js';
import { missionScheduler } from '../mission-runtime/missionScheduler.js';
import { missionSupervisor } from '../mission-runtime/missionSupervisor.js';
import { workspaceManager } from '../mission-runtime/workspaceManager.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import type { Mission, MissionId, Task as MissionTask } from '../mission-runtime/types.js';
import { AutonomyLevel } from './types.js';

export interface CreateMissionInput {
  name: string;
  description: string;
  instructions: string;
  userId: string;
  priority?: Mission['priority'];
  tags?: string[];
  context?: Record<string, any>;
  autonomyLevel?: AutonomyLevel;
}

export interface MissionStatus {
  missionId: MissionId;
  status: Mission['status'] | 'not_found';
  progress: number;
  currentTaskId?: string;
  completedTasks: number;
  failedTasks: number;
  totalTasks: number;
}

export interface MissionCheckpoint {
  missionId: MissionId;
  checkpointId: string;
  state: Record<string, any>;
  createdAt: Date;
}

export class MissionRuntime {
  private missions = new Map<MissionId, Mission>();
  private checkpoints = new Map<MissionId, MissionCheckpoint[]>();
  private autonomyLevels = new Map<MissionId, AutonomyLevel>();

  /**
   * Create a mission: compile instructions into a plan, register the mission,
   * and queue it for execution.
   */
  async createMission(input: CreateMissionInput): Promise<MissionId> {
    const workspaceId = await workspaceManager.createWorkspace(
      input.name,
      'mission',
      input.context?.path ?? process.cwd(),
      input.userId
    );

    const compiled = await missionCompiler.compileMission(
      input.instructions,
      input.context ?? {},
      input.userId
    );

    const missionId = compiled.id;
    const mission: Mission = {
      id: missionId,
      name: input.name,
      description: input.description,
      instructions: input.instructions,
      compiledPlan: compiled.plan,
      status: 'queued',
      priority: input.priority ?? 'medium',
      createdAt: new Date(),
      createdBy: input.userId,
      workspaceId,
      tags: input.tags ?? [],
    };

    this.missions.set(missionId, mission);
    this.autonomyLevels.set(missionId, input.autonomyLevel ?? 2);

    // scheduleMission takes the Mission object + optional delay.
    await missionScheduler.scheduleMission(mission);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.MISSION_CREATED,
      payload: { missionId, name: input.name, priority: mission.priority },
      timestamp: new Date(),
      source: 'MissionRuntime',
      correlationId: input.userId,
    });

    return missionId;
  }

  /** Execute a mission — starts the supervisor for this mission. */
  async executeMission(missionId: MissionId): Promise<void> {
    const mission = this.missions.get(missionId);
    if (!mission) throw new Error(`MissionRuntime: mission ${missionId} not found`);
    mission.status = 'running';
    mission.startedAt = new Date();

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.MISSION_STARTED,
      payload: { missionId, name: mission.name },
      timestamp: new Date(),
      source: 'MissionRuntime',
    });

    // The supervisor handles task-by-task execution.
    await missionSupervisor.startMission(missionId, mission.compiledPlan, mission.createdBy);
  }

  /** Get the current status of a mission. */
  async getStatus(missionId: MissionId): Promise<MissionStatus> {
    const mission = this.missions.get(missionId);
    if (!mission) return { missionId, status: 'not_found', progress: 0, completedTasks: 0, failedTasks: 0, totalTasks: 0 };

    const schedulerStatus = await missionScheduler.getMissionStatus(missionId);
    const execution = (await missionScheduler.getRunning()).find(e => e.missionId === missionId);

    const totalTasks = mission.compiledPlan.tasks.length;
    const completedTasks = execution?.metrics.completedTasks ?? 0;
    const failedTasks = execution?.metrics.failedTasks ?? 0;
    const progress = totalTasks > 0 ? completedTasks / totalTasks : 0;

    return {
      missionId,
      status: mission.status,
      progress,
      currentTaskId: execution?.currentTaskId,
      completedTasks,
      failedTasks,
      totalTasks,
    };
  }

  /** Pause a running mission. */
  async pauseMission(missionId: MissionId): Promise<void> {
    const mission = this.missions.get(missionId);
    if (mission) mission.status = 'paused';
    await missionScheduler.pauseMission(missionId);
    await eventBus.publish({
      id: uuidv4(),
      type: EventType.MISSION_PAUSED,
      payload: { missionId },
      timestamp: new Date(),
      source: 'MissionRuntime',
    });
  }

  /** Resume a paused mission. */
  async resumeMission(missionId: MissionId): Promise<void> {
    const mission = this.missions.get(missionId);
    if (mission) mission.status = 'running';
    await missionScheduler.resumeMission(missionId);
    await eventBus.publish({
      id: uuidv4(),
      type: EventType.MISSION_RESUMED,
      payload: { missionId },
      timestamp: new Date(),
      source: 'MissionRuntime',
    });
  }

  /** Cancel a mission. */
  async cancelMission(missionId: MissionId): Promise<void> {
    const mission = this.missions.get(missionId);
    if (mission) mission.status = 'cancelled';
    await missionScheduler.cancelMission(missionId);
  }

  /** Create a checkpoint — a durable snapshot of mission state. */
  async checkpoint(missionId: MissionId, state: Record<string, any>): Promise<string> {
    const checkpointId = uuidv4();
    const cp: MissionCheckpoint = {
      missionId,
      checkpointId,
      state,
      createdAt: new Date(),
    };
    if (!this.checkpoints.has(missionId)) this.checkpoints.set(missionId, []);
    this.checkpoints.get(missionId)!.push(cp);
    return checkpointId;
  }

  /** Restore from a checkpoint. */
  async restoreCheckpoint(missionId: MissionId, checkpointId: string): Promise<Record<string, any> | null> {
    const cps = this.checkpoints.get(missionId);
    if (!cps) return null;
    const cp = cps.find(c => c.checkpointId === checkpointId);
    return cp?.state ?? null;
  }

  /** List all missions. */
  listMissions(filter?: { status?: Mission['status']; userId?: string }): Mission[] {
    const all = Array.from(this.missions.values());
    return all.filter(m => {
      if (filter?.status && m.status !== filter.status) return false;
      if (filter?.userId && m.createdBy !== filter.userId) return false;
      return true;
    });
  }

  /** Get a mission by id. */
  getMission(missionId: MissionId): Mission | undefined {
    return this.missions.get(missionId);
  }

  /** Get the autonomy level for a mission. */
  getAutonomyLevel(missionId: MissionId): AutonomyLevel {
    return this.autonomyLevels.get(missionId) ?? 2;
  }

  /** Set the autonomy level for a mission. */
  setAutonomyLevel(missionId: MissionId, level: AutonomyLevel): void {
    this.autonomyLevels.set(missionId, level);
  }

  /** Mark a mission as completed. */
  async completeMission(missionId: MissionId): Promise<void> {
    const mission = this.missions.get(missionId);
    if (mission) {
      mission.status = 'completed';
      mission.completedAt = new Date();
    }
    await eventBus.publish({
      id: uuidv4(),
      type: EventType.MISSION_COMPLETED,
      payload: { missionId },
      timestamp: new Date(),
      source: 'MissionRuntime',
    });
  }

  /** Mark a mission as failed. */
  async failMission(missionId: MissionId, error: string): Promise<void> {
    const mission = this.missions.get(missionId);
    if (mission) {
      mission.status = 'failed';
      mission.completedAt = new Date();
    }
    await eventBus.publish({
      id: uuidv4(),
      type: EventType.MISSION_FAILED,
      payload: { missionId, error },
      timestamp: new Date(),
      source: 'MissionRuntime',
    });
  }

  private priorityToNumber(priority: Mission['priority']): number {
    switch (priority) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 2;
    }
  }
}

/** Singleton instance. */
export const missionRuntime = new MissionRuntime();

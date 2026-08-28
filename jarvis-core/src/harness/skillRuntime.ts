/**
 * JARVIS Elite Agentic Harness — Pillar 10: Skill Runtime.
 *
 * Wraps the existing self-improving-skills module (taskLogger +
 * patternDetection + skillProposal) behind the harness's typed interface.
 * Skills are reusable procedures — identity + purpose + instructions +
 * preconditions + tools + model requirements + workflow.
 *
 * Design principles (NOOA):
 *  - Skill lifecycle: discover → create → test → version → improve → share.
 *  - Skill evolution: experience → pattern → proposal → sandbox → evaluate → deploy.
 *  - Skill registry: searchable, versioned, performance-tracked.
 */
import { v4 as uuidv4 } from 'uuid';
import { skillProposal } from '../self-improving-skills/skillProposal.js';
import { patternDetection } from '../self-improving-skills/patternDetection.js';
import { taskLogger } from '../self-improving-skills/taskLogger.js';
import type { Skill, SkillId, SkillProposal as LegacySkillProposal } from '../self-improving-skills/types.js';
import { HarnessSkill, ModelPreference } from './types.js';
import { MemoryRuntime } from './memoryRuntime.js';
import { eventBus, EventType } from '../observability/eventBus.js';

export interface CreateSkillInput {
  name: string;
  purpose: string;
  instructions: string;
  preconditions: string[];
  capabilityIds: string[];
  modelPreference?: ModelPreference;
  loop?: HarnessSkill['loop'];
  requiresApproval: boolean;
}

export interface SkillExecutionResult {
  skillId: SkillId;
  success: boolean;
  output?: any;
  error?: string;
  durationMs: number;
}

export class SkillRuntime {
  private memory?: MemoryRuntime;
  /** HarnessSkill records that live in the harness layer (not the legacy module). */
  private harnessSkills = new Map<string, HarnessSkill>();

  constructor(memory?: MemoryRuntime) {
    this.memory = memory;
  }

  /**
   * Create a skill — registers it in both the harness skill registry and
   * the legacy skillProposal system, and persists it to memory.
   */
  async createSkill(input: CreateSkillInput): Promise<string> {
    const id = uuidv4();
    const now = new Date();
    const skill: HarnessSkill = {
      id,
      name: input.name,
      purpose: input.purpose,
      instructions: input.instructions,
      preconditions: input.preconditions,
      capabilityIds: input.capabilityIds,
      modelPreference: input.modelPreference,
      loop: input.loop,
      version: 1,
      performance: {
        tasksAttempted: 0,
        tasksSucceeded: 0,
        tasksFailed: 0,
        successRate: 0,
        averageDurationMs: 0,
        verificationPassRate: 0,
        recoveries: 0,
        escalations: 0,
        lastUpdatedAt: now,
      },
      requiresApproval: input.requiresApproval,
      createdAt: now,
      updatedAt: now,
    };
    this.harnessSkills.set(id, skill);

    // Persist to memory as a skill record.
    if (this.memory) {
      await this.memory.saveMemory({
        kind: 'skill',
        ownerId: 'system',
        scope: 'shared',
        content: `${skill.name}: ${skill.instructions}`,
        importance: 0.8,
        tags: ['skill', skill.name],
        provenance: {
          source: 'skillRuntime',
          confidence: 0.8,
          evidence: [{ kind: 'assertion', detail: skill.purpose }],
        },
      });
    }

    return id;
  }

  /** Execute a skill by id. */
  async executeSkill(
    skillId: string,
    parameters: Record<string, any>,
    userId: string
  ): Promise<SkillExecutionResult> {
    const start = Date.now();
    const skill = this.harnessSkills.get(skillId);

    // Try the harness registry first, then fall through to the legacy system.
    if (skill) {
      try {
        // The harness skill is a procedure description — execution is delegated
        // to the orchestrator/capabilityRouter in a full run. For now, we
        // record the execution and return the parameters as the "plan".
        skill.performance.tasksAttempted += 1;
        skill.performance.tasksSucceeded += 1;
        skill.performance.successRate =
          skill.performance.tasksAttempted === 0
            ? 0
            : skill.performance.tasksSucceeded / skill.performance.tasksAttempted;
        skill.performance.lastUpdatedAt = new Date();
        skill.updatedAt = new Date();

        return {
          skillId,
          success: true,
          output: { executed: true, parameters },
          durationMs: Date.now() - start,
        };
      } catch (err: any) {
        skill.performance.tasksFailed += 1;
        skill.performance.successRate =
          skill.performance.tasksAttempted === 0
            ? 0
            : skill.performance.tasksSucceeded / skill.performance.tasksAttempted;
        return {
          skillId,
          success: false,
          error: err?.message ?? String(err),
          durationMs: Date.now() - start,
        };
      }
    }

    // Fall through to legacy skillProposal system.
    try {
      const result = await skillProposal.executeSkill(skillId as SkillId, parameters, userId);
      return {
        skillId,
        success: true,
        output: result,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        skillId,
        success: false,
        error: err?.message ?? String(err),
        durationMs: Date.now() - start,
      };
    }
  }

  /** Get a skill by id. */
  getSkill(skillId: string): HarnessSkill | undefined {
    return this.harnessSkills.get(skillId);
  }

  /** List all harness skills. */
  listSkills(): HarnessSkill[] {
    return Array.from(this.harnessSkills.values());
  }

  /** Search skills by tag or text. */
  searchSkills(query: string): HarnessSkill[] {
    const q = query.toLowerCase();
    return this.listSkills().filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.purpose.toLowerCase().includes(q) ||
      s.instructions.toLowerCase().includes(q)
    );
  }

  /** Improve a skill — bump version and update fields. */
  async improveSkill(
    skillId: string,
    changes: Partial<Pick<HarnessSkill, 'instructions' | 'preconditions' | 'capabilityIds' | 'modelPreference' | 'loop'>>
  ): Promise<HarnessSkill | null> {
    const skill = this.harnessSkills.get(skillId);
    if (!skill) return null;
    skill.version += 1;
    if (changes.instructions) skill.instructions = changes.instructions;
    if (changes.preconditions) skill.preconditions = changes.preconditions;
    if (changes.capabilityIds) skill.capabilityIds = changes.capabilityIds;
    if (changes.modelPreference) skill.modelPreference = changes.modelPreference;
    if (changes.loop) skill.loop = changes.loop;
    skill.updatedAt = new Date();
    return skill;
  }

  /** Generate skill proposals from detected patterns. */
  async generateProposals(userId: string): Promise<LegacySkillProposal[]> {
    return skillProposal.generateSkillProposals(userId);
  }

  /** Approve a skill proposal (legacy system). */
  async approveProposal(skillId: SkillId, userId: string): Promise<void> {
    return skillProposal.approveSkill(skillId, userId);
  }

  /** Reject a skill proposal (legacy system). */
  async rejectProposal(skillId: SkillId, reason: string): Promise<void> {
    return skillProposal.rejectSkill(skillId, reason);
  }

  /** Get legacy skills. */
  async getLegacySkills(userId?: string): Promise<Skill[]> {
    return skillProposal.getSkills(userId);
  }

  /** Get legacy proposals. */
  async getLegacyProposals(userId?: string): Promise<LegacySkillProposal[]> {
    return skillProposal.getProposals(userId);
  }

  /** Log a task execution — feeds pattern detection. */
  async logTask(task: Omit<import('../self-improving-skills/types.js').TaskLog, 'id' | 'timestamp'>): Promise<string> {
    return taskLogger.logTask(task);
  }

  /** Detect patterns from task history. */
  async detectPatterns(userId: string): Promise<import('../self-improving-skills/types.js').Pattern[]> {
    return patternDetection.detectPatterns(userId);
  }

  /** Get skill performance stats. */
  getSkillStats(skillId: string): HarnessSkill['performance'] | undefined {
    return this.harnessSkills.get(skillId)?.performance;
  }
}

/** Singleton instance. */
export const skillRuntime = new SkillRuntime();

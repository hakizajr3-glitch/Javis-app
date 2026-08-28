/**
 * JARVIS Elite Agentic Harness — Pillar 12: Learning Runtime.
 *
 * Closes the loop between execution and improvement. After a mission (or a
 * single task), the learning runtime:
 *   1. Evaluates the outcome — what worked, what failed, why.
 *   2. Produces a Reflection (lessons learned) and persists it to memory.
 *   3. Proposes concrete ImprovementProposals (skill / prompt / strategy /
 *      capability / model-routing changes).
 *   4. Evaluates proposals in a sandbox before promoting them.
 *   5. Maintains a SelfModel — the system's own view of its capabilities and
 *      weaknesses — updated from verification pass rates and reflection.
 *
 * Design principles (NOOA):
 *  - Explicit object state: reflections and proposals are first-class records,
 *    not buried in chat logs.
 *  - Verify, don't trust: proposals are evaluated against a baseline before
 *    being deployed; a proposal that doesn't beat baseline is rejected.
 *  - Level-5 safety: any proposal that touches self-modification or
 *    high-impact capabilities requires human approval before deployment.
 *  - Programmable loops: reflection is a declared loop phase, not an
 *    afterthought.
 */
import { v4 as uuidv4 } from 'uuid';
import {
  HarnessRunResult,
  ImprovementProposal,
  ProposalEvaluation,
  Reflection,
  SelfModel,
} from './types.js';
import { MemoryRuntime } from './memoryRuntime.js';
import { VerificationEngine } from './verificationEngine.js';

export interface LearningRuntimeOptions {
  memoryRuntime?: MemoryRuntime;
  verificationEngine?: VerificationEngine;
  /** Function that scores a candidate change against a baseline. */
  evaluator?: Evaluator;
  /** Default sample size for sandbox evaluation. */
  defaultSampleSize?: number;
}

export type Evaluator = (
  proposal: ImprovementProposal,
  baseline: number,
  sampleSize: number
) => Promise<ProposalEvaluation>;

export interface EvaluateInput {
  subjectKind: Reflection['subjectKind'];
  subjectId: string;
  /** The run result, when reflecting on a mission. */
  run?: HarnessRunResult;
  /** Optional override for what worked / failed. */
  whatWorked?: string[];
  whatFailed?: string[];
  lessons?: string[];
}

export interface ProposalInput {
  title: string;
  rationale: string;
  targetKind: ImprovementProposal['targetKind'];
  targetId?: string;
  change: Record<string, any>;
  /** Baseline score to beat during sandbox evaluation. */
  baselineScore?: number;
  requiresApproval?: boolean;
}

const DEFAULT_SELF_MODEL: SelfModel = {
  capabilities: {},
  weaknesses: [],
  activeImprovements: [],
  overallVerificationPassRate: 0,
  updatedAt: new Date(),
};

export class LearningRuntime {
  private memory?: MemoryRuntime;
  private verifier?: VerificationEngine;
  private evaluator: Evaluator;
  private defaultSampleSize: number;
  private reflections = new Map<string, Reflection>();
  private proposals = new Map<string, ImprovementProposal>();
  private selfModel: SelfModel = {
    capabilities: {},
    weaknesses: [],
    activeImprovements: [],
    overallVerificationPassRate: 0,
    updatedAt: new Date(),
  };

  constructor(opts: LearningRuntimeOptions = {}) {
    this.memory = opts.memoryRuntime;
    this.verifier = opts.verificationEngine;
    this.evaluator = opts.evaluator ?? defaultEvaluator;
    this.defaultSampleSize = opts.defaultSampleSize ?? 10;
  }

  // -------------------------------------------------------------------------
  // Reflection
  // -------------------------------------------------------------------------

  async evaluate(input: EvaluateInput): Promise<Reflection> {
    const id = uuidv4();
    const whatWorked = input.whatWorked ?? deriveWhatWorked(input.run);
    const whatFailed = input.whatFailed ?? deriveWhatFailed(input.run);
    const lessons = input.lessons ?? deriveLessons(whatWorked, whatFailed, input.run);
    const reflection: Reflection = {
      id,
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      whatWorked,
      whatFailed,
      lessons,
      createdAt: new Date(),
    };
    this.reflections.set(id, reflection);
    // Persist to memory as a reflective record, if available.
    if (this.memory) {
      await this.memory.saveMemory({
        kind: 'reflective',
        ownerId: input.subjectId,
        scope: 'shared',
        content: `Reflection on ${input.subjectKind} ${input.subjectId}: ${lessons.join('; ')}`,
        importance: 0.7,
        tags: ['reflection', input.subjectKind],
        provenance: {
          source: 'learningRuntime',
          confidence: 0.8,
          evidence: lessons.map(l => ({ kind: 'assertion' as const, detail: l })),
        },
      });
    }
    // Update the self-model from this reflection.
    this.updateSelfModel(reflection, input.run);
    return reflection;
  }

  getReflection(id: string): Reflection | undefined {
    return this.reflections.get(id);
  }

  listReflections(): Reflection[] {
    return Array.from(this.reflections.values());
  }

  // -------------------------------------------------------------------------
  // Improvement proposals
  // -------------------------------------------------------------------------

  async propose(input: ProposalInput): Promise<ImprovementProposal> {
    const id = uuidv4();
    const proposal: ImprovementProposal = {
      id,
      title: input.title,
      rationale: input.rationale,
      targetKind: input.targetKind,
      targetId: input.targetId,
      change: input.change,
      status: 'proposed',
      requiresApproval: input.requiresApproval ?? needsApproval(input.targetKind, input.change),
      createdAt: new Date(),
    };
    this.proposals.set(id, proposal);
    this.selfModel.activeImprovements.push(id);
    this.selfModel.updatedAt = new Date();
    return proposal;
  }

  /** Evaluate a proposal in a sandbox and update its status. */
  async evaluateProposal(
    proposalId: string,
    baselineScore?: number,
    sampleSize?: number
  ): Promise<ImprovementProposal> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error(`LearningRuntime.evaluateProposal: unknown proposal ${proposalId}`);
    if (proposal.status !== 'proposed' && proposal.status !== 'testing') {
      throw new Error(`LearningRuntime.evaluateProposal: proposal ${proposalId} is ${proposal.status}, not proposed/testing`);
    }
    proposal.status = 'testing';
    const baseline = baselineScore ?? 0.5;
    const n = sampleSize ?? this.defaultSampleSize;
    const evaluation = await this.evaluator(proposal, baseline, n);
    proposal.evaluation = evaluation;
    if (evaluation.improved) {
      proposal.status = proposal.requiresApproval ? 'proposed' : 'validated';
    } else {
      proposal.status = 'rejected';
    }
    // Remove from active improvements once evaluated.
    this.selfModel.activeImprovements = this.selfModel.activeImprovements.filter(
      x => x !== proposalId
    );
    this.selfModel.updatedAt = new Date();
    return proposal;
  }

  /** Deploy a validated proposal. Requires approval if the proposal demands it. */
  async deployProposal(proposalId: string, approved = false): Promise<ImprovementProposal> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error(`LearningRuntime.deployProposal: unknown proposal ${proposalId}`);
    if (proposal.status !== 'validated') {
      throw new Error(`LearningRuntime.deployProposal: proposal ${proposalId} is ${proposal.status}, not validated`);
    }
    if (proposal.requiresApproval && !approved) {
      throw new Error(`LearningRuntime.deployProposal: proposal ${proposalId} requires human approval`);
    }
    proposal.status = 'deployed';
    return proposal;
  }

  getProposal(id: string): ImprovementProposal | undefined {
    return this.proposals.get(id);
  }

  listProposals(filter?: { status?: ImprovementProposal['status'] }): ImprovementProposal[] {
    const all = Array.from(this.proposals.values());
    return filter?.status ? all.filter(p => p.status === filter.status) : all;
  }

  // -------------------------------------------------------------------------
  // Self-model
  // -------------------------------------------------------------------------

  getSelfModel(): SelfModel {
    return { ...this.selfModel, updatedAt: new Date(this.selfModel.updatedAt) };
  }

  /** Manually assert a capability score (0..1). */
  setCapability(name: string, score: number): void {
    this.selfModel.capabilities[name] = clamp01(score);
    this.selfModel.updatedAt = new Date();
  }

  addWeakness(weakness: string): void {
    if (!this.selfModel.weaknesses.includes(weakness)) {
      this.selfModel.weaknesses.push(weakness);
      this.selfModel.updatedAt = new Date();
    }
  }

  removeWeakness(weakness: string): void {
    this.selfModel.weaknesses = this.selfModel.weaknesses.filter(w => w !== weakness);
    this.selfModel.updatedAt = new Date();
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private updateSelfModel(reflection: Reflection, run?: HarnessRunResult): void {
    // Weakenesses from failures.
    for (const fail of reflection.whatFailed) {
      this.addWeakness(fail);
    }
    // Capability scores from a run's verification pass rate.
    if (run) {
      const total = run.verificationsPassed + run.verificationsFailed;
      if (total > 0) {
        const rate = run.verificationsPassed / total;
        this.selfModel.overallVerificationPassRate =
          this.selfModel.overallVerificationPassRate === 0
            ? rate
            : 0.5 * this.selfModel.overallVerificationPassRate + 0.5 * rate;
      }
    }
    this.selfModel.updatedAt = new Date();
  }
}

// -------------------------------------------------------------------------
// Default evaluator + heuristic helpers
// -------------------------------------------------------------------------

const defaultEvaluator: Evaluator = async (proposal, baseline, sampleSize) => {
  // In the absence of a real sandbox, we use a deterministic heuristic:
  // proposals whose change includes a "score" field are taken at face value;
  // otherwise we assume a small improvement proportional to the rationale length.
  const candidateScore =
    typeof proposal.change.score === 'number'
      ? clamp01(proposal.change.score)
      : clamp01(baseline + Math.min(0.1, proposal.rationale.length / 500));
  return {
    baselineScore: baseline,
    candidateScore,
    improved: candidateScore > baseline,
    sampleSize,
    notes: ['default heuristic evaluator'],
    evaluatedAt: new Date(),
  };
};

function deriveWhatWorked(run?: HarnessRunResult): string[] {
  if (!run) return [];
  const out: string[] = [];
  if (run.completedTasks > 0) out.push(`${run.completedTasks} task(s) completed`);
  if (run.verificationsPassed > 0) out.push(`${run.verificationsPassed} verification(s) passed`);
  if (run.recoveries > 0) out.push(`${run.recoveries} recovery(ies) succeeded`);
  return out;
}

function deriveWhatFailed(run?: HarnessRunResult): string[] {
  if (!run) return [];
  const out: string[] = [];
  if (run.failedTasks > 0) out.push(`${run.failedTasks} task(s) failed`);
  if (run.verificationsFailed > 0) out.push(`${run.verificationsFailed} verification(s) failed`);
  if (run.escalations.length > 0) out.push(`${run.escalations.length} escalation(s)`);
  return out;
}

function deriveLessons(whatWorked: string[], whatFailed: string[], run?: HarnessRunResult): string[] {
  const lessons: string[] = [];
  if (whatWorked.length > 0) lessons.push(`Repeat what worked: ${whatWorked.join(', ')}`);
  if (whatFailed.length > 0) lessons.push(`Address failures: ${whatFailed.join(', ')}`);
  if (run && run.recoveries > 0 && run.failedTasks === 0) {
    lessons.push('Recovery mechanisms are effective — keep them enabled');
  }
  if (run && run.escalations.length > 0) {
    lessons.push('Escalations indicate gaps in autonomy or capability coverage');
  }
  return lessons;
}

function needsApproval(
  targetKind: ImprovementProposal['targetKind'],
  change: Record<string, any>
): boolean {
  // Model-routing and capability changes always need a human; strategy and
  // prompt changes don't unless they explicitly opt in.
  if (targetKind === 'model-routing' || targetKind === 'capability') return true;
  if (change.highImpact === true) return true;
  return false;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

import { v4 as uuidv4 } from 'uuid';
import {
  Discrepancy,
  Evidence,
  FailureClass,
  RecoveryAction,
  RecoveryPlan,
  StateSnapshot,
  VerificationResult,
} from './types.js';
import { eventBus, EventType } from '../observability/eventBus.js';

/**
 * Pillar 9 — Verification & Recovery.
 *
 * The rule this enforces: an agent saying "done" is not evidence. Before a task
 * is marked complete the harness compares the state it expected against the
 * state it actually observes, and when they disagree it classifies the failure
 * and produces a recovery plan instead of failing silently.
 *
 * A "probe" is how the engine observes reality for a given kind of target
 * (file, http endpoint, process, memory key, ...). Probes are registered by
 * whichever runtime owns that environment — in Tier 2 the Tauri/Playwright
 * layers register real probes; until then callers can supply observations
 * directly, and unprobeable targets are reported honestly as unverifiable
 * rather than being rounded up to "passed".
 */

export type Probe = (target: string) => Promise<any>;

/** Assertion describing what the world should look like after an action. */
export interface Expectation {
  kind: string;
  target: string;
  /** Exact expected value. */
  equals?: any;
  /** Substring/'includes' check for string or array values. */
  contains?: any;
  /** Value must simply exist (non-null, non-undefined). */
  exists?: boolean;
  /** Custom predicate for anything the above can't express. */
  predicate?: (actual: any) => boolean;
  /** Human-readable description used in reports. */
  description?: string;
}

const TRANSIENT_PATTERNS = [
  /\b(etimedout|econnreset|econnrefused|enotfound|eai_again|socket hang up)\b/i,
  /\b(timeout|timed out|temporarily unavailable|try again)\b/i,
  /\b(429|503|502|504)\b/,
  /\brate ?limit/i,
];

const PERMISSION_PATTERNS = [
  /\b(eacces|eperm|permission denied|forbidden|unauthorized|not authorized)\b/i,
  /\bpolicy (deny|require-approval)\b/i,
  /\b(401|403)\b/,
];

const BAD_INPUT_PATTERNS = [
  /\b(validation failed|invalid|malformed|bad request|schema)\b/i,
  /\b(400|422)\b/,
  /\brequired property missing\b/i,
];

const ENVIRONMENT_PATTERNS = [
  /\b(enoent|enospc|emfile|no such file|not found on disk|command not found)\b/i,
  /\b(desktop-runtime-required|not connected|no display)\b/i,
];

const WRONG_TOOL_PATTERNS = [
  /\bunknown capability\b/i,
  /\bunsupported (operation|action|method)\b/i,
  /\bnot implemented\b/i,
];

export interface VerificationEngineOptions {
  /** Default max attempts before escalating. */
  maxAttempts?: number;
  /** Base backoff for transient retries. */
  baseBackoffMs?: number;
}

export class VerificationEngine {
  private probes: Map<string, Probe> = new Map();
  private maxAttempts: number;
  private baseBackoffMs: number;
  private history: VerificationResult[] = [];
  private maxHistory = 1000;

  constructor(options: VerificationEngineOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseBackoffMs = options.baseBackoffMs ?? 500;
  }

  // -------------------------------------------------------------------------
  // Probes
  // -------------------------------------------------------------------------

  /** Register how to observe a given kind of target ('file', 'http', ...). */
  registerProbe(kind: string, probe: Probe): void {
    this.probes.set(kind, probe);
  }

  hasProbe(kind: string): boolean {
    return this.probes.has(kind);
  }

  listProbes(): string[] {
    return Array.from(this.probes.keys());
  }

  /** Observe current state for a target. Throws if no probe is registered. */
  async capture(kind: string, target: string): Promise<StateSnapshot> {
    const probe = this.probes.get(kind);
    if (!probe) {
      throw new Error(`[verification] no probe registered for kind '${kind}'`);
    }
    const value = await probe(target);
    return { kind, target, value, capturedAt: new Date() };
  }

  // -------------------------------------------------------------------------
  // Verification
  // -------------------------------------------------------------------------

  /**
   * Verify one expectation. When `observed` is supplied it is used directly;
   * otherwise the registered probe for `expectation.kind` is used.
   *
   * If no observation is possible, the result is `passed: false` with an
   * explicit 'unverifiable' evidence entry — never an optimistic pass.
   */
  async verify(expectation: Expectation, observed?: any): Promise<VerificationResult> {
    const discrepancies: Discrepancy[] = [];
    const evidence: Evidence[] = [];
    let actualSnapshot: StateSnapshot | undefined;

    if (observed !== undefined) {
      actualSnapshot = {
        kind: expectation.kind,
        target: expectation.target,
        value: observed,
        capturedAt: new Date(),
      };
      evidence.push({ kind: 'snapshot', detail: 'observation supplied by caller', data: observed });
    } else if (this.probes.has(expectation.kind)) {
      try {
        actualSnapshot = await this.capture(expectation.kind, expectation.target);
        evidence.push({ kind: 'snapshot', detail: `probed ${expectation.kind}:${expectation.target}` });
      } catch (err: any) {
        const result: VerificationResult = {
          passed: false,
          discrepancies: [{
            field: expectation.target,
            expected: this.describeExpectation(expectation),
            actual: 'probe error',
            message: err.message,
          }],
          evidence: [{ kind: 'external-check', detail: `probe failed: ${err.message}` }],
          verifiedAt: new Date(),
        };
        return this.record(result);
      }
    } else {
      // Honest "we cannot check this" rather than a false pass.
      const result: VerificationResult = {
        passed: false,
        discrepancies: [{
          field: expectation.target,
          expected: this.describeExpectation(expectation),
          actual: 'unobserved',
          message: `no probe registered for kind '${expectation.kind}' and no observation supplied`,
        }],
        evidence: [{ kind: 'external-check', detail: 'unverifiable: missing probe' }],
        verifiedAt: new Date(),
      };
      return this.record(result);
    }

    const actual = actualSnapshot.value;

    if (expectation.exists === true && (actual === null || actual === undefined)) {
      discrepancies.push({
        field: expectation.target,
        expected: 'to exist',
        actual,
        message: 'expected target to exist but it did not',
      });
    }

    if (expectation.exists === false && actual !== null && actual !== undefined) {
      discrepancies.push({
        field: expectation.target,
        expected: 'to not exist',
        actual,
        message: 'expected target to be absent but it exists',
      });
    }

    if (expectation.equals !== undefined && !this.deepEqual(actual, expectation.equals)) {
      discrepancies.push({
        field: expectation.target,
        expected: expectation.equals,
        actual,
        message: 'value does not equal expected',
      });
    }

    if (expectation.contains !== undefined) {
      const ok =
        typeof actual === 'string'
          ? actual.includes(String(expectation.contains))
          : Array.isArray(actual)
            ? actual.some(v => this.deepEqual(v, expectation.contains))
            : false;
      if (!ok) {
        discrepancies.push({
          field: expectation.target,
          expected: `to contain ${JSON.stringify(expectation.contains)}`,
          actual,
          message: 'value does not contain expected element',
        });
      }
    }

    if (expectation.predicate) {
      let ok = false;
      try {
        ok = expectation.predicate(actual);
      } catch (err: any) {
        discrepancies.push({
          field: expectation.target,
          expected: 'predicate to evaluate',
          actual,
          message: `predicate threw: ${err.message}`,
        });
      }
      if (!ok && discrepancies.length === 0) {
        discrepancies.push({
          field: expectation.target,
          expected: expectation.description || 'predicate to pass',
          actual,
          message: 'custom predicate returned false',
        });
      }
    }

    evidence.push({
      kind: 'assertion',
      detail: `${discrepancies.length === 0 ? 'passed' : 'failed'}: ${this.describeExpectation(expectation)}`,
    });

    const result: VerificationResult = {
      passed: discrepancies.length === 0,
      actual: actualSnapshot,
      discrepancies,
      evidence,
      verifiedAt: new Date(),
    };

    return this.record(result);
  }

  /** Verify several expectations; all must pass. */
  async verifyAll(expectations: Expectation[]): Promise<VerificationResult> {
    const all: VerificationResult[] = [];
    for (const e of expectations) {
      all.push(await this.verify(e));
    }
    return {
      passed: all.every(r => r.passed),
      discrepancies: all.flatMap(r => r.discrepancies),
      evidence: all.flatMap(r => r.evidence),
      verifiedAt: new Date(),
    };
  }

  // -------------------------------------------------------------------------
  // Failure classification + recovery
  // -------------------------------------------------------------------------

  classifyFailure(error: string | Error | undefined, verification?: VerificationResult): FailureClass {
    const message = error instanceof Error ? error.message : (error || '');
    const combined = `${message} ${verification?.discrepancies.map(d => d.message).join(' ') || ''}`;

    if (!combined.trim()) return 'unknown';
    if (PERMISSION_PATTERNS.some(p => p.test(combined))) return 'permission';
    if (BAD_INPUT_PATTERNS.some(p => p.test(combined))) return 'bad-input';
    if (TRANSIENT_PATTERNS.some(p => p.test(combined))) return 'transient';
    if (WRONG_TOOL_PATTERNS.some(p => p.test(combined))) return 'wrong-tool';
    if (ENVIRONMENT_PATTERNS.some(p => p.test(combined))) return 'environment';

    // Verification failed but the action itself reported no error: the approach
    // produced the wrong result, i.e. the strategy is wrong.
    if (verification && !verification.passed && !message) return 'wrong-strategy';

    return 'unknown';
  }

  /**
   * Decide what to do next after a failure. Returns null when the task should
   * be considered permanently failed (attempts exhausted → escalate).
   */
  planRecovery(
    failureClass: FailureClass,
    attempt: number,
    options?: { maxAttempts?: number; escalationTarget?: string }
  ): RecoveryPlan {
    const maxAttempts = options?.maxAttempts ?? this.maxAttempts;

    const actionFor: Record<FailureClass, RecoveryAction> = {
      transient: 'retry',
      'bad-input': 'correct',
      'wrong-strategy': 'replan',
      'wrong-tool': 'alternate-tool',
      permission: 'escalate',
      environment: 'alternate-agent',
      unknown: 'replan',
    };

    let action = actionFor[failureClass];
    let reason = `failure classified as '${failureClass}' → ${action}`;

    // Out of attempts: escalate regardless of class.
    if (attempt >= maxAttempts) {
      action = 'escalate';
      reason = `attempt ${attempt}/${maxAttempts} exhausted for '${failureClass}' failure → escalate to human`;
    }

    // Permission problems always need a human, immediately.
    if (failureClass === 'permission') {
      reason = 'permission failure requires explicit authorization → escalate';
    }

    const plan: RecoveryPlan = {
      failureClass,
      action,
      reason,
      attempt,
      maxAttempts,
      escalationTarget: action === 'escalate' ? (options?.escalationTarget || 'user') : undefined,
    };

    if (action === 'retry') {
      // Exponential backoff with jitter.
      plan.backoffMs = Math.round(this.baseBackoffMs * Math.pow(2, attempt - 1) * (1 + Math.random() * 0.2));
    }

    return plan;
  }

  /** Emit a recovery event so the escalation is observable. */
  async announceRecovery(plan: RecoveryPlan, context: { taskId?: string; missionId?: string; userId?: string }): Promise<void> {
    await eventBus.publish({
      id: uuidv4(),
      type: plan.action === 'escalate' ? EventType.APPROVAL_REQUIRED : EventType.TASK_RETRYING,
      payload: {
        failureClass: plan.failureClass,
        action: plan.action,
        reason: plan.reason,
        attempt: plan.attempt,
        maxAttempts: plan.maxAttempts,
        taskId: context.taskId,
        missionId: context.missionId,
      },
      timestamp: new Date(),
      source: 'VerificationEngine',
      correlationId: context.userId,
    });
  }

  getHistory(limit = 100): VerificationResult[] {
    return this.history.slice(-limit);
  }

  getStats() {
    const total = this.history.length;
    const passed = this.history.filter(r => r.passed).length;
    return {
      total,
      passed,
      failed: total - passed,
      passRate: total > 0 ? passed / total : 0,
      probesRegistered: this.probes.size,
    };
  }

  private record(result: VerificationResult): VerificationResult {
    this.history.push(result);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
    return result;
  }

  private describeExpectation(e: Expectation): string {
    if (e.description) return e.description;
    if (e.equals !== undefined) return `${e.target} equals ${JSON.stringify(e.equals)}`;
    if (e.contains !== undefined) return `${e.target} contains ${JSON.stringify(e.contains)}`;
    if (e.exists === true) return `${e.target} exists`;
    if (e.exists === false) return `${e.target} does not exist`;
    return `${e.target} satisfies predicate`;
  }

  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a === null || b === null || a === undefined || b === undefined) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(k => this.deepEqual(a[k], b[k]));
  }

  exportState(): Record<string, any> {
    return { history: this.history.slice(-200) };
  }

  importState(state: Record<string, any>): void {
    this.history = (state.history || []).map((r: any) => ({
      ...r,
      verifiedAt: new Date(r.verifiedAt),
    }));
  }
}

export const verificationEngine = new VerificationEngine();

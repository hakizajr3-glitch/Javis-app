import { v4 as uuidv4 } from 'uuid';
import {
  AutonomyLevel,
  PolicyDecision,
  PolicyRequest,
  RiskLevel,
} from './types.js';
import { securityLayer } from '../security/securityLayer.js';
import { identityPermissions } from '../identity-permissions/identityPermissions.js';
import { eventBus, EventType } from '../observability/eventBus.js';

/**
 * Pillar 8 — Policy & Governance.
 *
 * Every capability invocation passes through here before it executes. The
 * existing securityLayer only distinguishes read from write; this engine adds
 * the risk model and autonomy model the harness needs:
 *
 *   risk × reversibility × autonomyLevel → allow | require-approval | deny
 *
 * It delegates the durable side-effects (audit log, approval requests) to
 * securityLayer / identityPermissions so there is a single audit trail.
 */

/** Highest autonomy level that may act without approval, per risk tier. */
const RISK_AUTONOMY_FLOOR: Record<RiskLevel, AutonomyLevel> = {
  safe: 0,     // observing is always fine
  low: 2,      // needs "execute safe actions"
  medium: 3,   // needs "autonomous mission"
  high: 4,     // needs "self-improving operation"
  critical: 5, // always needs explicit authorization (see below)
};

/** Action-name patterns that escalate risk regardless of declared level. */
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; risk: RiskLevel; reason: string }> = [
  { pattern: /\b(rm|rmdir|unlink|delete|drop|truncate|destroy|wipe)\b/i, risk: 'critical', reason: 'destructive operation' },
  { pattern: /\b(force[- ]?push|reset --hard|history rewrite)\b/i, risk: 'critical', reason: 'irreversible VCS operation' },
  { pattern: /\b(payment|charge|transfer|invoice|refund)\b/i, risk: 'critical', reason: 'financial side-effect' },
  { pattern: /\b(send[- ]?(email|sms)|publish|deploy|release)\b/i, risk: 'high', reason: 'external side-effect' },
  { pattern: /\b(secret|credential|token|password|private[- ]?key)\b/i, risk: 'high', reason: 'credential access' },
  { pattern: /\b(sudo|chmod|chown|kill|shutdown|reboot)\b/i, risk: 'high', reason: 'privileged system operation' },
];

const RISK_ORDER: RiskLevel[] = ['safe', 'low', 'medium', 'high', 'critical'];

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b;
}

export interface PolicyEngineOptions {
  /** Default autonomy when a request does not specify one. */
  defaultAutonomyLevel?: AutonomyLevel;
  /** When true, critical actions are hard-denied instead of asking. */
  denyCriticalOutright?: boolean;
}

export class PolicyEngine {
  private defaultAutonomyLevel: AutonomyLevel;
  private denyCriticalOutright: boolean;
  private decisions: Map<string, PolicyDecision> = new Map();

  constructor(options: PolicyEngineOptions = {}) {
    this.defaultAutonomyLevel = options.defaultAutonomyLevel ?? 2;
    this.denyCriticalOutright = options.denyCriticalOutright ?? false;
  }

  setDefaultAutonomyLevel(level: AutonomyLevel): void {
    this.defaultAutonomyLevel = level;
  }

  getDefaultAutonomyLevel(): AutonomyLevel {
    return this.defaultAutonomyLevel;
  }

  /**
   * Classify how risky an action is, combining the declared risk with
   * pattern-based escalation and irreversibility.
   */
  classifyRisk(request: PolicyRequest): { risk: RiskLevel; reasons: string[] } {
    const reasons: string[] = [];
    let risk: RiskLevel = request.risk ?? 'low';
    if (request.risk) {
      reasons.push(`declared risk: ${request.risk}`);
    }

    const haystack = `${request.action} ${request.resource} ${request.description || ''}`;
    for (const { pattern, risk: patternRisk, reason } of DANGEROUS_PATTERNS) {
      if (pattern.test(haystack)) {
        if (RISK_ORDER.indexOf(patternRisk) > RISK_ORDER.indexOf(risk)) {
          reasons.push(`escalated to ${patternRisk}: ${reason}`);
        }
        risk = maxRisk(risk, patternRisk);
      }
    }

    // Irreversible actions are never below medium.
    if (request.reversible === false) {
      const bumped = maxRisk(risk, 'medium');
      if (bumped !== risk) {
        reasons.push('escalated to medium: action is not reversible');
      }
      risk = bumped;
    }

    return { risk, reasons };
  }

  /**
   * The main gate. Returns allow / require-approval / deny and records an
   * audit event either way.
   */
  async evaluate(request: PolicyRequest): Promise<PolicyDecision> {
    const autonomy = request.autonomyLevel ?? this.defaultAutonomyLevel;
    const { risk, reasons } = this.classifyRisk(request);

    // 1. Permission check — missing permissions are a hard deny.
    const missingPermissions = await this.checkPermissions(request);
    if (missingPermissions.length > 0) {
      return this.finalize(request, {
        outcome: 'deny',
        reason: `missing permissions: ${missingPermissions.join(', ')}`,
        risk,
        missingPermissions,
        decidedAt: new Date(),
      });
    }

    // 2. Critical actions: optionally hard-deny, otherwise always ask.
    if (risk === 'critical') {
      if (this.denyCriticalOutright) {
        return this.finalize(request, {
          outcome: 'deny',
          reason: `critical action denied by policy (${reasons.join('; ')})`,
          risk,
          decidedAt: new Date(),
        });
      }
      const approvalId = await this.requestApproval(request, risk);
      return this.finalize(request, {
        outcome: 'require-approval',
        reason: `critical action always requires explicit authorization (${reasons.join('; ')})`,
        risk,
        approvalId,
        decidedAt: new Date(),
      });
    }

    // 3. Autonomy check — is this agent trusted enough for this risk tier?
    const floor = RISK_AUTONOMY_FLOOR[risk];
    if (autonomy < floor) {
      const approvalId = await this.requestApproval(request, risk);
      return this.finalize(request, {
        outcome: 'require-approval',
        reason: `autonomy level ${autonomy} is below the floor ${floor} for ${risk}-risk actions`,
        risk,
        approvalId,
        decidedAt: new Date(),
      });
    }

    // 4. Allowed.
    return this.finalize(request, {
      outcome: 'allow',
      reason: reasons.length > 0 ? reasons.join('; ') : `${risk}-risk action within autonomy level ${autonomy}`,
      risk,
      decidedAt: new Date(),
    });
  }

  /** Convenience wrapper: throws unless the action is allowed. */
  async enforce(request: PolicyRequest): Promise<PolicyDecision> {
    const decision = await this.evaluate(request);
    if (decision.outcome !== 'allow') {
      const err = new Error(`[policy] ${decision.outcome}: ${decision.reason}`);
      (err as any).decision = decision;
      throw err;
    }
    return decision;
  }

  getDecision(traceId: string): PolicyDecision | null {
    return this.decisions.get(traceId) || null;
  }

  private async checkPermissions(request: PolicyRequest): Promise<string[]> {
    const required = request.requiredPermissions || [];
    if (required.length === 0) return [];

    const missing: string[] = [];
    for (const perm of required) {
      // Permission strings are "resource:action" (e.g. "browser:write").
      const [resource, action] = perm.includes(':') ? perm.split(':', 2) : [request.resource, perm];
      const ok = await identityPermissions.checkPermission(request.userId, resource, action);
      if (!ok) missing.push(perm);
    }
    return missing;
  }

  private async requestApproval(request: PolicyRequest, risk: RiskLevel): Promise<string> {
    // Delegate to the existing approval gate so there is one audit trail.
    const decision = await securityLayer.enforceApprovalGate({
      userId: request.userId,
      type: request.action,
      resource: request.resource,
      description: request.description || `${request.action} on ${request.resource} (${risk} risk)`,
    });

    // securityLayer embeds the approval id in its reason string; fall back to
    // a generated id so callers always have something to correlate on.
    const match = decision.reason?.match(/Approval ID: ([\w-]+)/);
    return match ? match[1] : uuidv4();
  }

  private async finalize(request: PolicyRequest, decision: PolicyDecision): Promise<PolicyDecision> {
    this.decisions.set(request.metadata?.traceId || uuidv4(), decision);

    await securityLayer.logAuditEvent({
      id: uuidv4(),
      timestamp: decision.decidedAt,
      userId: request.userId,
      action: `policy:${request.action}`,
      resource: request.resource,
      outcome: decision.outcome === 'allow' ? 'success' : 'failure',
      details: {
        outcome: decision.outcome,
        reason: decision.reason,
        risk: decision.risk,
        approvalId: decision.approvalId,
        missingPermissions: decision.missingPermissions,
      },
    });

    if (decision.outcome === 'require-approval') {
      await eventBus.publish({
        id: uuidv4(),
        type: EventType.APPROVAL_REQUIRED,
        payload: {
          action: request.action,
          resource: request.resource,
          risk: decision.risk,
          approvalId: decision.approvalId,
          reason: decision.reason,
        },
        timestamp: decision.decidedAt,
        source: 'PolicyEngine',
        correlationId: request.userId,
      });
    }

    return decision;
  }

  exportState(): Record<string, any> {
    return {
      defaultAutonomyLevel: this.defaultAutonomyLevel,
      decisions: Array.from(this.decisions.entries()),
    };
  }

  importState(state: Record<string, any>): void {
    const level = state.defaultAutonomyLevel;
    if (typeof level === 'number' && level >= 0 && level <= 5) {
      this.defaultAutonomyLevel = level as AutonomyLevel;
    }
    this.decisions = new Map(state.decisions || []);
  }
}

export const policyEngine = new PolicyEngine();

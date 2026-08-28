import { v4 as uuidv4 } from 'uuid';
import {
  Capability,
  CapabilityContext,
  CapabilityDescriptor,
  CapabilityResult,
  CapabilitySource,
  CapabilityView,
  RiskLevel,
} from './types.js';
import { validate, formatErrors } from './schema.js';
import { policyEngine, PolicyEngine } from './policyEngine.js';
import { eventBus, EventType } from '../observability/eventBus.js';

/**
 * Pillar 5 — Tool Runtime / Universal Capability Fabric.
 *
 * One registry for every capability the harness can invoke, regardless of
 * origin (native / MCP / SDK / API / plugin). Agents never call a tool
 * directly: they ask the router, the router checks policy, validates typed
 * input, executes, validates typed output, and records the result.
 *
 * Progressive disclosure: `viewFor(intent)` returns only the capabilities
 * plausibly relevant to the current intent, so an agent's context isn't
 * flooded with hundreds of tool definitions.
 */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'for', 'of', 'in', 'on', 'with', 'my',
  'me', 'i', 'please', 'jarvis', 'it', 'this', 'that', 'is', 'are', 'be',
  'do', 'does', 'need', 'want', 'can', 'you', 'then', 'from', 'into', 'at',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

export interface CapabilityRouterOptions {
  policy?: PolicyEngine;
  /** How many capabilities a progressive-disclosure view returns by default. */
  defaultViewSize?: number;
}

export class CapabilityRouter {
  private capabilities: Map<string, Capability> = new Map();
  private policy: PolicyEngine;
  private defaultViewSize: number;
  /** capabilityId -> invocation stats, used for routing preference. */
  private stats: Map<string, { calls: number; failures: number; totalMs: number }> = new Map();

  constructor(options: CapabilityRouterOptions = {}) {
    this.policy = options.policy || policyEngine;
    this.defaultViewSize = options.defaultViewSize ?? 12;
  }

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  register(capability: Capability): void {
    if (this.capabilities.has(capability.id)) {
      throw new Error(`[capabilityRouter] duplicate capability id: ${capability.id}`);
    }
    this.capabilities.set(capability.id, capability);
  }

  /** Replace an existing capability (used when a better provider appears). */
  replace(capability: Capability): void {
    this.capabilities.set(capability.id, capability);
  }

  unregister(capabilityId: string): void {
    this.capabilities.delete(capabilityId);
  }

  has(capabilityId: string): boolean {
    return this.capabilities.has(capabilityId);
  }

  get(capabilityId: string): Capability | null {
    return this.capabilities.get(capabilityId) || null;
  }

  describe(capabilityId: string): CapabilityDescriptor | null {
    const cap = this.capabilities.get(capabilityId);
    if (!cap) return null;
    const { execute, ...descriptor } = cap as any;
    return descriptor as CapabilityDescriptor;
  }

  list(filter?: { source?: CapabilitySource; tags?: string[]; maxRisk?: RiskLevel }): CapabilityDescriptor[] {
    const riskOrder: RiskLevel[] = ['safe', 'low', 'medium', 'high', 'critical'];
    let items = Array.from(this.capabilities.values());

    if (filter?.source) {
      items = items.filter(c => c.source === filter.source);
    }
    if (filter?.tags && filter.tags.length > 0) {
      items = items.filter(c => filter.tags!.some(t => c.tags.includes(t)));
    }
    if (filter?.maxRisk) {
      const ceiling = riskOrder.indexOf(filter.maxRisk);
      items = items.filter(c => riskOrder.indexOf(c.risk) <= ceiling);
    }

    return items.map(c => {
      const { execute, ...descriptor } = c as any;
      return descriptor as CapabilityDescriptor;
    });
  }

  size(): number {
    return this.capabilities.size;
  }

  // -------------------------------------------------------------------------
  // Discovery (progressive disclosure)
  // -------------------------------------------------------------------------

  /**
   * Score capabilities against a natural-language intent and return only the
   * top matches. This is what an agent calls instead of receiving the whole
   * registry up front.
   */
  viewFor(intent: string, limit?: number): CapabilityView {
    const tokens = tokenize(intent);
    const scored: Array<{ descriptor: CapabilityDescriptor; score: number }> = [];

    for (const cap of this.capabilities.values()) {
      const haystack = tokenize(`${cap.name} ${cap.description} ${cap.tags.join(' ')} ${cap.id}`);
      const haystackSet = new Set(haystack);

      let relevance = 0;
      for (const token of tokens) {
        if (haystackSet.has(token)) {
          relevance += 2;
        } else if (haystack.some(h => h.startsWith(token) || token.startsWith(h))) {
          relevance += 1;
        }
      }

      // Tie-breakers only apply to capabilities that are actually relevant —
      // otherwise every capability would score above zero and progressive
      // disclosure would leak the whole registry.
      let score = relevance;
      if (relevance > 0) {
        // Prefer capabilities with a good track record.
        const stat = this.stats.get(cap.id);
        if (stat && stat.calls > 0) {
          const successRate = 1 - stat.failures / stat.calls;
          score += successRate * 0.5;
        }
        // Slightly prefer safer, reversible options when scores tie.
        if (cap.reversible) score += 0.25;
      }

      if (score > 0) {
        const { execute, ...descriptor } = cap as any;
        scored.push({ descriptor: descriptor as CapabilityDescriptor, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const take = limit ?? this.defaultViewSize;
    const selected = scored.slice(0, take).map(s => s.descriptor);

    return {
      capabilities: selected,
      totalAvailable: this.capabilities.size,
      reason: selected.length > 0
        ? `matched ${selected.length} of ${this.capabilities.size} capabilities for intent tokens [${tokens.join(', ')}]`
        : `no capability matched intent tokens [${tokens.join(', ')}]; ${this.capabilities.size} available`,
    };
  }

  /** Best single capability for an intent, or null. */
  resolve(intent: string): CapabilityDescriptor | null {
    const view = this.viewFor(intent, 1);
    return view.capabilities[0] || null;
  }

  // -------------------------------------------------------------------------
  // Invocation
  // -------------------------------------------------------------------------

  /**
   * The single path through which capabilities execute.
   * policy → validate input → execute → validate output → record.
   */
  async invoke<I = any, O = any>(
    capabilityId: string,
    input: I,
    ctx: Partial<CapabilityContext> & { userId: string }
  ): Promise<CapabilityResult<O>> {
    const started = Date.now();
    const capability = this.capabilities.get(capabilityId);

    if (!capability) {
      return {
        capabilityId,
        ok: false,
        error: `unknown capability: ${capabilityId}`,
        durationMs: Date.now() - started,
      };
    }

    const context: CapabilityContext = {
      userId: ctx.userId,
      missionId: ctx.missionId,
      agentId: ctx.agentId,
      traceId: ctx.traceId || uuidv4(),
    };

    // 1. Policy gate.
    const decision = await this.policy.evaluate({
      userId: context.userId,
      action: capability.id,
      resource: capability.tags[0] || 'capability',
      description: capability.description,
      risk: capability.risk,
      reversible: capability.reversible,
      requiredPermissions: capability.requiredPermissions,
      metadata: { traceId: context.traceId },
    });

    if (decision.outcome !== 'allow') {
      this.recordStat(capabilityId, false, Date.now() - started);
      return {
        capabilityId,
        ok: false,
        error: `policy ${decision.outcome}: ${decision.reason}`,
        durationMs: Date.now() - started,
        policy: decision,
      };
    }

    // 2. Typed input validation.
    const inputCheck = validate(input, capability.inputSchema);
    if (!inputCheck.valid) {
      this.recordStat(capabilityId, false, Date.now() - started);
      return {
        capabilityId,
        ok: false,
        error: `input validation failed — ${formatErrors(inputCheck.errors)}`,
        durationMs: Date.now() - started,
        policy: decision,
      };
    }

    // 3. Execute.
    let output: any;
    try {
      output = await capability.execute(input, context);
    } catch (err: any) {
      const durationMs = Date.now() - started;
      this.recordStat(capabilityId, false, durationMs);
      await this.publish(capability, context, false, durationMs, err.message);
      return {
        capabilityId,
        ok: false,
        error: err.message || String(err),
        durationMs,
        policy: decision,
      };
    }

    // 4. Typed output validation — a capability that lies about its contract
    //    is a bug we want surfaced, not silently propagated.
    const outputCheck = validate(output, capability.outputSchema);
    const durationMs = Date.now() - started;

    if (!outputCheck.valid) {
      this.recordStat(capabilityId, false, durationMs);
      await this.publish(capability, context, false, durationMs, 'output contract violation');
      return {
        capabilityId,
        ok: false,
        output,
        error: `output validation failed — ${formatErrors(outputCheck.errors)}`,
        durationMs,
        policy: decision,
      };
    }

    this.recordStat(capabilityId, true, durationMs);
    await this.publish(capability, context, true, durationMs);

    return {
      capabilityId,
      ok: true,
      output: output as O,
      durationMs,
      policy: decision,
    };
  }

  getStats(capabilityId?: string) {
    if (capabilityId) {
      const s = this.stats.get(capabilityId);
      if (!s) return null;
      return {
        capabilityId,
        calls: s.calls,
        failures: s.failures,
        successRate: s.calls > 0 ? 1 - s.failures / s.calls : 0,
        averageMs: s.calls > 0 ? s.totalMs / s.calls : 0,
      };
    }
    return Array.from(this.stats.entries()).map(([id, s]) => ({
      capabilityId: id,
      calls: s.calls,
      failures: s.failures,
      successRate: s.calls > 0 ? 1 - s.failures / s.calls : 0,
      averageMs: s.calls > 0 ? s.totalMs / s.calls : 0,
    }));
  }

  private recordStat(capabilityId: string, ok: boolean, durationMs: number): void {
    const s = this.stats.get(capabilityId) || { calls: 0, failures: 0, totalMs: 0 };
    s.calls += 1;
    if (!ok) s.failures += 1;
    s.totalMs += durationMs;
    this.stats.set(capabilityId, s);
  }

  private async publish(
    capability: Capability,
    ctx: CapabilityContext,
    ok: boolean,
    durationMs: number,
    error?: string
  ): Promise<void> {
    await eventBus.publish({
      id: uuidv4(),
      type: ok ? EventType.TASK_COMPLETED : EventType.TASK_FAILED,
      payload: {
        capabilityId: capability.id,
        source: capability.source,
        durationMs,
        error,
        missionId: ctx.missionId,
        agentId: ctx.agentId,
      },
      timestamp: new Date(),
      source: 'CapabilityRouter',
      correlationId: ctx.traceId,
    });
  }

  exportState(): Record<string, any> {
    return { stats: Array.from(this.stats.entries()) };
  }

  importState(state: Record<string, any>): void {
    this.stats = new Map(state.stats || []);
  }
}

export const capabilityRouter = new CapabilityRouter();

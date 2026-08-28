import { describe, it, expect, beforeEach } from 'vitest';
import { VerificationEngine } from './verificationEngine.js';

describe('VerificationEngine — verification', () => {
  let ve: VerificationEngine;

  beforeEach(() => {
    ve = new VerificationEngine({ maxAttempts: 3, baseBackoffMs: 10 });
  });

  it('passes when the observation equals the expectation', async () => {
    const result = await ve.verify({ kind: 'memory', target: 'k1', equals: 'hello' }, 'hello');
    expect(result.passed).toBe(true);
    expect(result.discrepancies).toHaveLength(0);
  });

  it('fails and reports a discrepancy when values differ', async () => {
    const result = await ve.verify({ kind: 'memory', target: 'k1', equals: 'hello' }, 'goodbye');
    expect(result.passed).toBe(false);
    expect(result.discrepancies[0].expected).toBe('hello');
    expect(result.discrepancies[0].actual).toBe('goodbye');
  });

  it('does NOT pass optimistically when it cannot observe anything', async () => {
    // No probe registered for 'file' and no observation supplied.
    const result = await ve.verify({ kind: 'file', target: '/tmp/nope' });
    expect(result.passed).toBe(false);
    expect(result.discrepancies[0].actual).toBe('unobserved');
    expect(result.evidence[0].detail).toMatch(/unverifiable/);
  });

  it('uses a registered probe to observe reality', async () => {
    ve.registerProbe('file', async (target) => (target === '/tmp/exists' ? 'content' : null));
    const found = await ve.verify({ kind: 'file', target: '/tmp/exists', exists: true });
    expect(found.passed).toBe(true);

    const missing = await ve.verify({ kind: 'file', target: '/tmp/missing', exists: true });
    expect(missing.passed).toBe(false);
  });

  it('reports probe errors instead of swallowing them', async () => {
    ve.registerProbe('http', async () => { throw new Error('ECONNREFUSED'); });
    const result = await ve.verify({ kind: 'http', target: 'http://localhost:1/x', exists: true });
    expect(result.passed).toBe(false);
    expect(result.discrepancies[0].message).toMatch(/ECONNREFUSED/);
  });

  it('supports contains checks on strings and arrays', async () => {
    expect((await ve.verify({ kind: 'x', target: 't', contains: 'ell' }, 'hello')).passed).toBe(true);
    expect((await ve.verify({ kind: 'x', target: 't', contains: 3 }, [1, 2, 3])).passed).toBe(true);
    expect((await ve.verify({ kind: 'x', target: 't', contains: 9 }, [1, 2, 3])).passed).toBe(false);
  });

  it('supports custom predicates', async () => {
    const result = await ve.verify(
      { kind: 'x', target: 'exitCode', predicate: (v) => v === 0, description: 'exit code is 0' },
      0
    );
    expect(result.passed).toBe(true);

    const failed = await ve.verify(
      { kind: 'x', target: 'exitCode', predicate: (v) => v === 0, description: 'exit code is 0' },
      1
    );
    expect(failed.passed).toBe(false);
  });

  it('verifyAll requires every expectation to pass', async () => {
    const all = await ve.verifyAll([
      { kind: 'x', target: 'a', equals: 1 },
      { kind: 'x', target: 'b', equals: 2 },
    ]);
    // No observations supplied and no probes → both unverifiable → fails.
    expect(all.passed).toBe(false);
    expect(all.discrepancies).toHaveLength(2);
  });

  it('tracks a pass-rate stat', async () => {
    await ve.verify({ kind: 'x', target: 't', equals: 1 }, 1);
    await ve.verify({ kind: 'x', target: 't', equals: 1 }, 2);
    const stats = ve.getStats();
    expect(stats.total).toBe(2);
    expect(stats.passed).toBe(1);
    expect(stats.passRate).toBe(0.5);
  });
});

describe('VerificationEngine — failure classification', () => {
  const ve = new VerificationEngine();

  it('classifies network errors as transient', () => {
    expect(ve.classifyFailure('connect ETIMEDOUT 10.0.0.1:443')).toBe('transient');
    expect(ve.classifyFailure('Error: socket hang up')).toBe('transient');
    expect(ve.classifyFailure('HTTP 503 Service Unavailable')).toBe('transient');
  });

  it('classifies rate limits as transient', () => {
    expect(ve.classifyFailure('429 rate limit exceeded')).toBe('transient');
  });

  it('classifies permission errors as permission', () => {
    expect(ve.classifyFailure('EACCES: permission denied')).toBe('permission');
    expect(ve.classifyFailure('403 Forbidden')).toBe('permission');
  });

  it('classifies schema problems as bad-input', () => {
    expect(ve.classifyFailure('input validation failed — message: expected string')).toBe('bad-input');
    expect(ve.classifyFailure('400 Bad Request')).toBe('bad-input');
  });

  it('classifies missing runtime as environment', () => {
    expect(ve.classifyFailure('ENOENT: no such file or directory')).toBe('environment');
    expect(ve.classifyFailure('desktop-runtime-required')).toBe('environment');
  });

  it('classifies unknown capability as wrong-tool', () => {
    expect(ve.classifyFailure('unknown capability: foo.bar')).toBe('wrong-tool');
    expect(ve.classifyFailure('not implemented')).toBe('wrong-tool');
  });

  it('classifies a clean verification failure as wrong-strategy', () => {
    const failed = {
      passed: false,
      discrepancies: [{ field: 'f', expected: 1, actual: 2, message: 'value does not equal expected' }],
      evidence: [],
      verifiedAt: new Date(),
    };
    expect(ve.classifyFailure(undefined, failed)).toBe('wrong-strategy');
  });

  it('returns unknown for an empty error', () => {
    expect(ve.classifyFailure('')).toBe('unknown');
  });
});

describe('VerificationEngine — recovery planning', () => {
  const ve = new VerificationEngine({ maxAttempts: 3, baseBackoffMs: 100 });

  it('retries transient failures with backoff', () => {
    const plan = ve.planRecovery('transient', 1);
    expect(plan.action).toBe('retry');
    expect(plan.backoffMs).toBeGreaterThanOrEqual(100);
  });

  it('grows backoff exponentially across attempts', () => {
    // Attempt 3 of 3 escalates rather than retrying, so compare 1 vs 2.
    const first = ve.planRecovery('transient', 1).backoffMs!;
    const second = ve.planRecovery('transient', 2).backoffMs!;
    expect(second).toBeGreaterThan(first);
  });

  it('corrects bad input', () => {
    expect(ve.planRecovery('bad-input', 1).action).toBe('correct');
  });

  it('replans on wrong strategy', () => {
    expect(ve.planRecovery('wrong-strategy', 1).action).toBe('replan');
  });

  it('switches tool on wrong-tool', () => {
    expect(ve.planRecovery('wrong-tool', 1).action).toBe('alternate-tool');
  });

  it('escalates permission failures immediately', () => {
    const plan = ve.planRecovery('permission', 1);
    expect(plan.action).toBe('escalate');
    expect(plan.escalationTarget).toBe('user');
  });

  it('escalates once attempts are exhausted regardless of class', () => {
    const plan = ve.planRecovery('transient', 3);
    expect(plan.action).toBe('escalate');
    expect(plan.reason).toMatch(/exhausted/);
  });

  it('respects a per-call maxAttempts override', () => {
    const plan = ve.planRecovery('transient', 2, { maxAttempts: 2 });
    expect(plan.action).toBe('escalate');
  });
});

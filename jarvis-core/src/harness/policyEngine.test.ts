import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyEngine } from './policyEngine.js';
import { identityPermissions } from '../identity-permissions/identityPermissions.js';

describe('PolicyEngine — risk classification', () => {
  let policy: PolicyEngine;

  beforeEach(() => {
    policy = new PolicyEngine({ defaultAutonomyLevel: 3 });
  });

  it('escalates destructive operations to critical', () => {
    const { risk } = policy.classifyRisk({
      userId: 'u1',
      action: 'shell.exec',
      resource: 'terminal',
      description: 'rm -rf build directory',
    });
    expect(risk).toBe('critical');
  });

  it('escalates financial operations to critical', () => {
    const { risk } = policy.classifyRisk({
      userId: 'u1',
      action: 'stripe.charge',
      resource: 'payments',
      description: 'charge the customer card',
    });
    expect(risk).toBe('critical');
  });

  it('escalates external side-effects to high', () => {
    const { risk } = policy.classifyRisk({
      userId: 'u1',
      action: 'mail.send',
      resource: 'email',
      description: 'send email to the mailing list',
    });
    expect(risk).toBe('high');
  });

  it('escalates credential access to high', () => {
    const { risk } = policy.classifyRisk({
      userId: 'u1',
      action: 'secrets.read',
      resource: 'vault',
      description: 'read the API token',
    });
    expect(risk).toBe('high');
  });

  it('bumps irreversible actions to at least medium', () => {
    const { risk } = policy.classifyRisk({
      userId: 'u1',
      action: 'archive.create',
      resource: 'storage',
      risk: 'low',
      reversible: false,
    });
    expect(risk).toBe('medium');
  });

  it('leaves benign read actions at their declared risk', () => {
    const { risk } = policy.classifyRisk({
      userId: 'u1',
      action: 'fs.read',
      resource: 'files',
      description: 'read a config file',
      risk: 'safe',
      reversible: true,
    });
    expect(risk).toBe('safe');
  });
});

describe('PolicyEngine — autonomy gating', () => {
  it('allows low-risk actions at autonomy 2', async () => {
    const policy = new PolicyEngine({ defaultAutonomyLevel: 2 });
    const decision = await policy.evaluate({
      userId: 'u1',
      action: 'fs.read',
      resource: 'files',
      risk: 'low',
      reversible: true,
    });
    expect(decision.outcome).toBe('allow');
  });

  it('requires approval for medium risk at autonomy 2', async () => {
    const policy = new PolicyEngine({ defaultAutonomyLevel: 2 });
    const decision = await policy.evaluate({
      userId: 'u1',
      action: 'fs.write',
      resource: 'files',
      risk: 'medium',
      reversible: true,
    });
    expect(decision.outcome).toBe('require-approval');
    expect(decision.approvalId).toBeDefined();
  });

  it('allows medium risk once autonomy is raised to 3', async () => {
    const policy = new PolicyEngine({ defaultAutonomyLevel: 3 });
    const decision = await policy.evaluate({
      userId: 'u1',
      action: 'fs.write',
      resource: 'files',
      risk: 'medium',
      reversible: true,
    });
    expect(decision.outcome).toBe('allow');
  });

  it('always requires approval for critical actions, even at autonomy 5', async () => {
    const policy = new PolicyEngine({ defaultAutonomyLevel: 5 });
    const decision = await policy.evaluate({
      userId: 'u1',
      action: 'db.drop',
      resource: 'database',
      description: 'drop the users table',
    });
    expect(decision.outcome).toBe('require-approval');
    expect(decision.risk).toBe('critical');
  });

  it('hard-denies critical actions when configured to', async () => {
    const policy = new PolicyEngine({ defaultAutonomyLevel: 5, denyCriticalOutright: true });
    const decision = await policy.evaluate({
      userId: 'u1',
      action: 'db.drop',
      resource: 'database',
      description: 'truncate everything',
    });
    expect(decision.outcome).toBe('deny');
  });

  it('respects a per-request autonomy override', async () => {
    const policy = new PolicyEngine({ defaultAutonomyLevel: 0 });
    const decision = await policy.evaluate({
      userId: 'u1',
      action: 'fs.write',
      resource: 'files',
      risk: 'medium',
      reversible: true,
      autonomyLevel: 3,
    });
    expect(decision.outcome).toBe('allow');
  });
});

describe('PolicyEngine — permissions', () => {
  it('denies when a required permission is missing', async () => {
    const policy = new PolicyEngine({ defaultAutonomyLevel: 5 });
    const decision = await policy.evaluate({
      userId: 'no-perms-user',
      action: 'browser.navigate',
      resource: 'browser',
      risk: 'low',
      reversible: true,
      requiredPermissions: ['browser:write'],
    });
    expect(decision.outcome).toBe('deny');
    expect(decision.missingPermissions).toContain('browser:write');
  });

  it('allows once the permission is granted', async () => {
    const userId = await identityPermissions.createUser({
      email: 'perm@jarvis.local',
      name: 'Perm User',
      preferences: {},
    });
    await identityPermissions.grantPermission(userId, {
      resource: 'browser',
      action: 'write',
      scope: 'system',
    });

    const policy = new PolicyEngine({ defaultAutonomyLevel: 3 });
    const decision = await policy.evaluate({
      userId,
      action: 'browser.navigate',
      resource: 'browser',
      risk: 'low',
      reversible: true,
      requiredPermissions: ['browser:write'],
    });
    expect(decision.outcome).toBe('allow');
  });
});

describe('PolicyEngine — enforce', () => {
  it('throws on a denied action', async () => {
    const policy = new PolicyEngine({ defaultAutonomyLevel: 1 });
    await expect(
      policy.enforce({
        userId: 'u1',
        action: 'fs.write',
        resource: 'files',
        risk: 'medium',
        reversible: true,
      })
    ).rejects.toThrow(/require-approval/);
  });

  it('returns the decision on an allowed action', async () => {
    const policy = new PolicyEngine({ defaultAutonomyLevel: 3 });
    const decision = await policy.enforce({
      userId: 'u1',
      action: 'fs.read',
      resource: 'files',
      risk: 'safe',
      reversible: true,
    });
    expect(decision.outcome).toBe('allow');
  });
});

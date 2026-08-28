import { describe, it, expect } from 'vitest';
import { IdentityPermissions } from './identityPermissions.js';

describe('IdentityPermissions — credential management', () => {
  it('hashes and verifies passwords with bcrypt', async () => {
    const ip = new IdentityPermissions();
    const userId = await ip.createUser({
      email: 'test@jarvis.local',
      name: 'Test User',
      preferences: {},
    });

    await ip.setUserPassword(userId, 'correct horse battery staple');

    const user = await ip.getUser(userId);
    expect(user?.passwordHash).toBeDefined();
    expect(user?.passwordHash).not.toBe('correct horse battery staple');
    expect(user?.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt hash prefix

    expect(await ip.verifyUserPassword(userId, 'correct horse battery staple')).toBe(true);
    expect(await ip.verifyUserPassword(userId, 'wrong password')).toBe(false);
  });

  it('returns false for users without a password set', async () => {
    const ip = new IdentityPermissions();
    const userId = await ip.createUser({
      email: 'nopass@jarvis.local',
      name: 'No Password',
      preferences: {},
    });

    expect(await ip.verifyUserPassword(userId, 'anything')).toBe(false);
  });

  it('passwordHash survives export/import state round-trip', async () => {
    const ip = new IdentityPermissions();
    const userId = await ip.createUser({
      email: 'persist@jarvis.local',
      name: 'Persist User',
      preferences: {},
    });
    await ip.setUserPassword(userId, 'secret123');

    const state = ip.exportState();

    const ip2 = new IdentityPermissions();
    ip2.importState(state);

    expect(await ip2.verifyUserPassword(userId, 'secret123')).toBe(true);
  });
});

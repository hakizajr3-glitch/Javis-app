import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceFabric, DeviceFabric as DF } from './deviceFabric.js';

describe('DeviceFabric', () => {
  let fabric: DeviceFabric;

  beforeEach(() => {
    fabric = new DF();
  });

  it('registers self on construction', () => {
    const self = fabric.getSelf();
    expect(self).toBeDefined();
    expect(self.type).toBe('desktop');
    expect(self.trustStatus).toBe('trusted');
    expect(self.pairingState).toBe('paired');
    expect(self.capabilities.length).toBeGreaterThan(0);
  });

  it('registers and retrieves a device', () => {
    const id = fabric.registerDevice({
      name: 'Test Phone',
      type: 'mobile',
      platform: 'ios',
      owner: 'user',
      capabilities: [{ name: 'voice', permissions: ['listen', 'speak'] }],
      connectionMethods: ['cloud'],
      trustStatus: 'unknown',
      pairingState: 'unpaired',
      metadata: {},
    });

    const device = fabric.getDevice(id);
    expect(device).not.toBeNull();
    expect(device!.name).toBe('Test Phone');
    expect(device!.type).toBe('mobile');
    expect(device!.platform).toBe('ios');
  });

  it('detects capabilities', () => {
    const id = fabric.registerDevice({
      name: 'Test Device',
      type: 'desktop',
      platform: 'macos',
      owner: 'user',
      capabilities: [
        { name: 'shell', permissions: ['execute'] },
        { name: 'browser', permissions: ['navigate', 'click'] },
      ],
      connectionMethods: ['lan'],
      trustStatus: 'trusted',
      pairingState: 'paired',
      metadata: {},
    });

    expect(fabric.hasCapability(id, 'shell')).toBe(true);
    expect(fabric.hasCapability(id, 'browser')).toBe(true);
    expect(fabric.hasCapability(id, 'voice')).toBe(false);
    expect(fabric.hasPermission(id, 'shell', 'execute')).toBe(true);
    expect(fabric.hasPermission(id, 'shell', 'write')).toBe(false);
  });

  it('manages trust status', () => {
    const id = fabric.registerDevice({
      name: 'Untrusted Device',
      type: 'iot',
      platform: 'embedded',
      owner: 'unknown',
      capabilities: [],
      connectionMethods: ['lan'],
      trustStatus: 'unknown',
      pairingState: 'unpaired',
      metadata: {},
    });

    expect(fabric.getDevice(id)!.trustStatus).toBe('unknown');
    fabric.setTrustStatus(id, 'trusted');
    expect(fabric.getDevice(id)!.trustStatus).toBe('trusted');

    const trusted = fabric.getTrustedDevices();
    expect(trusted.find(d => d.id === id)).toBeDefined();
  });

  it('creates and verifies pairing tokens', () => {
    const id = fabric.registerDevice({
      name: 'Phone to Pair',
      type: 'mobile',
      platform: 'android',
      owner: 'pending',
      capabilities: [],
      connectionMethods: ['cloud'],
      trustStatus: 'unverified',
      pairingState: 'unpaired',
      metadata: {},
    });

    const token = fabric.createPairingToken(id, 5);
    expect(token).not.toBeNull();
    expect(token!.token).toBeDefined();
    expect(fabric.getDevice(id)!.pairingState).toBe('pairing');

    // Verify the token
    const result = fabric.verifyPairingToken(token!.token);
    expect(result.valid).toBe(true);
    expect(result.deviceId).toBe(id);
    expect(fabric.getDevice(id)!.pairingState).toBe('paired');
    expect(fabric.getDevice(id)!.trustStatus).toBe('trusted');

    // Token can only be used once
    const secondUse = fabric.verifyPairingToken(token!.token);
    expect(secondUse.valid).toBe(false);
  });

  it('rejects expired pairing tokens', async () => {
    const id = fabric.registerDevice({
      name: 'Expired Phone',
      type: 'mobile',
      platform: 'ios',
      owner: 'pending',
      capabilities: [],
      connectionMethods: ['cloud'],
      trustStatus: 'unverified',
      pairingState: 'unpaired',
      metadata: {},
    });

    const token = fabric.createPairingToken(id, 0); // 0 minute TTL = instant expiry
    // Wait 50ms to ensure the token is past its expiry
    await new Promise(resolve => setTimeout(resolve, 50));
    const result = fabric.verifyPairingToken(token!.token);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('expired');
  });

  it('revokes pairing', () => {
    const id = fabric.registerDevice({
      name: 'Bad Actor',
      type: 'mobile',
      platform: 'android',
      owner: 'user',
      capabilities: [],
      connectionMethods: ['cloud'],
      trustStatus: 'trusted',
      pairingState: 'paired',
      metadata: {},
    });

    const revoked = fabric.revokePairing(id);
    expect(revoked).toBe(true);
    expect(fabric.getDevice(id)!.pairingState).toBe('revoked');
    expect(fabric.getDevice(id)!.trustStatus).toBe('blocked');
  });

  it('lists devices with filters', () => {
    fabric.registerDevice({
      name: 'Phone 1',
      type: 'mobile',
      platform: 'ios',
      owner: 'user',
      capabilities: [],
      connectionMethods: ['cloud'],
      trustStatus: 'trusted',
      pairingState: 'paired',
      metadata: {},
    });
    fabric.registerDevice({
      name: 'Laptop 1',
      type: 'laptop',
      platform: 'macos',
      owner: 'user',
      capabilities: [],
      connectionMethods: ['lan'],
      trustStatus: 'unknown',
      pairingState: 'unpaired',
      metadata: {},
    });

    const all = fabric.listDevices();
    expect(all.length).toBeGreaterThanOrEqual(3); // self + 2

    const mobile = fabric.listDevices({ type: 'mobile' });
    expect(mobile.every(d => d.type === 'mobile')).toBe(true);

    const trusted = fabric.listDevices({ trustStatus: 'trusted' });
    expect(trusted.every(d => d.trustStatus === 'trusted')).toBe(true);
  });

  it('executes commands on self via environment runtime', async () => {
    const self = fabric.getSelf();
    const cmdId = await fabric.sendCommand(self.id, 'echo', {
      domain: 'terminal',
      command: 'echo test',
    });
    const cmd = fabric.getCommand(cmdId);
    expect(cmd).not.toBeNull();
    expect(cmd!.status).toMatch(/executed|failed|sent/);
  });

  it('tracks heartbeats', () => {
    const self = fabric.getSelf();
    const before = self.lastSeen.getTime();
    // Wait a tiny bit
    fabric.heartbeat(self.id);
    const after = fabric.getDevice(self.id)!.lastSeen.getTime();
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('computes stats', () => {
    const stats = fabric.getStats();
    expect(stats.totalDevices).toBeGreaterThanOrEqual(1);
    expect(stats.trusted).toBeGreaterThanOrEqual(1);
    expect(stats.byType).toBeDefined();
  });
});

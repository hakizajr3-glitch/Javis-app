/**
 * Device Fabric — device registry, identity (DNA), capability detection,
 * and trusted device classification.
 *
 * Tier 2C.1, 2C.4, 2C.5
 */

// Browser global — declared so the Node-only tsconfig doesn't error.
declare const navigator: any;

import { v4 as uuidv4 } from 'uuid';
import { eventBus, EventType } from '../observability/eventBus.js';

// ─── Types ────────────────────────────────────────────────────────────────

export type DeviceType =
  | 'desktop'    // Mac/Windows/Linux workstation
  | 'laptop'
  | 'mobile'     // iOS/Android phone
  | 'tablet'
  | 'server'
  | 'iot'        // Smart home / embedded
  | 'wearable'   // Watch, glasses
  | 'browser'    // Remote browser session
  | 'unknown';

export type DevicePlatform =
  | 'macos' | 'windows' | 'linux'
  | 'ios' | 'android'
  | 'web' | 'embedded' | 'unknown';

export type TrustStatus = 'trusted' | 'known' | 'unverified' | 'unknown' | 'blocked';

export type PairingState = 'unpaired' | 'pairing' | 'paired' | 'revoked';

export type ConnectionMethod = 'lan' | 'bluetooth' | 'usb' | 'cloud' | 'direct' | 'remote';

export interface DeviceDNA {
  id: string;
  name: string;
  type: DeviceType;
  platform: DevicePlatform;
  owner: string;
  capabilities: DeviceCapability[];
  connectionMethods: ConnectionMethod[];
  trustStatus: TrustStatus;
  pairingState: PairingState;
  publicKey?: string;
  lastSeen: Date;
  firstSeen: Date;
  metadata: Record<string, any>;
}

export interface DeviceCapability {
  name: string;
  version?: string;
  permissions: string[];
  description?: string;
}

export interface DeviceCommand {
  id: string;
  deviceId: string;
  command: string;
  parameters: Record<string, any>;
  status: 'pending' | 'sent' | 'executed' | 'failed' | 'timeout';
  result?: any;
  error?: string;
  timestamp: Date;
  executedAt?: Date;
}

export interface PairingToken {
  token: string;
  deviceId: string;
  createdAt: Date;
  expiresAt: Date;
  used: boolean;
}

// ─── Device Fabric ────────────────────────────────────────────────────────

export class DeviceFabric {
  private devices: Map<string, DeviceDNA> = new Map();
  private commands: Map<string, DeviceCommand> = new Map();
  private pairingTokens: Map<string, PairingToken> = new Map();
  private selfId: string;

  constructor() {
    // The local device registers itself on init
    this.selfId = uuidv4();
    this.registerSelf();
  }

  // ── Self registration ────────────────────────────────────────────────

  private registerSelf(): void {
    const platform = this.detectPlatform();
    const type = this.detectDeviceType();
    const self: DeviceDNA = {
      id: this.selfId,
      name: this.generateSelfName(platform),
      type,
      platform,
      owner: 'local-user',
      capabilities: this.detectLocalCapabilities(),
      connectionMethods: ['direct', 'lan'],
      trustStatus: 'trusted',
      pairingState: 'paired',
      firstSeen: new Date(),
      lastSeen: new Date(),
      metadata: {
        hostname: this.getHostname(),
        isSelf: true,
      },
    };
    this.devices.set(this.selfId, self);
  }

  private detectPlatform(): DevicePlatform {
    if (typeof process !== 'undefined' && process.platform) {
      switch (process.platform) {
        case 'darwin': return 'macos';
        case 'win32': return 'windows';
        case 'linux': return 'linux';
        default: return 'unknown';
      }
    }
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
      const ua = (navigator as any).userAgent.toLowerCase();
      if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
      if (ua.includes('android')) return 'android';
      if (ua.includes('mac')) return 'macos';
      if (ua.includes('win')) return 'windows';
      if (ua.includes('linux')) return 'linux';
    }
    return 'unknown';
  }

  private detectDeviceType(): DeviceType {
    const platform = this.detectPlatform();
    if (platform === 'ios' || platform === 'android') {
      // Could be phone or tablet — default to mobile
      return 'mobile';
    }
    if (platform === 'macos' || platform === 'windows' || platform === 'linux') {
      return 'desktop';
    }
    return 'unknown';
  }

  private generateSelfName(platform: DevicePlatform): string {
    const host = this.getHostname();
    return `${host}-${platform}`;
  }

  private getHostname(): string {
    try {
      if (typeof process !== 'undefined' && process.platform) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const os = require('os');
        return os.hostname();
      }
    } catch (_) {}
    return 'jarvis';
  }

  private detectLocalCapabilities(): DeviceCapability[] {
    const caps: DeviceCapability[] = [
      { name: 'shell', permissions: ['execute'], description: 'Execute shell commands' },
      { name: 'filesystem', permissions: ['read', 'write', 'list', 'delete'], description: 'File system access' },
      { name: 'browser', permissions: ['navigate', 'click', 'type', 'screenshot', 'extract'], description: 'Browser automation via Playwright' },
      { name: 'desktop', permissions: ['mouse', 'keyboard', 'screenshot'], description: 'Desktop automation' },
      { name: 'voice', permissions: ['listen', 'speak'], description: 'Voice input and TTS' },
      { name: 'llm', permissions: ['infer'], description: 'LLM inference' },
      { name: 'memory', permissions: ['read', 'write', 'delete'], description: 'Memory engine access' },
      { name: 'vision', permissions: ['capture', 'analyze', 'detect'], description: 'Screen capture and vision analysis' },
    ];
    return caps;
  }

  // ── Device registration ──────────────────────────────────────────────

  registerDevice(device: Omit<DeviceDNA, 'id' | 'firstSeen' | 'lastSeen'> & { id?: string }): string {
    const id = device.id || uuidv4();
    const now = new Date();
    const dna: DeviceDNA = {
      ...device,
      id,
      firstSeen: now,
      lastSeen: now,
    };
    this.devices.set(id, dna);

    eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { action: 'device_registered', deviceId: id, name: dna.name },
      timestamp: now,
      source: 'DeviceFabric',
    });

    return id;
  }

  unregisterDevice(deviceId: string): boolean {
    const device = this.devices.get(deviceId);
    if (!device) return false;
    this.devices.delete(deviceId);
    return true;
  }

  getDevice(deviceId: string): DeviceDNA | null {
    return this.devices.get(deviceId) || null;
  }

  listDevices(filter?: {
    type?: DeviceType;
    trustStatus?: TrustStatus;
    pairingState?: PairingState;
  }): DeviceDNA[] {
    let devices = Array.from(this.devices.values());
    if (filter) {
      if (filter.type) devices = devices.filter(d => d.type === filter.type);
      if (filter.trustStatus) devices = devices.filter(d => d.trustStatus === filter.trustStatus);
      if (filter.pairingState) devices = devices.filter(d => d.pairingState === filter.pairingState);
    }
    return devices.sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
  }

  getSelf(): DeviceDNA {
    return this.devices.get(this.selfId)!;
  }

  getSelfId(): string {
    return this.selfId;
  }

  // ── Capability detection ─────────────────────────────────────────────

  getCapabilities(deviceId: string): DeviceCapability[] | null {
    const device = this.devices.get(deviceId);
    if (!device) return null;
    return device.capabilities;
  }

  hasCapability(deviceId: string, capability: string): boolean {
    const caps = this.getCapabilities(deviceId);
    if (!caps) return false;
    return caps.some(c => c.name === capability);
  }

  hasPermission(deviceId: string, capability: string, permission: string): boolean {
    const caps = this.getCapabilities(deviceId);
    if (!caps) return false;
    const cap = caps.find(c => c.name === capability);
    if (!cap) return false;
    return cap.permissions.includes(permission);
  }

  addCapability(deviceId: string, capability: DeviceCapability): boolean {
    const device = this.devices.get(deviceId);
    if (!device) return false;
    // Replace if exists, otherwise add
    const idx = device.capabilities.findIndex(c => c.name === capability.name);
    if (idx >= 0) {
      device.capabilities[idx] = capability;
    } else {
      device.capabilities.push(capability);
    }
    device.lastSeen = new Date();
    return true;
  }

  // ── Trust management ─────────────────────────────────────────────────

  setTrustStatus(deviceId: string, status: TrustStatus): boolean {
    const device = this.devices.get(deviceId);
    if (!device) return false;
    device.trustStatus = status;
    device.lastSeen = new Date();
    return true;
  }

  getTrustedDevices(): DeviceDNA[] {
    return this.listDevices({ trustStatus: 'trusted' });
  }

  getUnknownDevices(): DeviceDNA[] {
    return this.listDevices({ trustStatus: 'unknown' }).concat(
      this.listDevices({ trustStatus: 'unverified' })
    );
  }

  // ── Pairing ──────────────────────────────────────────────────────────

  createPairingToken(deviceId: string, ttlMinutes: number = 5): PairingToken | null {
    const device = this.devices.get(deviceId);
    if (!device) return null;
    const now = new Date();
    const token: PairingToken = {
      token: uuidv4(),
      deviceId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + ttlMinutes * 60 * 1000),
      used: false,
    };
    this.pairingTokens.set(token.token, token);
    device.pairingState = 'pairing';
    return token;
  }

  verifyPairingToken(token: string): { valid: boolean; deviceId?: string; reason?: string } {
    const pt = this.pairingTokens.get(token);
    if (!pt) return { valid: false, reason: 'Token not found' };
    if (pt.used) return { valid: false, reason: 'Token already used' };
    if (new Date() > pt.expiresAt) return { valid: false, reason: 'Token expired' };

    // Mark as used and pair the device
    pt.used = true;
    const device = this.devices.get(pt.deviceId);
    if (device) {
      device.pairingState = 'paired';
      device.trustStatus = 'trusted';
      device.lastSeen = new Date();
    }
    return { valid: true, deviceId: pt.deviceId };
  }

  revokePairing(deviceId: string): boolean {
    const device = this.devices.get(deviceId);
    if (!device) return false;
    device.pairingState = 'revoked';
    device.trustStatus = 'blocked';
    device.lastSeen = new Date();
    return true;
  }

  // ── Device commands ──────────────────────────────────────────────────

  async sendCommand(
    deviceId: string,
    command: string,
    parameters: Record<string, any> = {}
  ): Promise<string> {
    const device = this.devices.get(deviceId);
    if (!device) throw new Error(`Device not found: ${deviceId}`);

    if (device.trustStatus === 'blocked') {
      throw new Error(`Device ${deviceId} is blocked`);
    }

    const cmdId = uuidv4();
    const cmd: DeviceCommand = {
      id: cmdId,
      deviceId,
      command,
      parameters,
      status: 'pending',
      timestamp: new Date(),
    };
    this.commands.set(cmdId, cmd);

    // For the local device, we can execute directly via the environment runtime
    if (deviceId === this.selfId) {
      cmd.status = 'sent';
      try {
        // Lazy import to avoid circular dependency
        const { environmentRuntime } = await import('./environmentRuntime.js');
        const domain = parameters.domain || 'terminal';
        const result = await environmentRuntime.execute(domain, command, parameters, 'device-fabric');
        cmd.status = result.success ? 'executed' : 'failed';
        cmd.result = result.output;
        cmd.error = result.error;
        cmd.executedAt = new Date();
      } catch (err: any) {
        cmd.status = 'failed';
        cmd.error = err.message;
        cmd.executedAt = new Date();
      }
    } else {
      // Remote device — would send over the network via remoteGateway
      cmd.status = 'sent';
      // The remote gateway will update the command status when it gets a response
    }

    return cmdId;
  }

  getCommand(cmdId: string): DeviceCommand | null {
    return this.commands.get(cmdId) || null;
  }

  listCommands(deviceId?: string): DeviceCommand[] {
    let cmds = Array.from(this.commands.values());
    if (deviceId) cmds = cmds.filter(c => c.deviceId === deviceId);
    return cmds.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // ── Heartbeat ────────────────────────────────────────────────────────

  heartbeat(deviceId: string): boolean {
    const device = this.devices.get(deviceId);
    if (!device) return false;
    device.lastSeen = new Date();
    return true;
  }

  // ── Stats ────────────────────────────────────────────────────────────

  getStats() {
    const devices = Array.from(this.devices.values());
    return {
      totalDevices: devices.length,
      trusted: devices.filter(d => d.trustStatus === 'trusted').length,
      unknown: devices.filter(d => d.trustStatus === 'unknown' || d.trustStatus === 'unverified').length,
      blocked: devices.filter(d => d.trustStatus === 'blocked').length,
      paired: devices.filter(d => d.pairingState === 'paired').length,
      byType: devices.reduce((acc, d) => {
        acc[d.type] = (acc[d.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      totalCommands: this.commands.size,
      pendingCommands: Array.from(this.commands.values()).filter(c => c.status === 'pending').length,
    };
  }
}

// Singleton instance
export const deviceFabric = new DeviceFabric();

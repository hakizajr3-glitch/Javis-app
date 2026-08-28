/**
 * Device Discovery — LAN (mDNS/Bonjour) and Bluetooth (BLE) device discovery.
 *
 * Tier 2C.2, 2C.3
 *
 * In the Tauri desktop app, mDNS and Bluetooth use native OS APIs via
 * Rust commands. In browser/Node mode, we use a UDP-based mDNS
 * implementation and fall back to manual device registration.
 */

// Browser globals — declared so the Node-only tsconfig doesn't error.
declare const window: any;
declare const navigator: any;

import { v4 as uuidv4 } from 'uuid';
import { eventBus, EventType } from '../observability/eventBus.js';
import {
  deviceFabric,
  DeviceDNA,
  DeviceType,
  DevicePlatform,
  ConnectionMethod,
} from './deviceFabric.js';

// ─── Types ────────────────────────────────────────────────────────────────

export interface DiscoveredDevice {
  id: string;
  name: string;
  type: DeviceType;
  platform: DevicePlatform;
  connectionMethod: ConnectionMethod;
  address?: string;
  port?: number;
  rssi?: number;        // Signal strength (BLE)
  serviceType?: string; // mDNS service type
  metadata: Record<string, any>;
  discoveredAt: Date;
}

export interface DiscoveryConfig {
  enableLAN: boolean;
  enableBluetooth: boolean;
  enableUSB: boolean;
  scanIntervalMs: number;
  serviceTypes: string[]; // mDNS service types to scan for
}

// ─── Device Discovery ─────────────────────────────────────────────────────

export class DeviceDiscovery {
  private config: DiscoveryConfig;
  private discovered: Map<string, DiscoveredDevice> = new Map();
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private scanning: boolean = false;

  constructor(config?: Partial<DiscoveryConfig>) {
    this.config = {
      enableLAN: true,
      enableBluetooth: false, // BLE requires native APIs
      enableUSB: false,
      scanIntervalMs: 30000,  // 30 second default
      serviceTypes: [
        '_jarvis._tcp',     // JARVIS devices
        '_http._tcp',       // Web services
        '_ssh._tcp',        // SSH servers
        '_workstation._tcp', // Workstations
      ],
      ...config,
    };
  }

  // ── LAN Discovery (mDNS/Bonjour) ─────────────────────────────────────

  /**
   * Start LAN discovery. In the Tauri app, this delegates to a Rust
   * command that uses the system's mDNS implementation (Bonjour on macOS,
   * Avahi on Linux, WinRT on Windows). In Node mode, we attempt a UDP
   * multicast query.
   */
  async startLANDiscovery(): Promise<boolean> {
    if (!this.config.enableLAN) return false;

    // Try Tauri native mDNS first
    if (typeof globalThis !== 'undefined' && (globalThis as any).__TAURI_INTERNALS__ ? true : (globalThis as any).window && (globalThis as any).window.__TAURI_INTERNALS__) {
      try {
        const tauriModule = '@tauri-apps/api/core';
        const tauri = await import(/* @vite-ignore */ tauriModule);
        await tauri.invoke('start_mdns_discovery', {
          serviceTypes: this.config.serviceTypes,
        });
        return true;
      } catch (_) {
        // Fall through to Node mDNS
      }
    }

    // Node mode — try to use the `multicast-dns` package if available
    try {
      const mdnsModule = 'multicast-dns';
      const mDNS = await import(/* @vite-ignore */ mdnsModule);
      const mdns = mDNS.default();
      mdns.on('response', (response: any) => {
        this.handleMDNSResponse(response);
      });

      // Query for configured service types
      for (const serviceType of this.config.serviceTypes) {
        mdns.query({
          questions: [{ name: serviceType, type: 'PTR' }],
        });
      }
      return true;
    } catch (_) {
      // multicast-dns not installed — discovery will rely on manual registration
      console.log('[DeviceDiscovery] mDNS package not available, LAN discovery limited');
      return false;
    }
  }

  private handleMDNSResponse(response: any): void {
    if (!response.answers) return;
    for (const answer of response.answers) {
      if (answer.type === 'PTR' && answer.data) {
        const discovered: DiscoveredDevice = {
          id: uuidv4(),
          name: answer.name,
          type: this.inferDeviceType(answer.name),
          platform: 'unknown',
          connectionMethod: 'lan',
          serviceType: answer.name,
          metadata: { raw: answer },
          discoveredAt: new Date(),
        };
        this.addDiscoveredDevice(discovered);
      }
    }
  }

  private inferDeviceType(name: string): DeviceType {
    const lower = name.toLowerCase();
    if (lower.includes('iphone') || lower.includes('android')) return 'mobile';
    if (lower.includes('ipad') || lower.includes('tablet')) return 'tablet';
    if (lower.includes('macbook') || lower.includes('laptop')) return 'laptop';
    if (lower.includes('server') || lower.includes('raspberry') || lower.includes('pi-')) return 'server';
    if (lower.includes('watch') || lower.includes('glass')) return 'wearable';
    if (lower.includes('iot') || lower.includes('home') || lower.includes('sensor')) return 'iot';
    return 'desktop';
  }

  // ── Bluetooth Discovery (BLE) ────────────────────────────────────────

  /**
   * Start Bluetooth Low Energy discovery. Requires native OS APIs via
   * Tauri Rust commands. Not available in browser/Node mode.
   */
  async startBluetoothDiscovery(): Promise<boolean> {
    if (!this.config.enableBluetooth) return false;

    if (typeof globalThis !== 'undefined' && (globalThis as any).__TAURI_INTERNALS__ ? true : (globalThis as any).window && (globalThis as any).window.__TAURI_INTERNALS__) {
      try {
        const tauriModule = '@tauri-apps/api/core';
        const tauri = await import(/* @vite-ignore */ tauriModule);
        await tauri.invoke('start_ble_discovery', {});
        return true;
      } catch (_) {
        return false;
      }
    }

    // Web Bluetooth API (Chrome only)
    if (typeof navigator !== 'undefined' && (navigator as any).bluetooth) {
      try {
        const device = await (navigator as any).bluetooth.requestDevice({
          acceptAllDevices: true,
        });
        const discovered: DiscoveredDevice = {
          id: device.id || uuidv4(),
          name: device.name || 'Unknown BLE Device',
          type: 'unknown',
          platform: 'unknown',
          connectionMethod: 'bluetooth',
          metadata: { raw: device },
          discoveredAt: new Date(),
        };
        this.addDiscoveredDevice(discovered);
        return true;
      } catch (_) {
        return false;
      }
    }

    console.log('[DeviceDiscovery] Bluetooth discovery not available in this environment');
    return false;
  }

  // ── USB Discovery ────────────────────────────────────────────────────

  async startUSBDiscovery(): Promise<boolean> {
    if (!this.config.enableUSB) return false;

    if (typeof globalThis !== 'undefined' && (globalThis as any).__TAURI_INTERNALS__ ? true : (globalThis as any).window && (globalThis as any).window.__TAURI_INTERNALS__) {
      try {
        const tauriModule = '@tauri-apps/api/core';
        const tauri = await import(/* @vite-ignore */ tauriModule);
        const devices = await tauri.invoke('list_usb_devices', {});
        if (Array.isArray(devices)) {
          for (const usb of devices) {
            const discovered: DiscoveredDevice = {
              id: usb.id || uuidv4(),
              name: usb.name || 'USB Device',
              type: 'unknown',
              platform: 'embedded',
              connectionMethod: 'usb',
              metadata: { vendorId: usb.vendorId, productId: usb.productId },
              discoveredAt: new Date(),
            };
            this.addDiscoveredDevice(discovered);
          }
        }
        return true;
      } catch (_) {
        return false;
      }
    }

    // Web USB API
    if (typeof navigator !== 'undefined' && (navigator as any).usb) {
      try {
        const devices = await (navigator as any).usb.getDevices();
        for (const usb of devices) {
          const discovered: DiscoveredDevice = {
            id: `usb-${usb.vendorId}-${usb.productId}`,
            name: `USB ${usb.productName || 'Device'}`,
            type: 'unknown',
            platform: 'embedded',
            connectionMethod: 'usb',
            metadata: { vendorId: usb.vendorId, productId: usb.productId },
            discoveredAt: new Date(),
          };
          this.addDiscoveredDevice(discovered);
        }
        return true;
      } catch (_) {
        return false;
      }
    }

    return false;
  }

  // ── Discovery lifecycle ──────────────────────────────────────────────

  async startDiscovery(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;

    await this.startLANDiscovery();
    await this.startBluetoothDiscovery();
    await this.startUSBDiscovery();

    // Periodic rescan
    this.scanTimer = setInterval(async () => {
      if (this.config.enableLAN) await this.startLANDiscovery();
      if (this.config.enableBluetooth) await this.startBluetoothDiscovery();
    }, this.config.scanIntervalMs);

    eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { action: 'discovery_started', config: this.config },
      timestamp: new Date(),
      source: 'DeviceDiscovery',
    });
  }

  stopDiscovery(): void {
    this.scanning = false;
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
  }

  // ── Discovered device management ─────────────────────────────────────

  private addDiscoveredDevice(device: DiscoveredDevice): void {
    // Check if we already know this device
    const existing = this.discovered.get(device.id);
    if (existing) {
      existing.discoveredAt = new Date();
      existing.rssi = device.rssi;
      return;
    }

    this.discovered.set(device.id, device);

    // Register with the device fabric as unverified
    deviceFabric.registerDevice({
      id: device.id,
      name: device.name,
      type: device.type,
      platform: device.platform,
      owner: 'unknown',
      capabilities: [],
      connectionMethods: [device.connectionMethod],
      trustStatus: 'unknown',
      pairingState: 'unpaired',
      metadata: {
        ...device.metadata,
        address: device.address,
        port: device.port,
        rssi: device.rssi,
        serviceType: device.serviceType,
      },
    });

    eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { action: 'device_discovered', device },
      timestamp: new Date(),
      source: 'DeviceDiscovery',
    });
  }

  getDiscoveredDevices(): DiscoveredDevice[] {
    return Array.from(this.discovered.values()).sort(
      (a, b) => b.discoveredAt.getTime() - a.discoveredAt.getTime()
    );
  }

  updateConfig(updates: Partial<DiscoveryConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  getConfig(): DiscoveryConfig {
    return { ...this.config };
  }
}

// Singleton instance
export const deviceDiscovery = new DeviceDiscovery();

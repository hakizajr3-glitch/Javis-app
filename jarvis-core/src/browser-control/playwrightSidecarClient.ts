/**
 * Playwright Sidecar Client
 *
 * TypeScript client that communicates with the Playwright sidecar server.
 * The sidecar is a Node.js process spawned by the Tauri app (or run
 * standalone) that actually drives the browser via Playwright.
 *
 * This client handles:
 *   - Starting the sidecar process if it's not running
 *   - Sending commands via HTTP
 *   - Health checking and reconnection
 *   - Falling back gracefully if the sidecar isn't available
 */

const SIDECAR_PORT = 19222;
const SIDECAR_URL = `http://127.0.0.1:${SIDECAR_PORT}`;
const HEALTH_TIMEOUT = 2000;
const COMMAND_TIMEOUT = 35000;

export interface SidecarCommand {
  action: string;
  params: Record<string, any>;
}

export interface SidecarResponse {
  success: boolean;
  result?: any;
  error?: string;
}

class PlaywrightSidecarClient {
  private sidecarProcess: any = null;
  private sidecarReady = false;
  private starting = false;

  // ─── Health check ──────────────────────────────────────────────────────

  async isRunning(): Promise<boolean> {
    try {
      const res = await fetch(`${SIDECAR_URL}/health`, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT),
      });
      if (res.ok) {
        const data = await res.json();
        this.sidecarReady = true;
        return data.status === 'ok';
      }
    } catch (_) { /* not running */ }
    this.sidecarReady = false;
    return false;
  }

  // ─── Start the sidecar process ─────────────────────────────────────────

  async start(): Promise<boolean> {
    if (this.sidecarReady) return true;
    if (this.starting) {
      // Wait for ongoing start
      while (this.starting) await new Promise(r => setTimeout(r, 100));
      return this.sidecarReady;
    }

    this.starting = true;
    try {
      // First check if it's already running (maybe started externally)
      if (await this.isRunning()) {
        this.starting = false;
        return true;
      }

      // Try to spawn the sidecar process
      // In Tauri: use the shell plugin to spawn a sidecar
      // In browser dev: the user needs to run it manually
      const spawned = await this.spawnSidecar();
      if (!spawned) {
        this.starting = false;
        return false;
      }

      // Wait for it to be ready (up to 10 seconds)
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (await this.isRunning()) {
          this.starting = false;
          return true;
        }
      }

      this.starting = false;
      return false;
    } catch (_) {
      this.starting = false;
      return false;
    }
  }

  // ─── Spawn the sidecar ─────────────────────────────────────────────────

  private async spawnSidecar(): Promise<boolean> {
    try {
      // Try Tauri shell plugin first
      if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
        try {
          // Use a string variable to prevent Vite from statically resolving this
          // at build time — it's only available in the Tauri runtime.
          const shellModule = '@tauri-apps/plugin-shell';
          const shell = await import(/* @vite-ignore */ shellModule);
          const sidecar = await shell.Command.sidecar('binaries/playwright-sidecar', ['--port=' + SIDECAR_PORT]);
          sidecar.on('close', () => { this.sidecarReady = false; this.sidecarProcess = null; });
          sidecar.on('error', () => { this.sidecarReady = false; this.sidecarProcess = null; });
          await sidecar.spawn();
          this.sidecarProcess = sidecar;
          return true;
        } catch (_) {
          // Fall through to Node.js spawn
        }
      }

      // Try spawning via Node.js child_process (works in Electron or dev mode)
      if (typeof require !== 'undefined') {
        try {
          const { spawn } = require('child_process');
          const path = require('path');
          const fs = require('fs');

          // Find the sidecar script
          const candidates = [
            path.join(process.cwd(), 'jarvis-core/src/browser-control/playwrightSidecar.ts'),
            path.join(process.cwd(), 'src/browser-control/playwrightSidecar.ts'),
            path.join(__dirname, 'playwrightSidecar.ts'),
          ];
          const scriptPath = candidates.find(p => { try { return fs.existsSync(p); } catch (_) { return false; } });

          if (scriptPath) {
            const child = spawn('npx', ['tsx', scriptPath, `--port=${SIDECAR_PORT}`], {
              detached: false,
              stdio: 'pipe',
              env: { ...process.env },
            });
            child.on('exit', () => { this.sidecarReady = false; this.sidecarProcess = null; });
            child.on('error', () => { this.sidecarReady = false; this.sidecarProcess = null; });
            this.sidecarProcess = child;
            return true;
          }
        } catch (_) { /* fall through */ }
      }

      return false;
    } catch (_) {
      return false;
    }
  }

  // ─── Stop the sidecar ──────────────────────────────────────────────────

  async stop(): Promise<void> {
    try {
      await fetch(`${SIDECAR_URL}/shutdown`, {
        method: 'POST',
        signal: AbortSignal.timeout(2000),
      });
    } catch (_) { /* ignore */ }
    this.sidecarReady = false;
    this.sidecarProcess = null;
  }

  // ─── Send a command ────────────────────────────────────────────────────

  async sendCommand(action: string, params: Record<string, any> = {}): Promise<SidecarResponse> {
    // Ensure sidecar is running
    if (!this.sidecarReady) {
      const started = await this.start();
      if (!started) {
        return {
          success: false,
          error: 'Playwright sidecar is not running. Start it with: npx tsx jarvis-core/src/browser-control/playwrightSidecar.ts',
        };
      }
    }

    try {
      const res = await fetch(`${SIDECAR_URL}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, params } as SidecarCommand),
        signal: AbortSignal.timeout(COMMAND_TIMEOUT),
      });

      if (!res.ok) {
        return { success: false, error: `Sidecar returned HTTP ${res.status}` };
      }

      return await res.json() as SidecarResponse;
    } catch (err: any) {
      this.sidecarReady = false;
      return { success: false, error: err?.message || 'Failed to reach sidecar' };
    }
  }

  // ─── Convenience methods ───────────────────────────────────────────────

  async navigate(url: string): Promise<SidecarResponse> {
    return this.sendCommand('navigate', { url });
  }

  async click(selector: string): Promise<SidecarResponse> {
    return this.sendCommand('click', { selector });
  }

  async type(selector: string, text: string): Promise<SidecarResponse> {
    return this.sendCommand('type', { selector, text });
  }

  async screenshot(fullPage = false): Promise<SidecarResponse> {
    return this.sendCommand('screenshot', { fullPage });
  }

  async extractText(selector: string): Promise<SidecarResponse> {
    return this.sendCommand('extract', { selector, extractType: 'text' });
  }

  async evaluate(script: string): Promise<SidecarResponse> {
    return this.sendCommand('evaluate', { script });
  }

  async getTitle(): Promise<SidecarResponse> {
    return this.sendCommand('getTitle', {});
  }

  async getUrl(): Promise<SidecarResponse> {
    return this.sendCommand('getUrl', {});
  }

  async waitFor(selector: string, timeout = 10000): Promise<SidecarResponse> {
    return this.sendCommand('waitFor', { selector, timeout });
  }

  isReady(): boolean {
    return this.sidecarReady;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export const playwrightSidecar = new PlaywrightSidecarClient();

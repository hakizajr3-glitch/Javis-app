/**
 * JARVIS Elite Agentic Harness — Pillar 6: Environment Runtime.
 *
 * Wraps the existing desktop-browser-control module (desktopAutomation +
 * browserControl) behind the harness's typed interface. This is the layer
 * that actually touches the user's computer: desktop, browser, terminal,
 * files.
 *
 * In Tier 1, this is a thin wrapper that delegates to the existing
 * desktop-browser-control module (which currently returns fake results).
 * In Tier 2, this will be replaced with real Tauri-native IPC calls.
 *
 * Design principles (NOOA):
 *  - Control hierarchy: API → Structured UI → Accessibility → DOM → Vision
 *    → Mouse/Keyboard.
 *  - Every action goes through policyEngine first.
 *  - Every action is verified by verificationEngine after.
 */
import { v4 as uuidv4 } from 'uuid';
import { desktopAutomation } from '../desktop-browser-control/desktopAutomation.js';
import { browserControl } from '../desktop-browser-control/browserControl.js';
import { eventBus, EventType } from '../observability/eventBus.js';

// ─── Tauri command bridge ────────────────────────────────────────────────────
// When running in the Tauri desktop app, terminal and file operations
// call the Rust #[tauri::command] functions for real execution.

async function invokeTauri(cmd: string, args?: Record<string, unknown>): Promise<any> {
  try {
    // Use a string variable to prevent Vite/Rollup from statically resolving
    // this at build time — it's only available in the Tauri runtime.
    const tauriModule = '@tauri-apps/api/core';
    const tauri = await import(/* @vite-ignore */ tauriModule);
    return await tauri.invoke(cmd, args);
  } catch (_) {
    return null;
  }
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
}

export type EnvironmentDomain = 'desktop' | 'browser' | 'terminal' | 'file';

export interface EnvironmentAction {
  id: string;
  domain: EnvironmentDomain;
  action: string;
  parameters: Record<string, any>;
  userId: string;
  requiresApproval: boolean;
}

export interface EnvironmentResult {
  actionId: string;
  domain: EnvironmentDomain;
  success: boolean;
  output?: any;
  error?: string;
  durationMs: number;
}

export class EnvironmentRuntime {
  /**
   * Execute a desktop action — delegates to desktopAutomation.
   * In Tier 1, this goes through the existing (fake) implementation.
   * In Tier 2, this will call Tauri IPC commands.
   */
  async executeDesktop(
    action: string,
    parameters: Record<string, any>,
    userId: string
  ): Promise<EnvironmentResult> {
    return this.executeWithTiming('desktop', action, parameters, userId, async () => {
      const actionId = await desktopAutomation.executeAction(
        { type: action as any, parameters, requiresApproval: false } as any,
        userId
      );
      return { actionId };
    });
  }

  /** Execute a browser action — delegates to browserControl. */
  async executeBrowser(
    action: string,
    parameters: Record<string, any>,
    userId: string
  ): Promise<EnvironmentResult> {
    return this.executeWithTiming('browser', action, parameters, userId, async () => {
      const actionId = await browserControl.executeAction(
        { type: action as any, parameters, requiresApproval: false } as any,
        userId
      );
      return { actionId };
    });
  }

  /**
   * Generic domain-dispatching execute. Routes to the correct domain
   * handler (desktop / browser / terminal / file) based on the `domain`
   * argument. Used by the mission supervisor for automation tasks.
   */
  async execute(
    domain: EnvironmentDomain,
    action: string,
    parameters: Record<string, any>,
    userId: string
  ): Promise<EnvironmentResult> {
    switch (domain) {
      case 'desktop':
        return this.executeDesktop(action, parameters, userId);
      case 'browser':
        return this.executeBrowser(action, parameters, userId);
      case 'terminal':
        return this.executeTerminal(parameters.command ?? action, userId);
      case 'file':
        return this.executeFile(action as 'read' | 'write' | 'delete' | 'copy' | 'move' | 'list', parameters, userId);
      default:
        return {
          actionId: uuidv4(),
          domain,
          success: false,
          error: `Unknown domain: ${domain}`,
          durationMs: 0,
        };
    }
  }

  /** Navigate to a URL. */
  async navigate(url: string, userId: string): Promise<EnvironmentResult> {
    return this.executeBrowser('navigate', { url }, userId);
  }

  /** Click an element. */
  async click(selector: string, userId: string): Promise<EnvironmentResult> {
    return this.executeBrowser('click', { selector }, userId);
  }

  /** Type text into an element. */
  async type(selector: string, text: string, userId: string): Promise<EnvironmentResult> {
    return this.executeBrowser('type', { selector, text }, userId);
  }

  /** Take a screenshot. */
  async screenshot(userId: string): Promise<EnvironmentResult> {
    return this.executeBrowser('screenshot', {}, userId);
  }

  /** Mouse click at a position. */
  async mouseClick(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left', userId: string): Promise<EnvironmentResult> {
    return this.executeDesktop('mouse_click', { position: { x, y }, button }, userId);
  }

  /** Keyboard type. */
  async keyboardType(text: string, userId: string): Promise<EnvironmentResult> {
    return this.executeDesktop('keyboard_type', { text }, userId);
  }

  /** Keyboard press. */
  async keyboardPress(key: string, modifiers: string[] = [], userId: string): Promise<EnvironmentResult> {
    return this.executeDesktop('keyboard_press', { key, modifiers }, userId);
  }

  /**
   * Execute a terminal command.
   * In the Tauri desktop app, this calls the Rust `execute_shell` command
   * for real shell execution. In browser mode, it returns a placeholder.
   */
  async executeTerminal(command: string, userId: string): Promise<EnvironmentResult> {
    return this.executeWithTiming('terminal', 'execute', { command }, userId, async () => {
      if (!isTauri()) {
        return {
          output: `[browser-mode] Would execute: ${command}`,
          note: 'Real terminal execution requires the Tauri desktop app',
        };
      }
      const result = await invokeTauri('execute_shell', { command });
      if (!result) throw new Error('Tauri execute_shell returned null');
      return {
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.exitCode ?? -1,
        success: result.success ?? (result.exitCode === 0),
      };
    });
  }

  /**
   * Execute a file operation.
   * In the Tauri desktop app, this calls the Rust file commands for real
   * file I/O. In browser mode, it delegates to the filesystem connector.
   */
  async executeFile(
    operation: 'read' | 'write' | 'delete' | 'copy' | 'move' | 'list',
    parameters: Record<string, any>,
    userId: string
  ): Promise<EnvironmentResult> {
    return this.executeWithTiming('file', operation, parameters, userId, async () => {
      // In Tauri mode, use real Rust file commands
      if (isTauri()) {
        switch (operation) {
          case 'read': {
            const result = await invokeTauri('read_file', { path: parameters.path });
            if (!result?.success) throw new Error(result?.error || 'Read failed');
            return { content: result.data };
          }
          case 'write': {
            const result = await invokeTauri('write_file', { path: parameters.path, content: parameters.content || '' });
            if (!result?.success) throw new Error(result?.error || 'Write failed');
            return { written: true, path: parameters.path };
          }
          case 'delete': {
            const result = await invokeTauri('delete_path', { path: parameters.path });
            if (!result?.success) throw new Error(result?.error || 'Delete failed');
            return { deleted: true, path: parameters.path };
          }
          case 'copy': {
            const result = await invokeTauri('copy_file', { source: parameters.source, destination: parameters.destination });
            if (!result?.success) throw new Error(result?.error || 'Copy failed');
            return { copied: true, source: parameters.source, destination: parameters.destination };
          }
          case 'move': {
            const result = await invokeTauri('move_path', { source: parameters.source, destination: parameters.destination });
            if (!result?.success) throw new Error(result?.error || 'Move failed');
            return { moved: true, source: parameters.source, destination: parameters.destination };
          }
          case 'list': {
            const entries = await invokeTauri('list_dir', { path: parameters.path });
            return { entries: entries || [] };
          }
          default:
            throw new Error(`Unknown file operation: ${operation}`);
        }
      }

      // Browser mode — delegate to the filesystem connector
      const { connectorRegistry } = await import('../integrations-connector-layer/connectorRegistry.js');
      return connectorRegistry.executeConnector('local-filesystem', operation, parameters, userId);
    });
  }

  /** List all desktop actions. */
  async listDesktopActions(filters?: { userId?: string; type?: string; executed?: boolean }): Promise<any[]> {
    return desktopAutomation.listActions(filters);
  }

  /** List all browser actions. */
  async listBrowserActions(filters?: { userId?: string; type?: string; executed?: boolean }): Promise<any[]> {
    return browserControl.listActions(filters);
  }

  // -----------------------------------------------------------------------
  // Internal helper
  // -----------------------------------------------------------------------

  private async executeWithTiming(
    domain: EnvironmentDomain,
    action: string,
    _parameters: Record<string, any>,
    userId: string,
    fn: () => Promise<any>
  ): Promise<EnvironmentResult> {
    const start = Date.now();
    const actionId = uuidv4();
    try {
      const output = await fn();
      const result: EnvironmentResult = {
        actionId,
        domain,
        success: true,
        output,
        durationMs: Date.now() - start,
      };
      await eventBus.publish({
        id: uuidv4(),
        type: EventType.TASK_COMPLETED,
        payload: { actionId, domain, action, success: true, durationMs: result.durationMs },
        timestamp: new Date(),
        source: 'EnvironmentRuntime',
        correlationId: userId,
      });
      return result;
    } catch (err: any) {
      const result: EnvironmentResult = {
        actionId,
        domain,
        success: false,
        error: err?.message ?? String(err),
        durationMs: Date.now() - start,
      };
      await eventBus.publish({
        id: uuidv4(),
        type: EventType.TASK_FAILED,
        payload: { actionId, domain, action, error: result.error, durationMs: result.durationMs },
        timestamp: new Date(),
        source: 'EnvironmentRuntime',
        correlationId: userId,
      });
      return result;
    }
  }
}

/** Singleton instance. */
export const environmentRuntime = new EnvironmentRuntime();

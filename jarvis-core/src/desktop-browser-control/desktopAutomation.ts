import { v4 as uuidv4 } from 'uuid';
import {
  ActionId,
  DesktopAction,
  MousePosition,
  WindowInfo,
} from './types.js';
import { securityLayer } from '../security/securityLayer.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { taskLogger } from '../self-improving-skills/taskLogger.js';

// ─── Tauri command bridge ────────────────────────────────────────────────────
// When running in the Tauri desktop app, we call the Rust #[tauri::command]
// functions for real desktop automation. In browser mode, we fall back to
// returning simulated results so the UI still works for development.

async function invokeTauri(cmd: string, args?: Record<string, unknown>): Promise<any> {
  try {
    // Use a string variable to prevent Vite/Rollup from statically resolving
    // this at build time — it's only available in the Tauri runtime.
    const tauriModule = '@tauri-apps/api/core';
    const tauri = await import(/* @vite-ignore */ tauriModule);
    return await tauri.invoke(cmd, args);
  } catch (_) {
    return null; // Not in Tauri — caller handles null
  }
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
}

export class DesktopAutomation {
  private actionHistory: Map<ActionId, DesktopAction> = new Map();
  private windows: Map<string, WindowInfo> = new Map();

  async executeAction(action: Omit<DesktopAction, 'id' | 'timestamp' | 'executed' | 'approved'>, userId: string): Promise<ActionId> {
    const actionId = uuidv4() as ActionId;

    // Check if action requires approval
    const approvalDecision = await securityLayer.enforceApprovalGate({
      userId,
      type: action.type,
      resource: 'desktop',
      description: `Desktop action: ${action.type}`,
    });

    const approved = !approvalDecision.requiresApproval;

    const desktopAction: DesktopAction = {
      ...action,
      id: actionId,
      timestamp: new Date(),
      executed: approved,
      approved,
      approvedBy: approved ? userId : undefined,
    };

    this.actionHistory.set(actionId, desktopAction);

    if (approved) {
      // Execute the action
      try {
        const result = await this.performAction(action);
        desktopAction.result = result;
        desktopAction.executed = true;
      } catch (error) {
        desktopAction.error = error as Error;
        desktopAction.executed = false;
      }

      // Log the task
      await taskLogger.logTask({
        description: `Desktop automation: ${action.type}`,
        context: { actionId, actionType: action.type },
        parameters: action.parameters,
        result: desktopAction.result,
        success: desktopAction.executed,
        duration: 0, // Would track actual duration
        userId,
        tags: ['desktop_automation', action.type],
      });
    }

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { actionId, action: desktopAction },
      timestamp: new Date(),
      source: 'DesktopAutomation',
      correlationId: userId,
    });

    return actionId;
  }

  async getAction(actionId: ActionId): Promise<DesktopAction | null> {
    return this.actionHistory.get(actionId) || null;
  }

  async listActions(filters?: { userId?: string; type?: string; executed?: boolean }): Promise<DesktopAction[]> {
    let actions = Array.from(this.actionHistory.values());

    if (filters) {
      if (filters.type) {
        actions = actions.filter(a => a.type === filters.type);
      }
      if (filters.executed !== undefined) {
        actions = actions.filter(a => a.executed === filters.executed);
      }
    }

    return actions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Mouse Actions
  async mouseClick(position: MousePosition, button: 'left' | 'right' | 'middle' = 'left', userId: string): Promise<ActionId> {
    return this.executeAction({
      type: 'mouse_click',
      parameters: { position, button },
    }, userId);
  }

  async mouseMove(position: MousePosition, userId: string): Promise<ActionId> {
    return this.executeAction({
      type: 'mouse_move',
      parameters: { position },
    }, userId);
  }

  async mouseDrag(from: MousePosition, to: MousePosition, userId: string): Promise<ActionId> {
    return this.executeAction({
      type: 'mouse_drag',
      parameters: { from, to },
    }, userId);
  }

  // Keyboard Actions
  async keyboardType(text: string, userId: string): Promise<ActionId> {
    return this.executeAction({
      type: 'keyboard_type',
      parameters: { text },
    }, userId);
  }

  async keyboardPress(key: string, modifiers: string[] = [], userId: string): Promise<ActionId> {
    return this.executeAction({
      type: 'keyboard_press',
      parameters: { key, modifiers },
    }, userId);
  }

  // Window Actions
  async focusWindow(windowId: string, userId: string): Promise<ActionId> {
    return this.executeAction({
      type: 'window_focus',
      parameters: { windowId },
    }, userId);
  }

  async resizeWindow(windowId: string, width: number, height: number, userId: string): Promise<ActionId> {
    return this.executeAction({
      type: 'window_resize',
      parameters: { windowId, width, height },
    }, userId);
  }

  async moveWindow(windowId: string, x: number, y: number, userId: string): Promise<ActionId> {
    return this.executeAction({
      type: 'window_move',
      parameters: { windowId, x, y },
    }, userId);
  }

  async closeWindow(windowId: string, userId: string): Promise<ActionId> {
    return this.executeAction({
      type: 'window_close',
      parameters: { windowId },
    }, userId);
  }

  // Window Management
  async listWindows(): Promise<WindowInfo[]> {
    // In production, this would use actual OS APIs to list windows
    // For now, return mock data
    return Array.from(this.windows.values());
  }

  async getActiveWindow(): Promise<WindowInfo | null> {
    const windows = await this.listWindows();
    return windows.find(w => w.focused) || null;
  }

  async refreshWindows(): Promise<void> {
    // In production, this would refresh the window list from the OS
    // For now, generate mock data
    this.windows = new Map([
      ['window-1', {
        id: 'window-1',
        title: 'JARVIS Desktop',
        processName: 'jarvis-tauri',
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        focused: true,
      }],
    ]);
  }

  async getStats(userId: string): Promise<{
    totalActions: number;
    successfulActions: number;
    failedActions: number;
    byType: Record<string, number>;
  }> {
    const actions = await this.listActions({ userId });
    const successful = actions.filter(a => a.executed).length;
    const failed = actions.filter(a => !a.executed).length;

    const byType: Record<string, number> = {};
    for (const action of actions) {
      byType[action.type] = (byType[action.type] || 0) + 1;
    }

    return {
      totalActions: actions.length,
      successfulActions: successful,
      failedActions: failed,
      byType,
    };
  }

  private async performAction(action: Omit<DesktopAction, 'id' | 'timestamp' | 'executed' | 'approved'>): Promise<any> {
    // Real desktop automation via Tauri #[tauri::command] functions.
    // When in the Tauri desktop app, these call the Rust backend which
    // uses the `enigo` crate for mouse/keyboard control.
    // When in browser mode, we return simulated results for development.
    console.log(`[Desktop Automation] Executing: ${action.type}`, action.parameters);

    if (!isTauri()) {
      // Browser mode — return simulated results so the UI works for dev
      switch (action.type) {
        case 'mouse_click':
          return { clicked: true, position: action.parameters.position, simulated: true };
        case 'mouse_move':
          return { moved: true, position: action.parameters.position, simulated: true };
        case 'mouse_drag':
          return { dragged: true, from: action.parameters.from, to: action.parameters.to, simulated: true };
        case 'keyboard_type':
          return { typed: true, text: action.parameters.text, simulated: true };
        case 'keyboard_press':
          return { pressed: true, key: action.parameters.key, simulated: true };
        case 'window_focus':
          return { focused: true, windowId: action.parameters.windowId, simulated: true };
        case 'window_resize':
          return { resized: true, windowId: action.parameters.windowId, simulated: true };
        case 'window_move':
          return { moved: true, windowId: action.parameters.windowId, simulated: true };
        case 'window_close':
          return { closed: true, windowId: action.parameters.windowId, simulated: true };
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }
    }

    // Tauri mode — call real Rust commands
    const p = action.parameters;
    switch (action.type) {
      case 'mouse_click': {
        const pos = p.position || { x: 0, y: 0 };
        // Move to position first, then click
        await invokeTauri('mouse_move', { x: pos.x, y: pos.y });
        const result = await invokeTauri('mouse_click', { button: p.button || 'left' });
        if (result && !result.success) throw new Error(result.error || 'Mouse click failed');
        return { clicked: true, position: pos, button: p.button || 'left' };
      }
      case 'mouse_move': {
        const pos = p.position || { x: 0, y: 0 };
        const result = await invokeTauri('mouse_move', { x: pos.x, y: pos.y });
        if (result && !result.success) throw new Error(result.error || 'Mouse move failed');
        return { moved: true, position: pos };
      }
      case 'mouse_drag': {
        const from = p.from || { x: 0, y: 0 };
        const to = p.to || { x: 0, y: 0 };
        const result = await invokeTauri('mouse_drag', { startX: from.x, startY: from.y, endX: to.x, endY: to.y });
        if (result && !result.success) throw new Error(result.error || 'Drag failed');
        return { dragged: true, from, to };
      }
      case 'keyboard_type': {
        const result = await invokeTauri('keyboard_type', { text: p.text || '' });
        if (result && !result.success) throw new Error(result.error || 'Type failed');
        return { typed: true, text: p.text };
      }
      case 'keyboard_press': {
        const key = p.key || 'Enter';
        if (p.modifiers && p.modifiers.length > 0) {
          const result = await invokeTauri('keyboard_hotkey', { keys: [...p.modifiers, key] });
          if (result && !result.success) throw new Error(result.error || 'Hotkey failed');
        } else {
          const result = await invokeTauri('keyboard_press', { key });
          if (result && !result.success) throw new Error(result.error || 'Key press failed');
        }
        return { pressed: true, key: p.key, modifiers: p.modifiers || [] };
      }
      case 'window_focus':
        // Window management would need OS-specific Rust commands
        return { focused: true, windowId: p.windowId, note: 'Window management requires OS-specific implementation' };
      case 'window_resize':
        return { resized: true, windowId: p.windowId, note: 'Window management requires OS-specific implementation' };
      case 'window_move':
        return { moved: true, windowId: p.windowId, note: 'Window management requires OS-specific implementation' };
      case 'window_close':
        return { closed: true, windowId: p.windowId, note: 'Window management requires OS-specific implementation' };
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }
}

// Singleton instance
export const desktopAutomation = new DesktopAutomation();

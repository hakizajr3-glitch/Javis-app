import { v4 as uuidv4 } from 'uuid';
import {
  ActionId,
  BrowserAction,
} from './types.js';
import { securityLayer } from '../security/securityLayer.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { taskLogger } from '../self-improving-skills/taskLogger.js';
import { playwrightSidecar } from '../browser-control/playwrightSidecarClient.js';

export class BrowserControl {
  private actionHistory: Map<ActionId, BrowserAction> = new Map();
  private currentUrl: string = '';

  async executeAction(action: Omit<BrowserAction, 'id' | 'timestamp' | 'executed' | 'approved'>, userId: string): Promise<ActionId> {
    const actionId = uuidv4() as ActionId;

    // Check if action requires approval
    const approvalDecision = await securityLayer.enforceApprovalGate({
      userId,
      type: action.type,
      resource: 'browser',
      description: `Browser action: ${action.type}`,
    });

    const approved = !approvalDecision.requiresApproval;

    const browserAction: BrowserAction = {
      ...action,
      id: actionId,
      timestamp: new Date(),
      executed: approved,
      approved,
      approvedBy: approved ? userId : undefined,
    };

    this.actionHistory.set(actionId, browserAction);

    if (approved) {
      // Execute the action
      try {
        const result = await this.performAction(action);
        browserAction.result = result;
        browserAction.executed = true;
      } catch (error) {
        browserAction.error = error as Error;
        browserAction.executed = false;
      }

      // Log the task
      await taskLogger.logTask({
        description: `Browser automation: ${action.type}`,
        context: { actionId, actionType: action.type, url: action.url },
        parameters: action.parameters,
        result: browserAction.result,
        success: browserAction.executed,
        duration: 0,
        userId,
        tags: ['browser_automation', action.type],
      });
    }

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { actionId, action: browserAction },
      timestamp: new Date(),
      source: 'BrowserControl',
      correlationId: userId,
    });

    return actionId;
  }

  async getAction(actionId: ActionId): Promise<BrowserAction | null> {
    return this.actionHistory.get(actionId) || null;
  }

  async listActions(filters?: { userId?: string; type?: string; executed?: boolean }): Promise<BrowserAction[]> {
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

  // Navigation Actions
  async navigate(url: string, userId: string): Promise<ActionId> {
    return this.executeAction({
      type: 'navigate',
      url,
      parameters: { url },
    }, userId);
  }

  async click(selector: string, userId: string): Promise<ActionId> {
    return this.executeAction({
      type: 'click',
      selector,
      parameters: { selector },
    }, userId);
  }

  async type(selector: string, text: string, userId: string): Promise<ActionId> {
    return this.executeAction({
      type: 'type',
      selector,
      parameters: { selector, text },
    }, userId);
  }

  async scroll(direction: 'up' | 'down' | 'left' | 'right', amount: number, userId: string): Promise<ActionId> {
    return this.executeAction({
      type: 'scroll',
      parameters: { direction, amount },
    }, userId);
  }

  async select(selector: string, value: string, userId: string): Promise<ActionId> {
    return this.executeAction({
      type: 'select',
      selector,
      parameters: { selector, value },
    }, userId);
  }

  async submit(userId: string, selector?: string): Promise<ActionId> {
    return this.executeAction({
      type: 'submit',
      selector,
      parameters: { selector },
    }, userId);
  }

  // Data Extraction
  async extractText(selector: string, userId: string): Promise<ActionId> {
    return this.executeAction({
      type: 'extract',
      selector,
      parameters: { selector, extractType: 'text' },
    }, userId);
  }

  async extractAttribute(selector: string, attribute: string, userId: string): Promise<ActionId> {
    return this.executeAction({
      type: 'extract',
      selector,
      parameters: { selector, extractType: 'attribute', attribute },
    }, userId);
  }

  async screenshot(userId: string): Promise<ActionId> {
    return this.executeAction({
      type: 'screenshot',
      parameters: {},
    }, userId);
  }

  async getCurrentUrl(): Promise<string> {
    return this.currentUrl;
  }

  async getPageTitle(): Promise<string> {
    const response = await playwrightSidecar.sendCommand('getTitle', {});
    if (response.success && response.result?.title) {
      return response.result.title;
    }
    return 'JARVIS Browser Control';
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

  private async performAction(action: Omit<BrowserAction, 'id' | 'timestamp' | 'executed' | 'approved'>): Promise<any> {
    // Real browser automation via Playwright sidecar.
    // The sidecar is a Node.js process running Playwright that the Tauri
    // app spawns. If the sidecar isn't running, we return an error so the
    // caller can handle it gracefully.
    console.log(`[Browser Control] Executing via Playwright: ${action.type}`, action.parameters);

    const params: Record<string, any> = { ...action.parameters };
    if (action.url) params.url = action.url;
    if (action.selector) params.selector = action.selector;

    const response = await playwrightSidecar.sendCommand(action.type, params);

    if (!response.success) {
      throw new Error(response.error || `Browser action "${action.type}" failed`);
    }

    // Track current URL for navigation actions
    if (action.type === 'navigate' && response.result?.url) {
      this.currentUrl = response.result.url;
    }

    return response.result;
  }
}

// Singleton instance
export const browserControl = new BrowserControl();

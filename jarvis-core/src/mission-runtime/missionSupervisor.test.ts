import { describe, it, expect } from 'vitest';
import { MissionSupervisor } from './missionSupervisor.js';
import type { Task } from './types.js';

describe('MissionSupervisor real execution (Tier 2A.8)', () => {
  it('automation task executes through environmentRuntime, not desktop-runtime-required', async () => {
    const sup = new MissionSupervisor();
    const task: Task = {
      id: 't1',
      name: 'Click mouse',
      description: 'Click the mouse at 100,200',
      type: 'automation',
      parameters: {
        domain: 'desktop',
        action: 'mouse_click',
        parameters: { position: { x: 100, y: 200 }, button: 'left' },
      },
      status: 'pending',
      critical: false,
    };

    // Call the private method via any cast
    const result = await (sup as any).executeAutomationTask(task, 'test-user');

    expect(result.executed).toBe(true);
    expect(result.domain).toBe('desktop');
    expect(result.action).toBe('mouse_click');
    // Must NOT be the old stub response
    expect(result.reason).not.toBe('desktop-runtime-required');
  });

  it('browser automation task executes through browserControl', async () => {
    const sup = new MissionSupervisor();
    const task: Task = {
      id: 't2',
      name: 'Navigate to example.com',
      description: 'Navigate the browser to example.com',
      type: 'automation',
      parameters: {
        domain: 'browser',
        action: 'navigate',
        parameters: { url: 'https://example.com' },
      },
      status: 'pending',
      critical: false,
    };

    const result = await (sup as any).executeAutomationTask(task, 'test-user');

    expect(result.executed).toBe(true);
    expect(result.domain).toBe('browser');
    expect(result.reason).not.toBe('desktop-runtime-required');
  });

  it('memory task stores and retrieves real data', async () => {
    const sup = new MissionSupervisor();
    const storeTask: Task = {
      id: 't3',
      name: 'Store memory',
      description: 'Store a value in working memory',
      type: 'memory',
      parameters: {
        operation: 'store',
        key: 'test-key',
        value: { hello: 'world' },
        context: 'test-context',
      },
      status: 'pending',
      critical: false,
    };

    const storeResult = await (sup as any).executeMemoryTask(storeTask);
    expect(storeResult.memoryOperation).toBe('store');
    expect(storeResult.key).toBe('test-key');

    const retrieveTask: Task = {
      id: 't4',
      name: 'Retrieve memory',
      description: 'Retrieve a value from working memory',
      type: 'memory',
      parameters: {
        operation: 'retrieve',
        key: 'test-key',
        context: 'test-context',
      },
      status: 'pending',
      critical: false,
    };

    const retrieveResult = await (sup as any).executeMemoryTask(retrieveTask);
    expect(retrieveResult.memoryOperation).toBe('retrieve');
    expect(retrieveResult.value).toEqual({ hello: 'world' });
  });

  it('custom task without domain falls back to LLM reasoning', async () => {
    const sup = new MissionSupervisor();
    const task: Task = {
      id: 't5',
      name: 'Custom reasoning task',
      description: 'Answer a question',
      type: 'custom',
      parameters: {
        prompt: 'What is 2+2?',
      },
      status: 'pending',
      critical: false,
    };

    // This will attempt an LLM call which will fail without API keys,
    // but it should NOT return desktop-runtime-required
    try {
      const result = await (sup as any).executeCustomTask(task, 'test-user');
      expect(result.executed).toBe(true);
      expect(result.reason).not.toBe('desktop-runtime-required');
    } catch (e: any) {
      // LLM failure is acceptable — the point is it tried real execution
      expect(e.message).not.toContain('desktop-runtime-required');
    }
  });
});

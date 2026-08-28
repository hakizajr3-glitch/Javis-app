import { describe, it, expect } from 'vitest';
import { EnvironmentRuntime } from './environmentRuntime.js';

describe('EnvironmentRuntime', () => {
  it('terminal execution returns a browser-mode placeholder when not in Tauri', async () => {
    const er = new EnvironmentRuntime();
    const result = await er.executeTerminal('echo hello', 'u1');
    expect(result.success).toBe(true);
    expect(result.domain).toBe('terminal');
    // In browser mode (no Tauri runtime), terminal execution returns a
    // placeholder indicating the command that would have been run.
    expect(result.output.output).toMatch(/browser-mode|Would execute|placeholder/);
  });

  it('mouseClick delegates to desktopAutomation', async () => {
    const er = new EnvironmentRuntime();
    const result = await er.mouseClick(100, 200, 'left', 'u1');
    expect(result.domain).toBe('desktop');
    // The existing desktopAutomation returns fake success.
    expect(result.success).toBe(true);
  });

  it('keyboardType delegates to desktopAutomation', async () => {
    const er = new EnvironmentRuntime();
    const result = await er.keyboardType('hello', 'u1');
    expect(result.domain).toBe('desktop');
    expect(result.success).toBe(true);
  });

  it('navigate delegates to browserControl', async () => {
    const er = new EnvironmentRuntime();
    const result = await er.navigate('https://example.com', 'u1');
    expect(result.domain).toBe('browser');
    expect(result.success).toBe(true);
  });

  it('click delegates to browserControl', async () => {
    const er = new EnvironmentRuntime();
    const result = await er.click('#button', 'u1');
    expect(result.domain).toBe('browser');
    expect(result.success).toBe(true);
  });

  it('type delegates to browserControl', async () => {
    const er = new EnvironmentRuntime();
    const result = await er.type('#input', 'text', 'u1');
    expect(result.domain).toBe('browser');
    expect(result.success).toBe(true);
  });

  it('screenshot delegates to browserControl', async () => {
    const er = new EnvironmentRuntime();
    const result = await er.screenshot('u1');
    expect(result.domain).toBe('browser');
    expect(result.success).toBe(true);
  });

  it('lists desktop and browser actions', async () => {
    const er = new EnvironmentRuntime();
    await er.mouseClick(1, 2, 'left', 'u1');
    const desktop = await er.listDesktopActions();
    expect(Array.isArray(desktop)).toBe(true);
    expect(desktop.length).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from 'vitest';
import { AgentRuntime } from './agentRuntime.js';

describe('AgentRuntime', () => {
  it('listBlueprints returns an array', () => {
    const ar = new AgentRuntime();
    expect(Array.isArray(ar.listBlueprints())).toBe(true);
  });

  it('getState returns undefined for unknown agent', () => {
    const ar = new AgentRuntime();
    expect(ar.getState('nope')).toBeUndefined();
  });

  it('listAgents returns an array', () => {
    const ar = new AgentRuntime();
    expect(Array.isArray(ar.listAgents())).toBe(true);
  });

  it('getBlueprint returns undefined for unknown id', () => {
    const ar = new AgentRuntime();
    expect(ar.getBlueprint('nope')).toBeUndefined();
  });

  it('getBlueprintsByRole returns an array', () => {
    const ar = new AgentRuntime();
    expect(Array.isArray(ar.getBlueprintsByRole('custom'))).toBe(true);
  });
});

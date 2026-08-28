import { describe, it, expect } from 'vitest';
import { ReasoningEngine } from './reasoningEngine.js';

describe('ReasoningEngine — routing', () => {
  const re = new ReasoningEngine();

  it('routes by explicit preference', () => {
    const r = re.routeRequest([], { provider: 'openai', model: 'gpt-4o' });
    expect(r.provider).toBe('openai');
    expect(r.model).toBe('gpt-4o');
    expect(r.reason).toMatch(/explicit/);
  });

  it('routes by provider only, picking first model', () => {
    const r = re.routeRequest([], { provider: 'anthropic' });
    expect(r.provider).toBe('anthropic');
    expect(r.model).toBeTruthy();
  });

  it('routes by capability need', () => {
    const r = re.routeRequest(['coding']);
    expect(r.provider).toBe('anthropic');
    expect(r.reason).toMatch(/coding/);
  });

  it('routes vision to openai', () => {
    const r = re.routeRequest(['vision']);
    expect(r.provider).toBe('openai');
  });

  it('routes fast to google', () => {
    const r = re.routeRequest(['fast']);
    expect(r.provider).toBe('google');
  });

  it('defaults to a reasoning model', () => {
    const r = re.routeRequest();
    expect(r.provider).toBe('anthropic');
    expect(r.reason).toMatch(/default/);
  });
});

describe('ReasoningEngine — getModelsForProvider', () => {
  it('returns models for a known provider', () => {
    const re = new ReasoningEngine();
    const models = re.getModelsForProvider('openai');
    expect(models.length).toBeGreaterThan(0);
  });

  it('returns empty for unknown provider', () => {
    const re = new ReasoningEngine();
    expect(re.getModelsForProvider('nonexistent' as any)).toEqual([]);
  });
});

describe('ReasoningEngine — performance metrics', () => {
  it('returns a metrics object', () => {
    const re = new ReasoningEngine();
    const m = re.getPerformanceMetrics();
    expect(typeof m).toBe('object');
  });
});

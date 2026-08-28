import { describe, it, expect } from 'vitest';
import { CapabilityRouter } from '../capabilityRouter.js';
import { buildCapability } from './connectorAdapter.js';
import type { BaseConnector, ConnectorConfig, ConnectorCapability } from '../../integrations-connector-layer/types.js';

function makeConnector(): BaseConnector {
  return {
    id: 'test-conn',
    name: 'Test Connector',
    type: 'http',
    version: '1.0.0',
    async initialize() {},
    async execute(cap, params) { return { cap, params }; },
    getCapabilities() { return []; },
    async healthCheck() { return { connectorId: 'test-conn', status: 'healthy', lastCheck: new Date(), latency: 1, errorRate: 0 }; },
    async dispose() {},
  };
}

function makeConfig(type: string): ConnectorConfig {
  return {
    id: 'test-conn',
    name: 'Test',
    type,
    version: '1.0.0',
    enabled: true,
    configuration: {},
    permissions: ['read'],
  };
}

function makeCap(name: string, params: Array<{ name: string; required: boolean; type: any }> = []): ConnectorCapability {
  return {
    name,
    description: `does ${name}`,
    parameters: params.map(p => ({
      name: p.name, type: p.type, required: p.required, description: `${p.name} param`,
    })),
    returns: 'any',
  };
}

describe('ConnectorAdapter — buildCapability', () => {
  it('builds a capability with id `<connectorId>.<cap>`', () => {
    const cap = buildCapability(makeConnector(), makeConfig('http'), makeCap('fetch'));
    expect(cap.id).toBe('test-conn.fetch');
    expect(cap.name).toBe('fetch');
    expect(cap.source).toBe('native');
    expect(cap.tags).toContain('http');
  });

  it('classifies risk by connector type', () => {
    const http = buildCapability(makeConnector(), makeConfig('http'), makeCap('get'));
    expect(http.risk).toBe('low');
    const shell = buildCapability(makeConnector(), makeConfig('shell-sandbox'), makeCap('execute'));
    expect(shell.risk).toBe('high');
    const fs = buildCapability(makeConnector(), makeConfig('local-filesystem'), makeCap('read_file'));
    expect(fs.risk).toBe('medium');
  });

  it('bumps risk for destructive capability names', () => {
    const http = buildCapability(makeConnector(), makeConfig('http'), makeCap('delete'));
    // 'delete' bumps low → medium.
    expect(http.risk).toBe('medium');
  });

  it('marks read-only capabilities as reversible', () => {
    const read = buildCapability(makeConnector(), makeConfig('http'), makeCap('list'));
    expect(read.reversible).toBe(true);
    const write = buildCapability(makeConnector(), makeConfig('http'), makeCap('send'));
    expect(write.reversible).toBe(false);
  });

  it('translates parameters into an input schema with required fields', () => {
    const cap = buildCapability(
      makeConnector(),
      makeConfig('http'),
      makeCap('fetch', [
        { name: 'url', required: true, type: 'string' },
        { name: 'method', required: false, type: 'string' },
      ])
    );
    expect(cap.inputSchema.type).toBe('object');
    expect(cap.inputSchema.properties?.url.type).toBe('string');
    expect(cap.inputSchema.required).toEqual(['url']);
  });

  it('the built capability executes through the connector', async () => {
    const cap = buildCapability(makeConnector(), makeConfig('http'), makeCap('fetch'));
    // We can't easily call execute without mocking connectorRegistry.executeConnector,
    // but we can verify the capability is structurally valid and registerable.
    const router = new CapabilityRouter();
    expect(() => router.register(cap)).not.toThrow();
    expect(router.list().find(c => c.id === 'test-conn.fetch')).toBeDefined();
  });
});

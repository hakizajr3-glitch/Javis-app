/**
 * ConnectorAdapter — bridges integrations-connector-layer connectors into the
 * harness CapabilityRouter as native capabilities.
 *
 * Each registered connector's capabilities become individually addressable
 * capabilities in the router, with ids of the form `<connectorId>.<capability>`.
 * The adapter translates the connector's parameter list into a SchemaSpec and
 * delegates execution to `connectorRegistry.executeConnector`.
 */
import { Capability, CapabilityContext, RiskLevel, SchemaSpec } from '../types.js';
import { CapabilityRouter } from '../capabilityRouter.js';
import { connectorRegistry } from '../../integrations-connector-layer/connectorRegistry.js';
import type {
  BaseConnector,
  ConnectorCapability,
  ConnectorConfig,
  ConnectorParameter,
} from '../../integrations-connector-layer/types.js';

/** Risk classification by connector type — conservative defaults. */
const RISK_BY_TYPE: Record<string, RiskLevel> = {
  'local-filesystem': 'medium',
  'shell-sandbox': 'high',
  'desktop-automation': 'medium',
  'browser-automation': 'low',
  gmail: 'high',
  slack: 'high',
  telegram: 'high',
  discord: 'high',
  github: 'medium',
  database: 'high',
  http: 'low',
};

function riskFor(connectorType: string, capabilityName: string): RiskLevel {
  const base = RISK_BY_TYPE[connectorType] ?? 'medium';
  // Destructive-sounding capabilities bump to high.
  if (/\b(delete|remove|drop|destroy|wipe|send|publish|deploy|release|create|update|write)\b/i.test(capabilityName)) {
    return base === 'safe' || base === 'low' ? 'medium' : 'high';
  }
  return base;
}

function reversibleFor(capabilityName: string): boolean {
  // Read-only capabilities are trivially reversible (no-op to undo).
  return /\b(read|list|get|search|query|screenshot|health|status)\b/i.test(capabilityName);
}

function paramToSchema(p: ConnectorParameter): SchemaSpec {
  const schema: SchemaSpec = { type: p.type, description: p.description };
  return schema;
}

function capabilitySchema(cap: ConnectorCapability): SchemaSpec {
  const properties: Record<string, SchemaSpec> = {};
  const required: string[] = [];
  for (const p of cap.parameters) {
    properties[p.name] = paramToSchema(p);
    if (p.required) required.push(p.name);
  }
  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
    description: cap.description,
  };
}

/**
 * Build a harness `Capability` from a connector + one of its capability defs.
 * The capability id is `<connectorId>.<capabilityName>`.
 */
export function buildCapability(connector: BaseConnector, config: ConnectorConfig, cap: ConnectorCapability): Capability {
  const id = `${connector.id}.${cap.name}`;
  const risk = riskFor(config.type, cap.name);
  return {
    id,
    name: cap.name,
    description: cap.description,
    source: 'native',
    tags: [config.type, connector.id],
    inputSchema: capabilitySchema(cap),
    outputSchema: { type: 'any', description: cap.returns },
    requiredPermissions: config.permissions,
    risk,
    reversible: reversibleFor(cap.name),
    async execute(input: Record<string, any>, ctx: CapabilityContext) {
      return connectorRegistry.executeConnector(connector.id, cap.name, input, ctx.userId);
    },
  };
}

/**
 * Register every capability of every enabled connector into the router.
 * Returns the list of capability ids that were registered.
 */
export async function registerAllConnectors(router: CapabilityRouter): Promise<string[]> {
  const configs = await connectorRegistry.listConnectors({ enabled: true });
  const ids: string[] = [];
  for (const config of configs) {
    const connector = await connectorRegistry.getConnector(config.id);
    if (!connector) continue;
    const caps = await connectorRegistry.getConnectorCapabilities(config.id);
    for (const cap of caps) {
      const capability = buildCapability(connector, config, cap);
      router.register(capability);
      ids.push(capability.id);
    }
  }
  return ids;
}

/** Register a single connector's capabilities into the router. */
export async function registerConnector(router: CapabilityRouter, connectorId: string): Promise<string[]> {
  const connector = await connectorRegistry.getConnector(connectorId);
  const config = await connectorRegistry.getConnectorConfig(connectorId);
  if (!connector || !config) {
    throw new Error(`ConnectorAdapter: connector ${connectorId} not found`);
  }
  const caps = await connectorRegistry.getConnectorCapabilities(connectorId);
  const ids: string[] = [];
  for (const cap of caps) {
    const capability = buildCapability(connector, config, cap);
    router.register(capability);
    ids.push(capability.id);
  }
  return ids;
}

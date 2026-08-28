export type ConnectorId = string;

export interface ConnectorConfig {
  id: ConnectorId;
  name: string;
  type: string;
  version: string;
  enabled: boolean;
  configuration: Record<string, any>;
  credentials?: Record<string, any>;
  permissions: string[];
}

export interface ConnectorCapability {
  name: string;
  description: string;
  parameters: ConnectorParameter[];
  returns: string;
}

export interface ConnectorParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  default?: any;
  description: string;
}

export interface ConnectorExecution {
  connectorId: ConnectorId;
  capability: string;
  parameters: Record<string, any>;
  timestamp: Date;
  result?: any;
  error?: Error;
  duration: number;
  userId: string;
}

export interface ConnectorHealth {
  connectorId: ConnectorId;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  latency: number;
  errorRate: number;
}

export interface BaseConnector {
  id: ConnectorId;
  name: string;
  type: string;
  version: string;
  initialize(config: Record<string, any>): Promise<void>;
  execute(capability: string, parameters: Record<string, any>): Promise<any>;
  getCapabilities(): ConnectorCapability[];
  healthCheck(): Promise<ConnectorHealth>;
  dispose(): Promise<void>;
}

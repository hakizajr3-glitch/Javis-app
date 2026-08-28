import { v4 as uuidv4 } from 'uuid';
import {
  ConnectorId,
  ConnectorConfig,
  ConnectorCapability,
  ConnectorExecution,
  ConnectorHealth,
  BaseConnector,
} from './types.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { securityLayer } from '../security/securityLayer.js';
import { identityPermissions } from '../identity-permissions/identityPermissions.js';
import { taskLogger } from '../self-improving-skills/taskLogger.js';

export class ConnectorRegistry {
  private connectors: Map<ConnectorId, BaseConnector> = new Map();
  private configs: Map<ConnectorId, ConnectorConfig> = new Map();
  private executionHistory: Map<string, ConnectorExecution> = new Map();

  async registerConnector(connector: BaseConnector, config: ConnectorConfig): Promise<void> {
    await connector.initialize(config.configuration);
    
    this.connectors.set(config.id, connector);
    this.configs.set(config.id, config);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { action: 'connector_registered', connectorId: config.id, connectorType: config.type },
      timestamp: new Date(),
      source: 'ConnectorRegistry',
    });
  }

  async unregisterConnector(connectorId: ConnectorId): Promise<void> {
    const connector = this.connectors.get(connectorId);
    if (connector) {
      await connector.dispose();
      this.connectors.delete(connectorId);
      this.configs.delete(connectorId);
    }
  }

  async executeConnector(
    connectorId: ConnectorId,
    capability: string,
    parameters: Record<string, any>,
    userId: string
  ): Promise<any> {
    const connector = this.connectors.get(connectorId);
    const config = this.configs.get(connectorId);

    if (!connector || !config) {
      throw new Error(`Connector not found: ${connectorId}`);
    }

    if (!config.enabled) {
      throw new Error(`Connector is disabled: ${connectorId}`);
    }

    // Check permissions
    const hasPermission = await identityPermissions.checkPermission(userId, config.type, capability);
    if (!hasPermission) {
      throw new Error(`Permission denied for capability: ${capability}`);
    }

    const startTime = Date.now();
    const executionId = uuidv4();

    try {
      const result = await connector.execute(capability, parameters);
      const duration = Date.now() - startTime;

      const execution: ConnectorExecution = {
        connectorId,
        capability,
        parameters,
        timestamp: new Date(),
        result,
        duration,
        userId,
      };

      this.executionHistory.set(executionId, execution);

      // Log the task
      await taskLogger.logTask({
        description: `Connector execution: ${config.name} - ${capability}`,
        context: { connectorId, capability },
        parameters,
        result,
        success: true,
        duration,
        userId,
        tags: ['connector', config.type, capability],
      });

      await eventBus.publish({
        id: uuidv4(),
        type: EventType.TASK_COMPLETED,
        payload: { executionId, connectorId, capability, success: true },
        timestamp: new Date(),
        source: 'ConnectorRegistry',
        correlationId: userId,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      const execution: ConnectorExecution = {
        connectorId,
        capability,
        parameters,
        timestamp: new Date(),
        error: error as Error,
        duration,
        userId,
      };

      this.executionHistory.set(executionId, execution);

      // Log the failed task
      await taskLogger.logTask({
        description: `Connector execution failed: ${config.name} - ${capability}`,
        context: { connectorId, capability },
        parameters,
        result: { error: (error as Error).message },
        success: false,
        duration,
        userId,
        tags: ['connector', config.type, capability, 'failed'],
      });

      await eventBus.publish({
        id: uuidv4(),
        type: EventType.TASK_FAILED,
        payload: { executionId, connectorId, capability, error: (error as Error).message },
        timestamp: new Date(),
        source: 'ConnectorRegistry',
        correlationId: userId,
      });

      throw error;
    }
  }

  async getConnector(connectorId: ConnectorId): Promise<BaseConnector | null> {
    return this.connectors.get(connectorId) || null;
  }

  async getConnectorConfig(connectorId: ConnectorId): Promise<ConnectorConfig | null> {
    return this.configs.get(connectorId) || null;
  }

  async listConnectors(filters?: { type?: string; enabled?: boolean }): Promise<ConnectorConfig[]> {
    let configs = Array.from(this.configs.values());

    if (filters) {
      if (filters.type) {
        configs = configs.filter(c => c.type === filters.type);
      }
      if (filters.enabled !== undefined) {
        configs = configs.filter(c => c.enabled === filters.enabled);
      }
    }

    return configs;
  }

  async getConnectorCapabilities(connectorId: ConnectorId): Promise<ConnectorCapability[]> {
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      throw new Error(`Connector not found: ${connectorId}`);
    }

    return connector.getCapabilities();
  }

  async healthCheck(connectorId: ConnectorId): Promise<ConnectorHealth> {
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      throw new Error(`Connector not found: ${connectorId}`);
    }

    return await connector.healthCheck();
  }

  async healthCheckAll(): Promise<Map<ConnectorId, ConnectorHealth>> {
    const results = new Map<ConnectorId, ConnectorHealth>();

    for (const [connectorId, connector] of this.connectors.entries()) {
      try {
        const health = await connector.healthCheck();
        results.set(connectorId, health);
      } catch (error) {
        results.set(connectorId, {
          connectorId,
          status: 'unhealthy',
          lastCheck: new Date(),
          latency: 0,
          errorRate: 1.0,
        });
      }
    }

    return results;
  }

  async enableConnector(connectorId: ConnectorId): Promise<void> {
    const config = this.configs.get(connectorId);
    if (!config) {
      throw new Error(`Connector not found: ${connectorId}`);
    }

    config.enabled = true;
    this.configs.set(connectorId, config);
  }

  async disableConnector(connectorId: ConnectorId): Promise<void> {
    const config = this.configs.get(connectorId);
    if (!config) {
      throw new Error(`Connector not found: ${connectorId}`);
    }

    config.enabled = false;
    this.configs.set(connectorId, config);
  }

  async updateConnectorConfig(connectorId: ConnectorId, updates: Partial<ConnectorConfig>): Promise<void> {
    const config = this.configs.get(connectorId);
    if (!config) {
      throw new Error(`Connector not found: ${connectorId}`);
    }

    const updatedConfig: ConnectorConfig = {
      ...config,
      ...updates,
    };

    this.configs.set(connectorId, updatedConfig);

    // Reinitialize connector if configuration changed
    if (updates.configuration) {
      const connector = this.connectors.get(connectorId);
      if (connector) {
        await connector.initialize(updatedConfig.configuration);
      }
    }
  }

  async getExecutionHistory(connectorId?: ConnectorId, limit: number = 100): Promise<ConnectorExecution[]> {
    let executions = Array.from(this.executionHistory.values());

    if (connectorId) {
      executions = executions.filter(e => e.connectorId === connectorId);
    }

    return executions
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  getStats() {
    return {
      totalConnectors: this.connectors.size,
      enabledConnectors: Array.from(this.configs.values()).filter(c => c.enabled).length,
      totalExecutions: this.executionHistory.size,
    };
  }
}

// Singleton instance
export const connectorRegistry = new ConnectorRegistry();

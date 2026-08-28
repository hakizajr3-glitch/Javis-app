import {
  BaseConnector,
  ConnectorCapability,
  ConnectorHealth,
  ConnectorId,
} from '../types.js';
import { processSandbox } from '../../security/sandbox.js';

export class ShellSandboxConnector implements BaseConnector {
  id: ConnectorId;
  name: string;
  type: string;
  version: string;
  private defaultPolicy = 'default';

  constructor() {
    this.id = 'shell-sandbox' as ConnectorId;
    this.name = 'Shell Sandbox';
    this.type = 'shell-sandbox';
    this.version = '1.0.0';
  }

  async initialize(config: Record<string, any>): Promise<void> {
    if (config.defaultPolicy) {
      this.defaultPolicy = config.defaultPolicy;
    }
    if (config.policies) {
      for (const [name, policy] of Object.entries(config.policies)) {
        processSandbox.registerPolicy(name, policy as any);
      }
    }
  }

  async execute(capability: string, parameters: Record<string, any>): Promise<any> {
    switch (capability) {
      case 'execute': {
        const command = parameters.command as string;
        const args = parameters.args as string[];
        const policy = parameters.policy as string || this.defaultPolicy;

        if (args && args.length > 0) {
          return processSandbox.execute(command, policy, args);
        }
        return processSandbox.executeShell(command, policy);
      }
      case 'execute_script': {
        const script = parameters.script as string;
        const policy = parameters.policy as string || this.defaultPolicy;
        return processSandbox.executeShell(script, policy);
      }
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  }

  getCapabilities(): ConnectorCapability[] {
    return [
      {
        name: 'execute',
        description: 'Execute a shell command or program with sandbox restrictions',
        parameters: [
          { name: 'command', type: 'string', required: true, description: 'Command or script to run' },
          { name: 'args', type: 'array', required: false, description: 'Command arguments' },
          { name: 'policy', type: 'string', required: false, description: 'Sandbox policy name' },
        ],
        returns: 'object',
      },
      {
        name: 'execute_script',
        description: 'Execute a shell script string with sandbox restrictions',
        parameters: [
          { name: 'script', type: 'string', required: true, description: 'Shell script content' },
          { name: 'policy', type: 'string', required: false, description: 'Sandbox policy name' },
        ],
        returns: 'object',
      },
    ];
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const start = Date.now();
    try {
      const result = await processSandbox.executeShell('echo healthy', 'read-only');
      const healthy = result.stdout.trim() === 'healthy' && result.exitCode === 0;
      return {
        connectorId: this.id,
        status: healthy ? 'healthy' : 'degraded',
        lastCheck: new Date(),
        latency: Date.now() - start,
        errorRate: healthy ? 0 : 1,
      };
    } catch {
      return {
        connectorId: this.id,
        status: 'unhealthy',
        lastCheck: new Date(),
        latency: Date.now() - start,
        errorRate: 1,
      };
    }
  }

  async dispose(): Promise<void> {}
}

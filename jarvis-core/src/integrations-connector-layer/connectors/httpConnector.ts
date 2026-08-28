import { v4 as uuidv4 } from 'uuid';
import {
  ConnectorId,
  BaseConnector,
  ConnectorCapability,
  ConnectorParameter,
  ConnectorHealth,
} from '../types.js';

export class HttpConnector implements BaseConnector {
  id: ConnectorId;
  name: string;
  type: string;
  version: string;
  private baseUrl: string = '';
  private headers: Record<string, string> = {};

  constructor() {
    this.id = uuidv4() as ConnectorId;
    this.name = 'HTTP Connector';
    this.type = 'http';
    this.version = '1.0.0';
  }

  async initialize(config: Record<string, any>): Promise<void> {
    this.baseUrl = config.baseUrl || '';
    this.headers = config.headers || {};
  }

  async execute(capability: string, parameters: Record<string, any>): Promise<any> {
    switch (capability) {
      case 'get':
        return this.get(parameters.path, parameters.query);
      case 'post':
        return this.post(parameters.path, parameters.body);
      case 'put':
        return this.put(parameters.path, parameters.body);
      case 'delete':
        return this.delete(parameters.path);
      case 'patch':
        return this.patch(parameters.path, parameters.body);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  }

  getCapabilities(): ConnectorCapability[] {
    return [
      {
        name: 'get',
        description: 'HTTP GET request',
        parameters: [
          {
            name: 'path',
            type: 'string',
            required: true,
            description: 'Request path',
          },
          {
            name: 'query',
            type: 'object',
            required: false,
            description: 'Query parameters',
          },
        ],
        returns: 'object',
      },
      {
        name: 'post',
        description: 'HTTP POST request',
        parameters: [
          {
            name: 'path',
            type: 'string',
            required: true,
            description: 'Request path',
          },
          {
            name: 'body',
            type: 'object',
            required: true,
            description: 'Request body',
          },
        ],
        returns: 'object',
      },
      {
        name: 'put',
        description: 'HTTP PUT request',
        parameters: [
          {
            name: 'path',
            type: 'string',
            required: true,
            description: 'Request path',
          },
          {
            name: 'body',
            type: 'object',
            required: true,
            description: 'Request body',
          },
        ],
        returns: 'object',
      },
      {
        name: 'delete',
        description: 'HTTP DELETE request',
        parameters: [
          {
            name: 'path',
            type: 'string',
            required: true,
            description: 'Request path',
          },
        ],
        returns: 'object',
      },
      {
        name: 'patch',
        description: 'HTTP PATCH request',
        parameters: [
          {
            name: 'path',
            type: 'string',
            required: true,
            description: 'Request path',
          },
          {
            name: 'body',
            type: 'object',
            required: true,
            description: 'Request body',
          },
        ],
        returns: 'object',
      },
    ];
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const startTime = Date.now();
    try {
      // Simple health check - try to connect to base URL
      if (this.baseUrl) {
        const response = await fetch(this.baseUrl, {
          method: 'HEAD',
          headers: this.headers,
        });
        if (!response.ok) {
          throw new Error(`Health check failed: ${response.status}`);
        }
      }
      const latency = Date.now() - startTime;
      return {
        connectorId: this.id,
        status: 'healthy',
        lastCheck: new Date(),
        latency,
        errorRate: 0,
      };
    } catch (error) {
      return {
        connectorId: this.id,
        status: 'unhealthy',
        lastCheck: new Date(),
        latency: Date.now() - startTime,
        errorRate: 1,
      };
    }
  }

  async dispose(): Promise<void> {
    // No cleanup needed for HTTP connector
  }

  private buildUrl(path: string, query?: Record<string, any>): string {
    let url = `${this.baseUrl}${path}`;
    
    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        params.append(key, String(value));
      }
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    return url;
  }

  private async get(path: string, query?: Record<string, any>): Promise<any> {
    const url = this.buildUrl(path, query);
    const response = await fetch(url, {
      method: 'GET',
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`GET request failed: ${response.status}`);
    }

    return await response.json();
  }

  private async post(path: string, body: any): Promise<any> {
    const url = this.buildUrl(path);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`POST request failed: ${response.status}`);
    }

    return await response.json();
  }

  private async put(path: string, body: any): Promise<any> {
    const url = this.buildUrl(path);
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`PUT request failed: ${response.status}`);
    }

    return await response.json();
  }

  private async delete(path: string): Promise<any> {
    const url = this.buildUrl(path);
    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`DELETE request failed: ${response.status}`);
    }

    return await response.json();
  }

  private async patch(path: string, body: any): Promise<any> {
    const url = this.buildUrl(path);
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`PATCH request failed: ${response.status}`);
    }

    return await response.json();
  }
}

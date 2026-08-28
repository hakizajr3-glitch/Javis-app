import {
  BaseConnector,
  ConnectorCapability,
  ConnectorHealth,
  ConnectorId,
} from '../types.js';

export class SlackConnector implements BaseConnector {
  id: ConnectorId;
  name: string;
  type: string;
  version: string;
  private token?: string;
  private baseUrl = 'https://slack.com/api';

  constructor() {
    this.id = 'slack' as ConnectorId;
    this.name = 'Slack';
    this.type = 'slack';
    this.version = '1.0.0';
  }

  async initialize(config: Record<string, any>): Promise<void> {
    this.token = config.token || config.botToken;
  }

  async execute(capability: string, parameters: Record<string, any>): Promise<any> {
    switch (capability) {
      case 'send_message':
        return this.sendMessage(parameters.channel, parameters.message, parameters.thread_ts);
      case 'list_channels':
        return this.listChannels(parameters.limit, parameters.types);
      case 'get_channel_history':
        return this.getChannelHistory(parameters.channel, parameters.limit);
      case 'get_user_info':
        return this.getUserInfo(parameters.user);
      case 'post_reaction':
        return this.postReaction(parameters.channel, parameters.timestamp, parameters.emoji);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  }

  getCapabilities(): ConnectorCapability[] {
    return [
      {
        name: 'send_message',
        description: 'Send a Slack message',
        parameters: [
          { name: 'channel', type: 'string', required: true, description: 'Channel ID or name' },
          { name: 'message', type: 'string', required: true, description: 'Message text' },
          { name: 'thread_ts', type: 'string', required: false, description: 'Thread timestamp' },
        ],
        returns: 'object',
      },
      {
        name: 'list_channels',
        description: 'List Slack channels',
        parameters: [
          { name: 'limit', type: 'number', required: false, description: 'Max channels' },
          { name: 'types', type: 'string', required: false, description: 'public_channel, private_channel, mpim, im' },
        ],
        returns: 'array',
      },
      {
        name: 'get_channel_history',
        description: 'Get channel message history',
        parameters: [
          { name: 'channel', type: 'string', required: true, description: 'Channel ID' },
          { name: 'limit', type: 'number', required: false, description: 'Max messages' },
        ],
        returns: 'array',
      },
      {
        name: 'get_user_info',
        description: 'Get user info',
        parameters: [
          { name: 'user', type: 'string', required: true, description: 'User ID' },
        ],
        returns: 'object',
      },
      {
        name: 'post_reaction',
        description: 'Post a reaction emoji',
        parameters: [
          { name: 'channel', type: 'string', required: true, description: 'Channel ID' },
          { name: 'timestamp', type: 'string', required: true, description: 'Message timestamp' },
          { name: 'emoji', type: 'string', required: true, description: 'Emoji name without colons' },
        ],
        returns: 'object',
      },
    ];
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const start = Date.now();
    try {
      const result = await this.post('/auth.test', {});
      return {
        connectorId: this.id,
        status: result.ok ? 'healthy' : 'unhealthy',
        lastCheck: new Date(),
        latency: Date.now() - start,
        errorRate: result.ok ? 0 : 1,
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

  private async post(method: string, body: Record<string, any>): Promise<any> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Slack API error ${response.status}: ${await response.text()}`);
    }
    const data = (await response.json()) as { ok: boolean; error?: string };
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error || 'unknown'}`);
    }
    return data;
  }

  private sendMessage(channel: string, text: string, thread_ts?: string): Promise<any> {
    const body: Record<string, any> = { channel, text };
    if (thread_ts) body.thread_ts = thread_ts;
    return this.post('chat.postMessage', body);
  }

  private listChannels(limit = 100, types = 'public_channel,private_channel'): Promise<any> {
    return this.post('conversations.list', { limit, types });
  }

  private getChannelHistory(channel: string, limit = 50): Promise<any> {
    return this.post('conversations.history', { channel, limit });
  }

  private getUserInfo(user: string): Promise<any> {
    return this.post('users.info', { user });
  }

  private postReaction(channel: string, timestamp: string, emoji: string): Promise<any> {
    return this.post('reactions.add', { channel, timestamp, name: emoji });
  }
}

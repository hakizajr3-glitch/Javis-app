import {
  BaseConnector,
  ConnectorCapability,
  ConnectorHealth,
  ConnectorId,
} from '../types.js';

export class DiscordConnector implements BaseConnector {
  id: ConnectorId;
  name: string;
  type: string;
  version: string;
  private botToken?: string;
  private baseUrl = 'https://discord.com/api/v10';

  constructor() {
    this.id = 'discord' as ConnectorId;
    this.name = 'Discord';
    this.type = 'discord';
    this.version = '1.0.0';
  }

  async initialize(config: Record<string, any>): Promise<void> {
    this.botToken = config.botToken;
  }

  async execute(capability: string, parameters: Record<string, any>): Promise<any> {
    switch (capability) {
      case 'send_message':
        return this.sendMessage(parameters.channel_id, parameters.content);
      case 'list_guild_channels':
        return this.listGuildChannels(parameters.guild_id);
      case 'get_channel_messages':
        return this.getChannelMessages(parameters.channel_id, parameters.limit);
      case 'create_thread':
        return this.createThread(parameters.channel_id, parameters.name, parameters.message_id);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  }

  getCapabilities(): ConnectorCapability[] {
    return [
      {
        name: 'send_message',
        description: 'Send a Discord channel message',
        parameters: [
          { name: 'channel_id', type: 'string', required: true, description: 'Channel ID' },
          { name: 'content', type: 'string', required: true, description: 'Message content' },
        ],
        returns: 'object',
      },
      {
        name: 'list_guild_channels',
        description: 'List channels in a Discord server',
        parameters: [
          { name: 'guild_id', type: 'string', required: true, description: 'Server/guild ID' },
        ],
        returns: 'array',
      },
      {
        name: 'get_channel_messages',
        description: 'Get messages from a channel',
        parameters: [
          { name: 'channel_id', type: 'string', required: true, description: 'Channel ID' },
          { name: 'limit', type: 'number', required: false, description: 'Max messages' },
        ],
        returns: 'array',
      },
      {
        name: 'create_thread',
        description: 'Create a thread from a message',
        parameters: [
          { name: 'channel_id', type: 'string', required: true, description: 'Channel ID' },
          { name: 'name', type: 'string', required: true, description: 'Thread name' },
          { name: 'message_id', type: 'string', required: true, description: 'Message ID' },
        ],
        returns: 'object',
      },
    ];
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const start = Date.now();
    try {
      await this.request('/users/@me');
      return {
        connectorId: this.id,
        status: 'healthy',
        lastCheck: new Date(),
        latency: Date.now() - start,
        errorRate: 0,
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

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };
    if (this.botToken) {
      headers.Authorization = `Bot ${this.botToken}`;
    }
    const response = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
    if (!response.ok) {
      throw new Error(`Discord API error ${response.status}: ${await response.text()}`);
    }
    return response.status === 204 ? undefined : await response.json();
  }

  private sendMessage(channel_id: string, content: string): Promise<any> {
    return this.request(`/channels/${channel_id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  private listGuildChannels(guild_id: string): Promise<any> {
    return this.request(`/guilds/${guild_id}/channels`);
  }

  private getChannelMessages(channel_id: string, limit = 50): Promise<any> {
    return this.request(`/channels/${channel_id}/messages?limit=${limit}`);
  }

  private createThread(channel_id: string, name: string, message_id: string): Promise<any> {
    return this.request(`/channels/${channel_id}/messages/${message_id}/threads`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }
}

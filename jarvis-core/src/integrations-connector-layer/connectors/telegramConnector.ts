import {
  BaseConnector,
  ConnectorCapability,
  ConnectorHealth,
  ConnectorId,
} from '../types.js';

export class TelegramConnector implements BaseConnector {
  id: ConnectorId;
  name: string;
  type: string;
  version: string;
  private botToken?: string;
  private baseUrl = 'https://api.telegram.org';

  constructor() {
    this.id = 'telegram' as ConnectorId;
    this.name = 'Telegram';
    this.type = 'telegram';
    this.version = '1.0.0';
  }

  async initialize(config: Record<string, any>): Promise<void> {
    this.botToken = config.botToken;
  }

  async execute(capability: string, parameters: Record<string, any>): Promise<any> {
    switch (capability) {
      case 'send_message':
        return this.sendMessage(parameters.chat_id, parameters.text, parameters.parse_mode);
      case 'get_updates':
        return this.getUpdates(parameters.offset, parameters.limit);
      case 'get_chat':
        return this.getChat(parameters.chat_id);
      case 'send_photo':
        return this.sendPhoto(parameters.chat_id, parameters.photo, parameters.caption);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  }

  getCapabilities(): ConnectorCapability[] {
    return [
      {
        name: 'send_message',
        description: 'Send a Telegram message',
        parameters: [
          { name: 'chat_id', type: 'string', required: true, description: 'Chat ID' },
          { name: 'text', type: 'string', required: true, description: 'Message text' },
          { name: 'parse_mode', type: 'string', required: false, description: 'Markdown or HTML' },
        ],
        returns: 'object',
      },
      {
        name: 'get_updates',
        description: 'Get bot updates',
        parameters: [
          { name: 'offset', type: 'number', required: false, description: 'Update offset' },
          { name: 'limit', type: 'number', required: false, description: 'Max updates' },
        ],
        returns: 'array',
      },
      {
        name: 'get_chat',
        description: 'Get chat info',
        parameters: [
          { name: 'chat_id', type: 'string', required: true, description: 'Chat ID' },
        ],
        returns: 'object',
      },
      {
        name: 'send_photo',
        description: 'Send a photo',
        parameters: [
          { name: 'chat_id', type: 'string', required: true, description: 'Chat ID' },
          { name: 'photo', type: 'string', required: true, description: 'Photo URL or file_id' },
          { name: 'caption', type: 'string', required: false, description: 'Caption' },
        ],
        returns: 'object',
      },
    ];
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const start = Date.now();
    try {
      await this.request('getMe');
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

  private async request(method: string, params?: Record<string, any>): Promise<any> {
    if (!this.botToken) {
      throw new Error('Telegram bot token not configured');
    }
    const url = new URL(`${this.baseUrl}/bot${this.botToken}/${method}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Telegram API error ${response.status}: ${await response.text()}`);
    }
    const data = (await response.json()) as { ok: boolean; result?: any; description?: string };
    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description || 'unknown'}`);
    }
    return data.result;
  }

  private sendMessage(chat_id: string, text: string, parse_mode?: string): Promise<any> {
    return this.request('sendMessage', { chat_id, text, parse_mode });
  }

  private getUpdates(offset?: number, limit = 10): Promise<any> {
    return this.request('getUpdates', { offset, limit });
  }

  private getChat(chat_id: string): Promise<any> {
    return this.request('getChat', { chat_id });
  }

  private sendPhoto(chat_id: string, photo: string, caption?: string): Promise<any> {
    return this.request('sendPhoto', { chat_id, photo, caption });
  }
}

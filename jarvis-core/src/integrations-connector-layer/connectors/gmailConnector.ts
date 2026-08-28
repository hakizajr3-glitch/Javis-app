import {
  BaseConnector,
  ConnectorCapability,
  ConnectorHealth,
  ConnectorId,
} from '../types.js';

export class GmailConnector implements BaseConnector {
  id: ConnectorId;
  name: string;
  type: string;
  version: string;
  private accessToken?: string;
  private baseUrl = 'https://gmail.googleapis.com/gmail/v1';

  constructor() {
    this.id = 'gmail' as ConnectorId;
    this.name = 'Gmail';
    this.type = 'gmail';
    this.version = '1.0.0';
  }

  async initialize(config: Record<string, any>): Promise<void> {
    this.accessToken = config.accessToken;
  }

  async execute(capability: string, parameters: Record<string, any>): Promise<any> {
    switch (capability) {
      case 'list_messages':
        return this.listMessages(parameters.maxResults, parameters.query);
      case 'get_message':
        return this.getMessage(parameters.id, parameters.format);
      case 'send_message':
        return this.sendMessage(parameters.to, parameters.subject, parameters.body, parameters.html);
      case 'search_messages':
        return this.searchMessages(parameters.query, parameters.maxResults);
      case 'get_labels':
        return this.getLabels();
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  }

  getCapabilities(): ConnectorCapability[] {
    return [
      {
        name: 'list_messages',
        description: 'List recent Gmail messages',
        parameters: [
          { name: 'maxResults', type: 'number', required: false, description: 'Max messages' },
          { name: 'query', type: 'string', required: false, description: 'Gmail search query' },
        ],
        returns: 'array',
      },
      {
        name: 'get_message',
        description: 'Get a Gmail message by ID',
        parameters: [
          { name: 'id', type: 'string', required: true, description: 'Message ID' },
          { name: 'format', type: 'string', required: false, description: 'full, minimal, raw' },
        ],
        returns: 'object',
      },
      {
        name: 'send_message',
        description: 'Send an email',
        parameters: [
          { name: 'to', type: 'string', required: true, description: 'Recipient' },
          { name: 'subject', type: 'string', required: true, description: 'Subject' },
          { name: 'body', type: 'string', required: true, description: 'Body text' },
          { name: 'html', type: 'string', required: false, description: 'HTML body' },
        ],
        returns: 'object',
      },
      {
        name: 'search_messages',
        description: 'Search Gmail messages',
        parameters: [
          { name: 'query', type: 'string', required: true, description: 'Gmail search query' },
          { name: 'maxResults', type: 'number', required: false, description: 'Max results' },
        ],
        returns: 'array',
      },
      {
        name: 'get_labels',
        description: 'List Gmail labels',
        parameters: [],
        returns: 'array',
      },
    ];
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const start = Date.now();
    try {
      await this.request('/users/me/profile');
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
      ...(options.headers as Record<string, string> || {}),
    };
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }
    const response = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
    if (!response.ok) {
      throw new Error(`Gmail API error ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }

  private listMessages(maxResults = 10, query?: string): Promise<any> {
    let url = `/users/me/messages?maxResults=${maxResults}`;
    if (query) url += `&q=${encodeURIComponent(query)}`;
    return this.request(url);
  }

  private getMessage(id: string, format = 'full'): Promise<any> {
    return this.request(`/users/me/messages/${id}?format=${format}`);
  }

  private searchMessages(query: string, maxResults = 10): Promise<any> {
    return this.listMessages(maxResults, query);
  }

  private getLabels(): Promise<any> {
    return this.request('/users/me/labels');
  }

  private async sendMessage(to: string, subject: string, body: string, html?: string): Promise<any> {
    const emailBody = html || body;
    const email = [
      'Content-Type: text/plain; charset="UTF-8"\n',
      'MIME-Version: 1.0\n',
      'Content-Transfer-Encoding: 7bit\n',
      `to: ${to}\n`,
      `subject: ${subject}\n\n`,
      emailBody,
    ].join('');
    const encoded = typeof Buffer !== 'undefined'
      ? Buffer.from(email).toString('base64url')
      : btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    return this.request('/users/me/messages/send', {
      method: 'POST',
      body: JSON.stringify({ raw: encoded }),
    });
  }
}

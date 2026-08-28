import { EventEmitter } from 'events';

export interface NIMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
}

interface NIMRawResponse {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
    };
  }>;
}

const SYSTEM_PROMPT = `You are J.A.R.V.I.S., a real-time AI voice assistant.

BEHAVIOR:
- Be concise and direct in responses
- Keep responses short (1-3 sentences) for optimal voice output
- Respond naturally and conversationally
- You have access to tools to help the user

AVAILABLE TOOLS:
- get_weather: Get current weather for a location
- schedule_meeting: Schedule a meeting at a specific time
- search_web: Search the web for information

INSTRUCTIONS:
- Use tools when needed to answer user questions
- Return spoken responses (not tool JSON)
- If using a tool, first indicate you're using it
- After tool results, provide the answer naturally`;

const TOOLS: Tool[] = [
  {
    name: 'get_weather',
    description: 'Get the current weather for a specific location',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name or location' },
      },
      required: ['location'],
    },
  },
  {
    name: 'schedule_meeting',
    description: 'Schedule a meeting in the calendar',
    parameters: {
      type: 'object',
      properties: {
        time: { type: 'string', description: 'Meeting time in ISO format' },
        title: { type: 'string', description: 'Meeting title' },
        duration: { type: 'number', description: 'Meeting duration in minutes' },
      },
      required: ['time', 'title'],
    },
  },
  {
    name: 'search_web',
    description: 'Search the web for information',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
];

export class NIMService extends EventEmitter {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;
  private isProcessing: boolean = false;

  constructor(config: NIMConfig) {
    super();
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 1024;
  }

  async chat(messages: Message[], sessionId: string): Promise<LLMResponse> {
    this.isProcessing = true;

    const allMessages: Message[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

    try {
      const response = await this.makeRequest(allMessages);
      return response;
    } catch (error) {
      console.error(`[NIM] Error for session ${sessionId}:`, error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  private async makeRequest(messages: Message[]): Promise<LLMResponse> {
    const url = `${this.baseUrl}/v1/chat/completions`;

    const payload = {
      model: this.model,
      messages,
      tools: TOOLS.map((tool) => ({
        type: 'function',
        function: tool,
      })),
      tool_choice: 'auto',
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream: false,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`NIM API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as NIMRawResponse;
    const message = data.choices?.[0]?.message;

    if (!message) {
      throw new Error('No response from NIM');
    }

    const result: LLMResponse = {
      content: message.content || '',
    };

    if (message.tool_calls && message.tool_calls.length > 0) {
      result.toolCalls = message.tool_calls.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));
    }

    return result;
  }

  async executeTool(name: string, args: string): Promise<string> {
    console.log(`[NIM] Executing tool: ${name}`);

    switch (name) {
      case 'get_weather': {
        const { location } = JSON.parse(args);
        return JSON.stringify({ location, temperature: '72°F', condition: 'Sunny', humidity: '45%' });
      }
      case 'schedule_meeting': {
        const { time, title, duration = 30 } = JSON.parse(args);
        return JSON.stringify({ success: true, meeting: { time, title, duration } });
      }
      case 'search_web': {
        const { query } = JSON.parse(args);
        return JSON.stringify({ query, results: [`Result 1 for ${query}`, `Result 2 for ${query}`] });
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  isReady(): boolean {
    return !this.isProcessing;
  }
}

let instance: NIMService | null = null;

export function initNIMService(config: NIMConfig): NIMService {
  instance = new NIMService(config);
  return instance;
}

export function getNIMService(): NIMService | null {
  return instance;
}
export type Provider = 'openai' | 'anthropic' | 'google' | 'local';

export interface LLMProvider {
  name: Provider;
  apiKey?: string;
  endpoint?: string;
  models: string[];
  costPerToken: number;
  capabilities: string[];
}

export interface LLMRequest {
  prompt: string;
  model?: string;
  provider?: Provider;
  maxTokens?: number;
  temperature?: number;
  context?: Record<string, any>;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: Provider;
  tokensUsed: number;
  cost: number;
  latency: number;
  timestamp: Date;
}

export interface CostEstimate {
  estimatedTokens: number;
  estimatedCost: number;
  provider: Provider;
  model: string;
}

export interface RoutingDecision {
  provider: Provider;
  model: string;
  reason: string;
  confidence: number;
}

import { v4 as uuidv4 } from 'uuid';
import {
  Provider,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  CostEstimate,
  RoutingDecision,
} from './types.js';
import { eventBus, EventType } from '../observability/eventBus.js';

/**
 * Read an environment variable safely in both Node and browser contexts.
 * In the browser (Vite bundle), process.env is undefined; keys are instead
 * supplied at runtime through setProviderApiKey().
 */
function getEnv(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

export class LLMOrchestrator {
  private providers: Map<Provider, LLMProvider> = new Map();
  private requestHistory: Map<string, LLMResponse> = new Map();
  private performanceMetrics: Map<string, { success: number; total: number; avgLatency: number }> = new Map();

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // OpenAI
    this.providers.set('openai', {
      name: 'openai',
      apiKey: getEnv('OPENAI_API_KEY'),
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
      costPerToken: 0.00003, // approximate
      capabilities: ['chat', 'code', 'vision'],
    });

    // Anthropic
    this.providers.set('anthropic', {
      name: 'anthropic',
      apiKey: getEnv('ANTHROPIC_API_KEY'),
      models: ['claude-sonnet-4-5', 'claude-3-7-sonnet', 'claude-3-5-haiku'],
      costPerToken: 0.000015,
      capabilities: ['chat', 'code', 'analysis'],
    });

    // Google
    this.providers.set('google', {
      name: 'google',
      apiKey: getEnv('GOOGLE_API_KEY') || getEnv('GEMINI_API_KEY'),
      models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
      costPerToken: 0.000001,
      capabilities: ['chat', 'code', 'vision', 'multimodal'],
    });

    // Local (Ollama)
    this.providers.set('local', {
      name: 'local',
      endpoint: getEnv('OLLAMA_ENDPOINT') || 'http://localhost:11434',
      models: ['llama3.2', 'mistral', 'codellama'],
      costPerToken: 0,
      capabilities: ['chat', 'code'],
    });
  }

  /**
   * Inject a provider API key at runtime (e.g. from the app's settings).
   * Returns true if the provider is known.
   */
  setProviderApiKey(provider: Provider, apiKey: string): boolean {
    const p = this.providers.get(provider);
    if (!p) return false;
    p.apiKey = apiKey || undefined;
    this.providers.set(provider, p);
    return true;
  }

  /** Get the currently-configured key for a provider (may be undefined). */
  getProviderApiKey(provider: Provider): string | undefined {
    return this.providers.get(provider)?.apiKey;
  }

  async routeRequest(request: LLMRequest): Promise<RoutingDecision> {
    // If provider is specified, use it
    if (request.provider) {
      const provider = this.providers.get(request.provider);
      if (!provider) {
        throw new Error(`Provider not found: ${request.provider}`);
      }

      return {
        provider: request.provider,
        model: request.model || provider.models[0],
        reason: 'User specified provider',
        confidence: 1.0,
      };
    }

    // Auto-select based on task type and performance
    const decision = this.selectBestProvider(request);

    return decision;
  }

  async executeRequest(request: LLMRequest): Promise<LLMResponse> {
    const routingDecision = await this.routeRequest(request);
    const provider = this.providers.get(routingDecision.provider);

    if (!provider) {
      throw new Error(`Provider not found: ${routingDecision.provider}`);
    }

    const startTime = Date.now();

    try {
      // Execute the request against the real provider API
      const response = await this.callProvider(provider, routingDecision.model, request);

      const latency = Date.now() - startTime;

      const llmResponse: LLMResponse = {
        content: response.content,
        model: routingDecision.model,
        provider: routingDecision.provider,
        tokensUsed: response.tokensUsed,
        cost: response.tokensUsed * provider.costPerToken,
        latency,
        timestamp: new Date(),
      };

      // Store in history
      this.requestHistory.set(uuidv4(), llmResponse);

      // Update performance metrics
      this.updateMetrics(routingDecision.provider, true, latency);

      // Emit event
      await eventBus.publish({
        id: uuidv4(),
        type: EventType.TASK_COMPLETED,
        payload: { llmResponse },
        timestamp: new Date(),
        source: 'LLMOrchestrator',
      });

      return llmResponse;
    } catch (error) {
      // Update performance metrics
      this.updateMetrics(routingDecision.provider, false, Date.now() - startTime);

      // Try fallback
      return this.executeWithFallback(request, routingDecision);
    }
  }

  async estimateCost(request: LLMRequest): Promise<CostEstimate> {
    const routingDecision = await this.routeRequest(request);
    const provider = this.providers.get(routingDecision.provider);

    if (!provider) {
      throw new Error(`Provider not found: ${routingDecision.provider}`);
    }

    // Estimate tokens based on prompt length (rough approximation)
    const estimatedTokens = Math.ceil(request.prompt.length / 4);

    return {
      estimatedTokens,
      estimatedCost: estimatedTokens * provider.costPerToken,
      provider: routingDecision.provider,
      model: routingDecision.model,
    };
  }

  private selectBestProvider(request: LLMRequest): RoutingDecision {
    // Simple routing logic based on task type
    const taskType = this.detectTaskType(request.prompt);

    switch (taskType) {
      case 'code':
        return {
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
          reason: 'Best for code generation',
          confidence: 0.9,
        };
      case 'vision':
        return {
          provider: 'google',
          model: 'gemini-2.5-flash',
          reason: 'Best for vision tasks',
          confidence: 0.85,
        };
      case 'analysis':
        return {
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
          reason: 'Best for deep analysis',
          confidence: 0.88,
        };
      default:
        // Default to OpenAI for general chat
        return {
          provider: 'openai',
          model: 'gpt-4o-mini',
          reason: 'Default provider for general tasks',
          confidence: 0.8,
        };
    }
  }

  private detectTaskType(prompt: string): string {
    const lowerPrompt = prompt.toLowerCase();

    if (lowerPrompt.includes('code') || lowerPrompt.includes('function') || lowerPrompt.includes('programming')) {
      return 'code';
    }
    if (lowerPrompt.includes('image') || lowerPrompt.includes('vision') || lowerPrompt.includes('see')) {
      return 'vision';
    }
    if (lowerPrompt.includes('analyze') || lowerPrompt.includes('evaluate') || lowerPrompt.includes('assess')) {
      return 'analysis';
    }

    return 'chat';
  }

  private async callProvider(provider: LLMProvider, model: string, request: LLMRequest): Promise<{ content: string; tokensUsed: number }> {
    const apiKey = provider.apiKey;
    const maxTokens = request.maxTokens ?? 2048;
    const temperature = request.temperature ?? 0.7;

    switch (provider.name) {
      case 'openai': {
        if (!apiKey) throw new Error('OpenAI API key not configured');
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: request.prompt }],
            max_tokens: maxTokens,
            temperature,
          }),
        });
        if (!res.ok) throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
        const openaiData: any = await res.json();
        return {
          content: openaiData?.choices?.[0]?.message?.content ?? '',
          tokensUsed: openaiData?.usage?.total_tokens ?? Math.ceil(request.prompt.length / 4),
        };
      }

      case 'anthropic': {
        if (!apiKey) throw new Error('Anthropic API key not configured');
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            temperature,
            messages: [{ role: 'user', content: request.prompt }],
          }),
        });
        if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
        const anthropicData: any = await res.json();
        const usage: any = anthropicData?.usage ?? {};
        return {
          content: anthropicData?.content?.[0]?.text ?? '',
          tokensUsed: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
        };
      }

      case 'google': {
        if (!apiKey) throw new Error('Google API key not configured');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: request.prompt }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature },
          }),
        });
        if (!res.ok) throw new Error(`Google API error: ${res.status} ${await res.text()}`);
        const googleData: any = await res.json();
        return {
          content: googleData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
          tokensUsed: googleData?.usageMetadata?.totalTokenCount ?? Math.ceil(request.prompt.length / 4),
        };
      }

      case 'local': {
        const endpoint = provider.endpoint || 'http://localhost:11434';
        const res = await fetch(`${endpoint}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: request.prompt }],
            stream: false,
            options: { num_predict: maxTokens, temperature },
          }),
        });
        if (!res.ok) throw new Error(`Ollama API error: ${res.status} ${await res.text()}`);
        const localData: any = await res.json();
        return {
          content: localData?.message?.content ?? '',
          tokensUsed: localData?.eval_count ?? Math.ceil(request.prompt.length / 4),
        };
      }

      default:
        throw new Error(`Unsupported provider: ${provider.name}`);
    }
  }

  private async executeWithFallback(request: LLMRequest, failedDecision: RoutingDecision): Promise<LLMResponse> {
    // Try next best provider
    const providers = Array.from(this.providers.keys()).filter(p => p !== failedDecision.provider);

    for (const providerName of providers) {
      try {
        const provider = this.providers.get(providerName);
        if (!provider) continue;

        const response = await this.callProvider(provider, provider.models[0], request);
        const latency = 0; // Not tracking for fallback

        return {
          content: response.content,
          model: provider.models[0],
          provider: providerName,
          tokensUsed: response.tokensUsed,
          cost: response.tokensUsed * provider.costPerToken,
          latency,
          timestamp: new Date(),
        };
      } catch (error) {
        console.error(`Fallback to ${providerName} failed:`, error);
        continue;
      }
    }

    throw new Error('All providers failed');
  }

  private updateMetrics(provider: Provider, success: boolean, latency: number): void {
    const key = provider.toString();
    const current = this.performanceMetrics.get(key) || { success: 0, total: 0, avgLatency: 0 };

    current.total++;
    if (success) {
      current.success++;
      current.avgLatency = (current.avgLatency * (current.success - 1) + latency) / current.success;
    }

    this.performanceMetrics.set(key, current);
  }

  getPerformanceMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};

    for (const [provider, data] of this.performanceMetrics.entries()) {
      metrics[provider] = {
        successRate: data.total > 0 ? data.success / data.total : 0,
        avgLatency: data.avgLatency,
        totalRequests: data.total,
      };
    }

    return metrics;
  }
}

// Singleton instance
export const llmOrchestrator = new LLMOrchestrator();

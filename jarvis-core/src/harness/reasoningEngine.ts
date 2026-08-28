/**
 * JARVIS Elite Agentic Harness — Pillar 3: Reasoning Engine.
 *
 * Wraps the existing llm-orchestrator + vision-reasoning-engine behind the
 * harness's typed ReasoningRequest/Response interface. This is the model
 * fabric: routes requests to the right provider based on task needs.
 *
 * Design principles (NOOA):
 *  - Model-agnostic: routes to OpenAI, Anthropic, Google, Ollama, future.
 *  - Quality/speed/cost tradeoffs per task.
 *  - VRE (Vision Reasoning Engine): central fusion layer for multimodal.
 */
import { v4 as uuidv4 } from 'uuid';
import { llmOrchestrator } from '../llm-orchestrator/llmOrchestrator.js';
import { imageUnderstanding } from '../vision-reasoning-engine/imageUnderstanding.js';
import { feedbackLoop } from '../vision-reasoning-engine/feedbackLoop.js';
import type { LLMRequest, LLMResponse, Provider } from '../llm-orchestrator/types.js';
import {
  ModelCapabilityNeed,
  ModelPreference,
  ReasoningRequest,
  ReasoningResponse,
} from './types.js';
import { eventBus, EventType } from '../observability/eventBus.js';

/** Map a capability need to a preferred provider + model. */
const NEED_ROUTING: Record<ModelCapabilityNeed, { provider: Provider; model: string }> = {
  reasoning: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  coding: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  vision: { provider: 'openai', model: 'gpt-4o' },
  fast: { provider: 'google', model: 'gemini-2.5-flash' },
  cheap: { provider: 'google', model: 'gemini-2.5-flash' },
  'long-context': { provider: 'google', model: 'gemini-2.5-pro' },
  research: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
};

export class ReasoningEngine {
  /**
   * Reason — the primary entry point. Takes a prompt + optional system prompt
   * + capability needs, routes to the best model, and returns the response.
   */
  async reason(request: ReasoningRequest): Promise<ReasoningResponse> {
    const routing = this.routeRequest(request.needs, request.preference);
    const llmReq: LLMRequest = {
      prompt: request.prompt,
      provider: routing.provider,
      model: routing.model,
      maxTokens: request.preference?.maxTokens,
      temperature: request.preference?.temperature,
      context: request.systemPrompt ? { systemPrompt: request.systemPrompt } : undefined,
    };

    const start = Date.now();
    const res = await llmOrchestrator.executeRequest(llmReq);
    const durationMs = Date.now() - start;

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: {
        kind: 'reasoning',
        provider: res.provider,
        model: res.model,
        tokensUsed: res.tokensUsed,
        durationMs,
      },
      timestamp: new Date(),
      source: 'ReasoningEngine',
      correlationId: request.traceId,
    });

    return {
      text: res.content,
      provider: res.provider,
      model: res.model,
      durationMs,
      tokensUsed: res.tokensUsed,
    };
  }

  /** Plan — generate a structured plan from a prompt. */
  async plan(prompt: string, userId: string, context?: Record<string, any>): Promise<ReasoningResponse> {
    return this.reason({
      prompt: `Create a detailed step-by-step plan for: ${prompt}\n\nContext: ${JSON.stringify(context ?? {})}`,
      systemPrompt: 'You are a master planner. Break down objectives into concrete, actionable steps.',
      needs: ['reasoning'],
      userId,
      traceId: uuidv4(),
    });
  }

  /** Route a request to the best provider + model based on needs. */
  routeRequest(
    needs?: ModelCapabilityNeed[],
    preference?: ModelPreference
  ): { provider: Provider; model: string; reason: string } {
    // Explicit preference wins.
    if (preference?.provider && preference?.model) {
      return {
        provider: preference.provider as Provider,
        model: preference.model,
        reason: 'explicit user preference',
      };
    }
    if (preference?.provider) {
      // Provider specified but not model — pick the first model for that provider.
      const models = this.getModelsForProvider(preference.provider as Provider);
      return {
        provider: preference.provider as Provider,
        model: models[0] ?? 'gpt-4o-mini',
        reason: 'user-specified provider, default model',
      };
    }
    // Route by the first declared need.
    if (needs && needs.length > 0) {
      const routing = NEED_ROUTING[needs[0]];
      if (routing) {
        return { ...routing, reason: `routed by need: ${needs[0]}` };
      }
    }
    // Default: balanced reasoning model.
    return { provider: 'anthropic', model: 'claude-sonnet-4-5', reason: 'default reasoning model' };
  }

  /** Understand an image — delegates to the vision-reasoning-engine. */
  async understandImage(captureId: string, context?: Record<string, any>): Promise<any> {
    return imageUnderstanding.analyzeCapture(captureId, context);
  }

  /** Run the vision feedback loop — captures screen, analyzes, reports. */
  async visionFeedbackLoop(captureId: string, context?: Record<string, any>): Promise<any> {
    return feedbackLoop.provideFeedback(captureId, context);
  }

  /** Estimate the cost of a request. */
  async estimateCost(request: ReasoningRequest): Promise<{ estimatedTokens: number; estimatedCost: number; provider: string; model: string }> {
    const routing = this.routeRequest(request.needs, request.preference);
    const estimate = await llmOrchestrator.estimateCost({
      prompt: request.prompt,
      provider: routing.provider,
      model: routing.model,
    });
    return {
      estimatedTokens: estimate.estimatedTokens,
      estimatedCost: estimate.estimatedCost,
      provider: estimate.provider,
      model: estimate.model,
    };
  }

  /** Get available models for a provider. */
  getModelsForProvider(provider: Provider): string[] {
    const providers = (llmOrchestrator as any).providers as Map<Provider, { models: string[] }>;
    return providers?.get(provider)?.models ?? [];
  }

  /** Set an API key for a provider (runtime override). */
  setProviderApiKey(provider: Provider, apiKey: string): boolean {
    return llmOrchestrator.setProviderApiKey(provider, apiKey);
  }

  /** Get performance metrics for all providers. */
  getPerformanceMetrics(): Record<string, any> {
    return llmOrchestrator.getPerformanceMetrics();
  }
}

/** Singleton instance. */
export const reasoningEngine = new ReasoningEngine();

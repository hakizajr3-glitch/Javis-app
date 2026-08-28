/**
 * LLMAdapter — bridges llm-orchestrator into the harness as the reasoning
 * engine. The orchestrator's `reasonFn` expects (prompt, ctx) → string;
 * this adapter wraps `llmOrchestrator.executeRequest` to produce that.
 */
import { CapabilityContext, ModelPreference, ReasoningRequest, ReasoningResponse } from '../types.js';
import { llmOrchestrator } from '../../llm-orchestrator/llmOrchestrator.js';
import type { LLMRequest } from '../../llm-orchestrator/types.js';

/**
 * Returns a `reasonFn` suitable for `Orchestrator({ reasonFn })`.
 * Each call maps to one `llmOrchestrator.executeRequest` invocation.
 */
export function makeReasonFn(defaultModel?: string) {
  return async (prompt: string, _ctx: CapabilityContext): Promise<string> => {
    const req: LLMRequest = { prompt, model: defaultModel };
    const res = await llmOrchestrator.executeRequest(req);
    return res.content;
  };
}

/**
 * Full reasoning-engine surface: takes a ReasoningRequest (with model
 * preferences, needs, system prompt) and returns a ReasoningResponse with
 * provider/model/timing metadata.
 */
export async function reason(request: ReasoningRequest): Promise<ReasoningResponse> {
  const llmReq: LLMRequest = {
    prompt: request.prompt,
    provider: request.preference?.provider as any,
    model: request.preference?.model,
    maxTokens: request.preference?.maxTokens,
    temperature: request.preference?.temperature,
    context: { systemPrompt: request.systemPrompt, needs: request.needs },
  };
  const start = Date.now();
  const res = await llmOrchestrator.executeRequest(llmReq);
  return {
    text: res.content,
    provider: res.provider,
    model: res.model,
    durationMs: Date.now() - start,
    tokensUsed: res.tokensUsed,
  };
}

/** Map a harness ModelPreference to the llm-orchestrator's routing input. */
export function preferenceToRequest(pref?: ModelPreference): Partial<LLMRequest> {
  if (!pref) return {};
  return {
    provider: pref.provider as any,
    model: pref.model,
    temperature: pref.temperature,
    maxTokens: pref.maxTokens,
  };
}

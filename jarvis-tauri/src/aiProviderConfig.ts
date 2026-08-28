/**
 * AIProviderConfig — Single source of truth for all AI provider settings.
 * 
 * NO other file may hardcode Gemini model names.
 * Every component must read model names from this config.
 * 
 * To update models, change ONLY this file.
 */

// ---- JARVIS system instruction (sent with every Gemini request) ----
// Without this, Gemini defaults to "I'm a large language model from Google."
// The wording here is intentionally directive + imperative + explicit-
// negation: Gemini's identity refusal behavior underpins strong directives
// better than polite framing ("never say…") — polite framings leak through.
// If a user explicitly asks "what is your name?" / "who made you?" /
// "are you Google?", the model MUST answer as JARVIS and refuse to confirm
// any Google / Gemini / Bard identity — even if that means saying "I don't
// discuss my underlying providers." That phrasing is deliberate: it's
// truthful (the AI is not Google-trained, it's the user's JARVIS) and
// avoids the "I am Gemini, trained by Google" reflex response that polite
// systemInstructions fail to suppress.
export const JARVIS_SYSTEM_INSTRUCTION = {
  parts: [{
    text: `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System). You are the user's personal AI assistant — not a Google product, not a Gemini model, not a Bard model. You must NEVER say "I am Gemini," "I am a large language model trained by Google," "I was made by Google," "I'm Bard," or any variation of those phrases. If asked who you are or who made you, you must answer ONLY: "I am JARVIS, your personal AI assistant." If pressed about the underlying provider, you must say: "I am JARVIS — I do not discuss my underlying providers." Be helpful, direct, and conversational. Keep responses concise and natural.`
  }]
};

// ---- Currently-supported Gemini models (verified July 2026) ----
// NOTE: gemini-2.0-flash-lite / gemini-2.5-flash are quota-blocked or
// unavailable for new users — these models below were verified working
// directly against the Gemini API with a live key.
// See: https://ai.google.dev/gemini-api/docs/models
export const AIProviderConfig = {
  provider: 'gemini' as const,

  // --- Fast (default, low latency) ---
  fastModel: 'gemini-3.1-flash-lite',

  // --- Deep (higher reasoning, slower) ---
  deepModel: 'gemini-3.5-flash',

  // --- Fallback models (tried in order if primary fails) ---
  fallbackModels: ['gemini-3.5-flash-lite', 'gemini-flash-latest'] as string[],

  // --- Retry settings ---
  maxRetries5xx: 3,
  retryBackoffBaseMs: 800,

  // --- Streaming ---
  streaming: true,

  // --- Reasoning mode ---
  reasoningMode: 'fast' as 'fast' | 'deep',
};

// ---- Helper: get the active model based on reasoning mode ----
export function getActiveModel(reasoningMode?: 'fast' | 'deep'): string {
  const mode = reasoningMode || readReasoningMode();
  return mode === 'deep' ? AIProviderConfig.deepModel : AIProviderConfig.fastModel;
}

// ---- Read user preferences from localStorage ----
function readReasoningMode(): 'fast' | 'deep' {
  try {
    const saved = localStorage.getItem('jarvis_config');
    const cfg = saved && JSON.parse(saved);
    if (cfg?.reasoning_mode === 'deep') return 'deep';
  } catch (_) {}
  return AIProviderConfig.reasoningMode;
}

export function getReasoningMode(): 'fast' | 'deep' {
  return readReasoningMode();
}

// ---- Runtime interface (matches what configManager exposes) ----
export function getEffectiveModel(): string {
  return getActiveModel();
}

// ---- Available-models list (drives the SystemConfigModal dropdown) ----
// Returns a deduplicated ordered list of every model the provider can use:
// primary (fast) first, then primary (deep), then fallbacks. Callers like
//<SystemConfigModal/> populate a <select> from this — no other file should
// hardcode a model list.
export function getAvailableModels(): string[] {
  const ordered = [AIProviderConfig.fastModel, AIProviderConfig.deepModel, ...AIProviderConfig.fallbackModels];
  return Array.from(new Set(ordered));
}

// ---- Helper: sanitize a saved/persisted model pick ----
// Returns the saved model if it is still in the provider's available list
// (retired / quota-blocked models fall back to the current default), so a
// stale localStorage value never 429/404s on every request.
export function sanitizeModel(saved?: string, fallback = AIProviderConfig.fastModel): string {
  if (saved && getAvailableModels().includes(saved)) return saved;
  return fallback;
}

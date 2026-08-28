/**
 * JARVIS AI Service — Centralized multi-provider AI integration.
 *
 * Every AI request, whether from voice or text UI, MUST pass through
 * this singleton. It handles: provider routing, API key validation,
 * model fallback, quota detection, streaming, cancellation, and
 * user-friendly diagnostics.
 *
 * Supports: Gemini, OpenAI, Anthropic, OpenRouter, Groq, Mistral,
 * DeepSeek, Together, Fireworks, Ollama (local), xAI, Perplexity.
 */

import { AIProviderConfig, getActiveModel, sanitizeModel } from './aiProviderConfig';
import { getAdapter, ProviderMessage } from './providers/providerAdapters';
import { loadProviderConfig } from './providers/providerConfig';
import { PROVIDERS, ProviderId } from './providers/providerRegistry';

// ---- Re-export from centralized config ----
const MAX_RETRIES_5XX = AIProviderConfig.maxRetries5xx;
const RETRY_BACKOFF_BASE_MS = AIProviderConfig.retryBackoffBaseMs;

// ---- Types ----
export interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  /** Optional inline image (base64-encoded JPEG, without data URI prefix). */
  imageBase64?: string;
  /** Optional MIME type for the inline image (default: 'image/jpeg'). */
  imageMimeType?: string;
}

export type GeminiStatus =
  | 'unknown'
  | 'checking'
  | 'ok'
  | 'missing_key'
  | 'invalid_key'
  | 'model_unavailable'
  | 'quota_exhausted'
  | 'billing_required'
  | 'network_error';

export interface DiagnosticsReport {
  config: boolean;
  apiKey: boolean;
  geminiConnectivity: GeminiStatus;
  modelAvailability: Record<string, GeminiStatus>;
  quota: GeminiStatus;
  microphone: 'unknown' | 'granted' | 'denied' | 'error';
  speaker: boolean;
  stt: boolean;
  tts: boolean;
  conversationManager: boolean;
  timestamp: number;
}

// ---- Helpers ----
function readApiKey(): string {
  // Read from the unified provider config
  const config = loadProviderConfig();
  if (config.apiKey) return config.apiKey;
  // Fallback: old gemini-only format
  try {
    const saved = localStorage.getItem('jarvis_config');
    const fromCfg = saved && JSON.parse(saved).gemini_api_key;
    if (fromCfg && String(fromCfg).trim()) return String(fromCfg).trim();
  } catch (_) {}
  try {
    const standalone = localStorage.getItem('gemini_api_key');
    if (standalone && String(standalone).trim()) return String(standalone).trim();
  } catch (_) {}
  return '';
}

function readModel(): string {
  // Read from the unified provider config
  const config = loadProviderConfig();
  if (config.model) {
    // Honor reasoning mode from old config if set
    try {
      const saved = localStorage.getItem('jarvis_config');
      const oldCfg = saved && JSON.parse(saved);
      if (oldCfg?.reasoning_mode === 'deep' && config.deepModel) {
        return config.deepModel;
      }
    } catch (_) {}
    return config.model;
  }
  // Fallback: old gemini-only format
  try {
    const saved = localStorage.getItem('jarvis_config');
    const fromCfg = saved && JSON.parse(saved);
    if (fromCfg?.model_fast) {
      const fallback = fromCfg?.reasoning_mode === 'deep'
        ? AIProviderConfig.deepModel
        : AIProviderConfig.fastModel;
      return sanitizeModel(fromCfg.model_fast, fallback);
    }
    if (fromCfg?.reasoning_mode === 'deep') return AIProviderConfig.deepModel;
  } catch (_) {}
  return getActiveModel();
}

function readProvider(): ProviderId {
  return loadProviderConfig().provider;
}

function readBaseUrl(): string {
  const config = loadProviderConfig();
  return PROVIDERS[config.provider]?.baseUrl || '';
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ---- AIService ----
class AIService {
  private static instance: AIService;
  private apiKey = '';
  private primaryModel = AIProviderConfig.fastModel;
  private currentModel = AIProviderConfig.fastModel;
  private provider: ProviderId = 'gemini';
  private baseUrl = '';
  private abortController: AbortController | null = null;

  static getInstance(): AIService {
    if (!AIService.instance) AIService.instance = new AIService();
    return AIService.instance;
  }

  refreshCredentials(): void {
    this.apiKey = readApiKey();
    this.primaryModel = readModel();
    this.currentModel = this.primaryModel;
    this.provider = readProvider();
    this.baseUrl = readBaseUrl();
  }

  getApiKey(): string {
    return this.apiKey || readApiKey();
  }

  getModel(): string {
    return this.currentModel;
  }

  getProvider(): ProviderId {
    return this.provider;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  // ---- Provider Validation (multi-provider) ----

  /**
   * Test connectivity with the active provider.
   * Returns the status — does NOT throw.
   */
  async testConnectivity(): Promise<GeminiStatus> {
    this.refreshCredentials();
    const key = this.getApiKey();
    // Ollama doesn't need a key
    if (!key && this.provider !== 'ollama') return 'missing_key';

    try {
      const adapter = getAdapter(this.provider);
      const ok = await adapter.testConnectivity({
        apiKey: key,
        model: this.primaryModel,
        baseUrl: this.baseUrl,
      });
      return ok ? 'ok' : 'network_error';
    } catch (e: any) {
      if (e?.code === 'invalid_key') return 'invalid_key';
      if (e?.code === 'model_unavailable') return 'model_unavailable';
      if (e?.code === 'quota_exhausted') return 'quota_exhausted';
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'network_error';
      return 'network_error';
    }
  }

  /**
   * Check if a specific model is available on the active provider.
   */
  async testModel(modelName: string): Promise<GeminiStatus> {
    const key = this.getApiKey();
    if (!key && this.provider !== 'ollama') return 'missing_key';

    try {
      const adapter = getAdapter(this.provider);
      const ok = await adapter.testConnectivity({
        apiKey: key,
        model: modelName,
        baseUrl: this.baseUrl,
      });
      return ok ? 'ok' : 'network_error';
    } catch (e: any) {
      if (e?.code === 'model_unavailable') return 'model_unavailable';
      if (e?.code === 'invalid_key') return 'invalid_key';
      if (e?.code === 'quota_exhausted') return 'quota_exhausted';
      return 'network_error';
    }
  }

  // ---- Diagnostics ----

  async runDiagnostics(): Promise<DiagnosticsReport> {
    const report: DiagnosticsReport = {
      config: false,
      apiKey: false,
      geminiConnectivity: 'unknown',
      modelAvailability: {},
      quota: 'unknown',
      microphone: 'unknown',
      speaker: false,
      stt: false,
      tts: false,
      conversationManager: true,
      timestamp: Date.now(),
    };

    // 1. Configuration
    this.refreshCredentials();
    report.config = true;

    // 2. API Key
    report.apiKey = !!this.getApiKey();

    // 3. Gemini Connectivity
    if (report.apiKey) {
      report.geminiConnectivity = await this.testConnectivity();
    } else {
      report.geminiConnectivity = 'missing_key';
    }

    // 4. Model Availability (primary + fallbacks)
    const allModels = [
      this.primaryModel,
      ...AIProviderConfig.fallbackModels.filter(m => m !== this.primaryModel),
    ];
    for (const model of allModels) {
      report.modelAvailability[model] = report.apiKey
        ? await this.testModel(model)
        : 'missing_key';
    }

    // 5. Quota (derived from connectivity test)
    report.quota = report.geminiConnectivity === 'quota_exhausted' ? 'quota_exhausted' : 'ok';

    // 6. Microphone
    try {
      if (navigator?.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        report.microphone = 'granted';
      } else {
        report.microphone = 'error';
      }
    } catch (e: any) {
      report.microphone = e?.name === 'NotAllowedError' ? 'denied' : 'error';
    }

    // 7. Speaker
    report.speaker = typeof window !== 'undefined' && 'speechSynthesis' in window;

    // 8. STT
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    report.stt = !!SpeechRecognition;

    // 9. TTS
    report.tts = report.speaker; // Same as speaker for now

    return report;
  }

  // ---- Message Sending ----

  /**
   * Send messages through the active AI provider with model fallback and
   * quota-aware retry. This is the single entry point that ALL UI code must use.
   */
  async sendMessage(
    messages: ChatMessage[],
    options?: { signal?: AbortSignal; onStreamToken?: (token: string) => void }
  ): Promise<string> {
    this.refreshCredentials();
    const key = this.getApiKey();

    // Ollama doesn't need a key
    if (!key && this.provider !== 'ollama') {
      throw new AIServiceError(
        'missing_key',
        `No API key configured for ${PROVIDERS[this.provider]?.name || 'the active provider'}. Open Settings to add your key.`
      );
    }

    // Try primary model, then fallbacks (Gemini has fallbacks; other providers
    // just use the one configured model)
    const providerModels = PROVIDERS[this.provider]?.models || [];
    const fallbackModels = providerModels
      .filter(m => m.id !== this.primaryModel)
      .map(m => m.id);
    const modelsToTry = [
      this.primaryModel,
      ...(this.provider === 'gemini' ? AIProviderConfig.fallbackModels : fallbackModels),
    ].filter((m, i, arr) => arr.indexOf(m) === i); // dedupe

    let lastError: Error | null = null;

    for (const model of modelsToTry) {
      try {
        this.currentModel = model;
        const result = await this.sendWithRetry(model, key, messages, options);
        return result;
      } catch (e) {
        lastError = e as Error;
        if (e instanceof AIServiceError) {
          if (e.code === 'missing_key' || e.code === 'invalid_key') throw e;
          if (e.code === 'quota_exhausted') continue;
          if (e.code === 'model_unavailable') continue;
        }
        continue;
      }
    }

    throw lastError || new AIServiceError('unknown', `All models on ${PROVIDERS[this.provider]?.name || 'the provider'} failed. Please try again later.`);
  }

  private async sendWithRetry(
    model: string,
    key: string,
    messages: ChatMessage[],
    options?: { signal?: AbortSignal; onStreamToken?: (token: string) => void }
  ): Promise<string> {
    // Convert ChatMessage[] to ProviderMessage[] for the adapter
    const providerMessages: ProviderMessage[] = messages.map(m => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.content,
      imageBase64: m.imageBase64,
      imageMimeType: m.imageMimeType,
    }));

    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES_5XX; attempt++) {
      if (options?.signal?.aborted) {
        throw new AIServiceError('cancelled', 'Request was cancelled.');
      }

      try {
        const adapter = getAdapter(this.provider);
        const result = await adapter.sendMessage(providerMessages, {
          apiKey: key,
          model,
          baseUrl: this.baseUrl,
          signal: options?.signal,
          onStreamToken: options?.onStreamToken,
        });
        return result;
      } catch (e: any) {
        // Map adapter errors to AIServiceError
        if (e?.code === 'invalid_key') {
          throw new AIServiceError('invalid_key',
            `API key rejected by ${PROVIDERS[this.provider]?.name || 'provider'}. Please verify your key in Settings.`);
        }
        if (e?.code === 'quota_exhausted') {
          throw new AIServiceError('quota_exhausted', '');
        }
        if (e?.code === 'model_unavailable') {
          throw new AIServiceError('model_unavailable',
            `Model "${model}" is not available on ${PROVIDERS[this.provider]?.name || 'provider'}.`);
        }

        // Server errors — retry with backoff
        const statusMatch = e?.message?.match(/error (\d{3})/);
        const status = statusMatch ? parseInt(statusMatch[1]) : 0;
        if (status >= 500 && attempt < MAX_RETRIES_5XX) {
          const backoff = Math.min(8000, RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt));
          console.warn(`[AIService] ${status} on ${model} attempt ${attempt + 1}; retrying in ${backoff}ms`);
          await sleep(backoff);
          lastErr = e;
          continue;
        }

        lastErr = e;
        break;
      }
    }

    throw lastErr || new Error('AI request failed');
  }

  /**
   * Cancel any in-flight request.
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

// ---- Error Class ----

export class AIServiceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AIServiceError';
  }
}

// ---- Exports ----

export const aiService = AIService.getInstance();

/**
 * Run startup diagnostics. Returns a human-readable summary
 * AND the full DiagnosticsReport.
 */
export async function runStartupDiagnostics(): Promise<{
  report: DiagnosticsReport;
  summary: string;
  allPassed: boolean;
}> {
  const report = await aiService.runDiagnostics();
  const lines: string[] = [];
  let allPassed = true;

  const pass = (label: string, ok: boolean, detail?: string) => {
    const mark = ok ? '✅' : '❌';
    if (!ok) allPassed = false;
    lines.push(`${mark} ${label}${detail ? ': ' + detail : ''}`);
  };

  pass('Configuration loaded', report.config);
  pass('API key configured', report.apiKey);

  const connectivityLabels: Record<string, string> = {
    ok: 'Connected',
    missing_key: 'No API key',
    invalid_key: 'Key rejected — verify in Settings',
    model_unavailable: 'Model not available',
    // Quota is a transient runtime state — the key itself is valid and the
    // session is still usable. Surface it in the summary as a successful
    // connectivity check (✅) so the user isn't alarmed. The live
    // diagnostics panel still reflects the underlying rate-limit status via
    // the GEMINI cell (yellow / rate_limited).
    quota_exhausted: 'Online (rate limited)',
    billing_required: 'Billing required',
    network_error: 'Network error — check connection',
  };
  const connLabel = connectivityLabels[report.geminiConnectivity] || report.geminiConnectivity;
  // Treat quota as a successful connection for the overall pass marker —
  // recoverable, not a startup failure.
  const isConnOk =
    report.geminiConnectivity === 'ok' ||
    report.geminiConnectivity === 'quota_exhausted';
  pass('Gemini connectivity', isConnOk, connLabel);

  // Per-model availability rows: also treat quota_exhausted as a pass — same
  // recovery semantics as the top-level row. The live cell still shows the
  // underlying rate-limited state.
  for (const [model, status] of Object.entries(report.modelAvailability)) {
    const modelOk = status === 'ok' || status === 'quota_exhausted';
    const modelDetail = status === 'quota_exhausted' ? 'rate limited' : status;
    pass(`Model: ${model}`, modelOk, modelDetail);
  }

  const micLabels: Record<string, string> = {
    granted: 'Permission granted',
    denied: 'Permission denied — allow in System Settings',
    error: 'Not available',
  };
  pass('Microphone', report.microphone === 'granted', micLabels[report.microphone] || report.microphone);
  pass('Speaker / TTS', report.speaker);
  pass('Speech Recognition (STT)', report.stt);

  return {
    report,
    summary: lines.join('\n'),
    allPassed,
  };
}

/**
 * User-friendly message for each Gemini status.
 */
export function getStatusMessage(status: GeminiStatus): string {
  switch (status) {
    case 'missing_key':
      return 'No API key configured. Open Settings > Configuration to add your Gemini API key.';
    case 'invalid_key':
      return 'API key was rejected. Please verify your key in Settings > Configuration.';
    case 'model_unavailable':
      return 'The selected Gemini model is not available. Try switching models in Settings.';
    case 'quota_exhausted':
      // Silent: quota is recoverable and recovered automatically. We deliberately
      // do NOT surface the upstream upsell copy ("upgrade your plan at …") to
      // the user — the panel + transcript handle the state, the user just
      // keeps going.
      return '';
    case 'billing_required':
      return 'Billing must be enabled on your Google AI Studio account.';
    case 'network_error':
      return 'Cannot reach Gemini API. Check your internet connection.';
    default:
      return '';
  }
}

/**
 * Convenience: validate the Gemini key with a single call.
 * Returns null on success, or a user-facing error string on failure.
 *
 * Quota exhaustion is treated as a SUCCESSFUL validation: the key IS valid,
 * Gemini just throttled us. ConversationManager will recover via the model
 * fallback chain (or wait + retry) — no caller should block on quota.
 */
export async function validateGeminiKey(): Promise<string | null> {
  const status = await aiService.testConnectivity();
  if (status === 'ok' || status === 'quota_exhausted') return null;
  return getStatusMessage(status);
}

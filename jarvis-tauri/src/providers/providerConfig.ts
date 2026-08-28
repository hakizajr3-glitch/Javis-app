/**
 * Unified Provider Config — stores the active AI provider, API key, and model.
 *
 * This replaces the old gemini-only config with a provider-agnostic one.
 * Backward compatible: if a user has an old `gemini_api_key` in localStorage,
 * it's automatically migrated to the new format on first load.
 */

import { ProviderId, DEFAULT_PROVIDER, getDefaultModel, getDeepModel } from './providerRegistry';

export interface ProviderConfig {
  provider: ProviderId;
  apiKey: string;
  model: string;
  // Deep reasoning model (optional — falls back to provider's deep model)
  deepModel?: string;
}

const STORAGE_KEY = 'jarvis_provider_config';

// ─── Load config (with backward compatibility) ──────────────────────────────

export function loadProviderConfig(): ProviderConfig {
  // Try new format first
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.provider && parsed?.apiKey) {
        return {
          provider: parsed.provider as ProviderId,
          apiKey: String(parsed.apiKey).trim(),
          model: parsed.model || getDefaultModel(parsed.provider as ProviderId),
          deepModel: parsed.deepModel || getDeepModel(parsed.provider as ProviderId),
        };
      }
    }
  } catch (_) { /* fall through to migration */ }

  // Migrate from old gemini-only format
  try {
    const jarvisCfg = localStorage.getItem('jarvis_config');
    if (jarvisCfg) {
      const old = JSON.parse(jarvisCfg);
      if (old?.gemini_api_key) {
        const config: ProviderConfig = {
          provider: 'gemini',
          apiKey: String(old.gemini_api_key).trim(),
          model: old.model_fast || getDefaultModel('gemini'),
          deepModel: old.model_deep || getDeepModel('gemini'),
        };
        saveProviderConfig(config);
        return config;
      }
    }
  } catch (_) { /* fall through */ }

  // Try standalone gemini_api_key
  try {
    const standalone = localStorage.getItem('gemini_api_key');
    if (standalone) {
      const config: ProviderConfig = {
        provider: 'gemini',
        apiKey: String(standalone).trim(),
        model: getDefaultModel('gemini'),
        deepModel: getDeepModel('gemini'),
      };
      saveProviderConfig(config);
      return config;
    }
  } catch (_) { /* fall through */ }

  // No config — return empty defaults
  return {
    provider: DEFAULT_PROVIDER,
    apiKey: '',
    model: getDefaultModel(DEFAULT_PROVIDER),
    deepModel: getDeepModel(DEFAULT_PROVIDER),
  };
}

// ─── Save config ────────────────────────────────────────────────────────────

export function saveProviderConfig(config: ProviderConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    // Also update the old jarvis_config for backward compat with any code
    // that still reads gemini_api_key from it.
    try {
      const old = localStorage.getItem('jarvis_config');
      const oldCfg = old ? JSON.parse(old) : {};
      oldCfg.gemini_api_key = config.provider === 'gemini' ? config.apiKey : '';
      oldCfg.model_fast = config.model;
      oldCfg.model_deep = config.deepModel || '';
      localStorage.setItem('jarvis_config', JSON.stringify(oldCfg));
    } catch (_) { /* non-critical */ }
  } catch (_) { /* localStorage not available */ }
}

// ─── Check if a provider is configured ──────────────────────────────────────

export function isProviderConfigured(): boolean {
  const config = loadProviderConfig();
  // Ollama doesn't need an API key
  if (config.provider === 'ollama') return true;
  return config.apiKey.trim().length > 0;
}

// ─── Get the active model based on reasoning mode ───────────────────────────

export function getActiveProviderModel(reasoningMode?: 'fast' | 'deep'): string {
  const config = loadProviderConfig();
  if (reasoningMode === 'deep') {
    return config.deepModel || getDeepModel(config.provider);
  }
  return config.model || getDefaultModel(config.provider);
}

// ─── Get provider definition ────────────────────────────────────────────────

export function getActiveProvider(): ProviderId {
  return loadProviderConfig().provider;
}

export function getActiveApiKey(): string {
  return loadProviderConfig().apiKey;
}

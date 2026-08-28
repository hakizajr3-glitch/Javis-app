import { invoke, isTauri } from '@tauri-apps/api/core';
import { AIProviderConfig, sanitizeModel } from './aiProviderConfig';

export interface AppConfig {
  gemini_api_key: string;
  elevenlabs_api_key: string;
  elevenlabs_voice_id: string;
  voice_persona: 'male' | 'female' | 'jarvismale';
  reasoning_mode: 'deep' | 'fast';
  fast_response_mode: boolean;
  model_fast: string;
  model_deep: string;
}

type ConfigListener = (config: AppConfig) => void;

export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private config: AppConfig = {
    gemini_api_key: '',
    elevenlabs_api_key: '',
    elevenlabs_voice_id: '',
    voice_persona: 'jarvismale',
    reasoning_mode: 'fast',
    fast_response_mode: true,
    model_fast: AIProviderConfig.fastModel,
    model_deep: AIProviderConfig.deepModel,
  };
  private loaded = false;
  private listeners: Set<ConfigListener> = new Set();

  static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  onChange(fn: ConfigListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    const cfg = this.config;
    this.listeners.forEach((fn) => {
      try {
        fn(cfg);
      } catch {
      }
    });
  }

  async load(): Promise<AppConfig> {
    if (this.loaded) return this.config;
    if (!isTauri()) {
      // Browser preview path: there is no Tauri IPC, so skip the invoke and
      // use the in-memory defaults. Prevents console spam on every RightPanel
      // mount when the page is loaded outside the native window.
      this.loaded = true;
      this.notify();
      return this.config;
    }
    try {
      const raw = await invoke<string>('load_config');
      const parsed = JSON.parse(raw);
      this.config = {
        gemini_api_key: parsed.gemini_api_key || '',
        elevenlabs_api_key: parsed.elevenlabs_api_key || '',
        elevenlabs_voice_id: parsed.elevenlabs_voice_id || '',
        voice_persona:
          parsed.voice_persona === 'jarvismale' ? 'jarvismale' :
          parsed.voice_persona === 'female' ? 'female' : 'male',
        reasoning_mode: parsed.reasoning_mode === 'deep' ? 'deep' : 'fast',
        fast_response_mode: parsed.fast_response_mode ?? true,
        // Sanitize restored picks: if the persisted model is no longer in
        // the provider's available list (retired / quota-blocked), fall back
        // to the current defaults instead of 429/404-ing.
        model_fast: sanitizeModel(parsed.model_fast, AIProviderConfig.fastModel),
        model_deep: sanitizeModel(parsed.model_deep, AIProviderConfig.deepModel),
      };
    } catch (e) {
      console.warn('[Config] Load error, using defaults:', e);
    }
    this.loaded = true;
    this.notify();
    return this.config;
  }

  async save(partial: Partial<AppConfig>): Promise<void> {
    this.config = { ...this.config, ...partial };
    if (!isTauri()) {
      // Browser preview path: nothing to persist, but still notify listeners
      // so the UI updates locally.
      this.notify();
      return;
    }
    try {
      await invoke('save_config', { configJson: JSON.stringify(this.config) });
    } catch (e) {
      console.error('[Config] Save error:', e);
    }
    this.notify();
  }

  get(): AppConfig {
    return { ...this.config };
  }

  get hasKey(): boolean {
    return this.config.gemini_api_key.trim().length > 0;
  }

  get key(): string {
    return this.config.gemini_api_key;
  }

  /** ElevenLabs key — empty string means "no key, use browser TTS fallback". */
  get elevenlabsKey(): string {
    return this.config.elevenlabs_api_key;
  }

  get hasElevenLabsKey(): boolean {
    return this.config.elevenlabs_api_key.trim().length > 0;
  }

  /** ElevenLabs voice ID — empty string means "use the resolver's default (Bella)". */
  get elevenlabsVoiceId(): string {
    return this.config.elevenlabs_voice_id;
  }

  get voicePersona(): 'male' | 'female' | 'jarvismale' {
    return this.config.voice_persona;
  }

  get reasoningMode(): 'deep' | 'fast' {
    return this.config.reasoning_mode;
  }

  get fastResponse(): boolean {
    return this.config.fast_response_mode;
  }
}

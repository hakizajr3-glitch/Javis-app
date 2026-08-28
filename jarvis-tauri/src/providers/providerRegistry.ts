/**
 * Provider Registry — Central catalog of all supported AI providers.
 *
 * Each provider has:
 *   - id:          unique identifier (stored in config)
 *   - name:        display name
 *   - apiKeyUrl:   where to get an API key
 *   - baseUrl:     API endpoint
 *   - models:      list of models the provider offers
 *   - free:        whether a free tier is available
 *   - local:       whether it runs locally (no API key needed)
 *   - adapter:     the function that sends messages to this provider
 *
 * To add a new provider, add an entry here and an adapter in providerAdapters.ts.
 */

export type ProviderId =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'openrouter'
  | 'groq'
  | 'mistral'
  | 'deepseek'
  | 'together'
  | 'fireworks'
  | 'ollama'
  | 'xai'
  | 'perplexity';

export interface ProviderModel {
  id: string;
  name: string;
  fast?: boolean;
  deep?: boolean;
}

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  description: string;
  apiKeyUrl: string;
  baseUrl: string;
  models: ProviderModel[];
  free: boolean;
  local: boolean;
  docs: string;
}

// ─── Provider definitions ───────────────────────────────────────────────────

export const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Free tier available. Fast and capable models from Google.',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    free: true,
    local: false,
    docs: 'https://ai.google.dev/gemini-api/docs',
    models: [
      { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', fast: true },
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', fast: true },
      { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', fast: true },
      { id: 'gemini-flash-latest', name: 'Gemini Flash (Latest)', fast: true },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', deep: true },
    ],
  },

  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, GPT-4o mini, o1, o3 and more. Industry standard.',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    baseUrl: 'https://api.openai.com/v1',
    free: false,
    local: false,
    docs: 'https://platform.openai.com/docs',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', fast: true },
      { id: 'gpt-4o', name: 'GPT-4o', deep: true },
      { id: 'o1-mini', name: 'o1 Mini', deep: true },
      { id: 'o1', name: 'o1', deep: true },
      { id: 'o3-mini', name: 'o3 Mini', deep: true },
      { id: 'o3', name: 'o3', deep: true },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', fast: true },
      { id: 'gpt-4.1', name: 'GPT-4.1', deep: true },
    ],
  },

  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    description: 'Claude 3.5 Sonnet, Haiku, and Opus. Excellent for reasoning.',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    baseUrl: 'https://api.anthropic.com/v1',
    free: false,
    local: false,
    docs: 'https://docs.anthropic.com',
    models: [
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', fast: true },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', deep: true },
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', deep: true },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', deep: true },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', deep: true },
    ],
  },

  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access 200+ models from all providers with one API key. Some free models available.',
    apiKeyUrl: 'https://openrouter.ai/keys',
    baseUrl: 'https://openrouter.ai/api/v1',
    free: true,
    local: false,
    docs: 'https://openrouter.ai/docs',
    models: [
      { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5 (Free)', fast: true },
      { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (Free)', fast: true },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', deep: true },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', deep: true },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', fast: true },
      { id: 'openai/gpt-4o', name: 'GPT-4o', deep: true },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', fast: true },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', deep: true },
      { id: 'x-ai/grok-2', name: 'Grok 2', deep: true },
      { id: 'mistralai/mistral-large', name: 'Mistral Large', deep: true },
    ],
  },

  groq: {
    id: 'groq',
    name: 'Groq',
    description: 'Ultra-fast inference. Free tier with generous limits. Llama, Mixtral, and more.',
    apiKeyUrl: 'https://console.groq.com/keys',
    baseUrl: 'https://api.groq.com/openai/v1',
    free: true,
    local: false,
    docs: 'https://docs.groq.com',
    models: [
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', fast: true },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', deep: true },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', fast: true },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B', fast: true },
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B', deep: true },
    ],
  },

  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    description: 'European AI lab. Mistral Large, Codestral, and open-weight models.',
    apiKeyUrl: 'https://console.mistral.ai/api-keys',
    baseUrl: 'https://api.mistral.ai/v1',
    free: true,
    local: false,
    docs: 'https://docs.mistral.ai',
    models: [
      { id: 'mistral-small-latest', name: 'Mistral Small', fast: true },
      { id: 'mistral-large-latest', name: 'Mistral Large', deep: true },
      { id: 'codestral-latest', name: 'Codestral', deep: true },
      { id: 'open-mistral-7b', name: 'Mistral 7B (Open)', fast: true },
      { id: 'open-mixtral-8x7b', name: 'Mixtral 8x7B (Open)', fast: true },
    ],
  },

  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek R1 and V3. Excellent reasoning at very low cost.',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    baseUrl: 'https://api.deepseek.com/v1',
    free: false,
    local: false,
    docs: 'https://api-docs.deepseek.com',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3 Chat', fast: true },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1 Reasoner', deep: true },
    ],
  },

  together: {
    id: 'together',
    name: 'Together AI',
    description: 'Hosted open-source models. Llama, Qwen, DeepSeek, and 100+ more.',
    apiKeyUrl: 'https://api.together.xyz/settings/api-keys',
    baseUrl: 'https://api.together.xyz/v1',
    free: true,
    local: false,
    docs: 'https://docs.together.ai',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo', deep: true },
      { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', name: 'Llama 3.1 8B Turbo', fast: true },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', deep: true },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen 2.5 72B', deep: true },
    ],
  },

  fireworks: {
    id: 'fireworks',
    name: 'Fireworks AI',
    description: 'Fast inference for open-source models. Free credits available.',
    apiKeyUrl: 'https://fireworks.ai/api-keys',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    free: true,
    local: false,
    docs: 'https://docs.fireworks.ai',
    models: [
      { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', name: 'Llama 3.3 70B', deep: true },
      { id: 'accounts/fireworks/models/llama3p1-8b-instruct', name: 'Llama 3.1 8B', fast: true },
      { id: 'accounts/fireworks/models/deepseek-r1', name: 'DeepSeek R1', deep: true },
    ],
  },

  ollama: {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Run models locally on your machine. No API key needed. Free and private.',
    apiKeyUrl: '',
    baseUrl: 'http://localhost:11434/v1',
    free: true,
    local: true,
    docs: 'https://ollama.com',
    models: [
      { id: 'llama3.2', name: 'Llama 3.2', fast: true },
      { id: 'llama3.3', name: 'Llama 3.3', deep: true },
      { id: 'qwen2.5', name: 'Qwen 2.5', fast: true },
      { id: 'deepseek-r1', name: 'DeepSeek R1', deep: true },
      { id: 'gemma2', name: 'Gemma 2', fast: true },
      { id: 'mistral', name: 'Mistral', fast: true },
      { id: 'phi4', name: 'Phi 4', fast: true },
      { id: 'codellama', name: 'Code Llama', deep: true },
    ],
  },

  xai: {
    id: 'xai',
    name: 'xAI Grok',
    description: 'Grok models from xAI. Real-time knowledge and humor.',
    apiKeyUrl: 'https://console.x.ai',
    baseUrl: 'https://api.x.ai/v1',
    free: false,
    local: false,
    docs: 'https://docs.x.ai',
    models: [
      { id: 'grok-2-latest', name: 'Grok 2', deep: true },
      { id: 'grok-2-mini', name: 'Grok 2 Mini', fast: true },
      { id: 'grok-3', name: 'Grok 3', deep: true },
      { id: 'grok-3-mini', name: 'Grok 3 Mini', fast: true },
    ],
  },

  perplexity: {
    id: 'perplexity',
    name: 'Perplexity',
    description: 'Online models with real-time web search built in.',
    apiKeyUrl: 'https://www.perplexity.ai/settings/api',
    baseUrl: 'https://api.perplexity.ai',
    free: false,
    local: false,
    docs: 'https://docs.perplexity.ai',
    models: [
      { id: 'llama-3.1-sonar-small-128k-online', name: 'Sonar Small (Online)', fast: true },
      { id: 'llama-3.1-sonar-large-128k-online', name: 'Sonar Large (Online)', deep: true },
      { id: 'llama-3.1-sonar-huge-128k-online', name: 'Sonar Huge (Online)', deep: true },
    ],
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

export function getProvider(id: ProviderId): ProviderDefinition {
  return PROVIDERS[id];
}

export function getAllProviders(): ProviderDefinition[] {
  return Object.values(PROVIDERS);
}

export function getFreeProviders(): ProviderDefinition[] {
  return Object.values(PROVIDERS).filter(p => p.free);
}

export function getLocalProviders(): ProviderDefinition[] {
  return Object.values(PROVIDERS).filter(p => p.local);
}

export function getProviderModels(id: ProviderId): ProviderModel[] {
  return PROVIDERS[id]?.models || [];
}

export function getDefaultModel(id: ProviderId): string {
  const models = getProviderModels(id);
  const fast = models.find(m => m.fast);
  return (fast || models[0])?.id || '';
}

export function getDeepModel(id: ProviderId): string {
  const models = getProviderModels(id);
  const deep = models.find(m => m.deep);
  return deep?.id || getDefaultModel(id);
}

// ─── Default provider (backward compatible) ─────────────────────────────────

export const DEFAULT_PROVIDER: ProviderId = 'gemini';

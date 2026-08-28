/**
 * Provider Adapters — One adapter per API format.
 *
 * Most providers use the OpenAI-compatible chat completions format.
 * Gemini and Anthropic have their own formats. This file normalizes them
 * all to a common interface: sendMessage(messages, options) => string.
 */

import { JARVIS_SYSTEM_INSTRUCTION } from '../aiProviderConfig';
import { ProviderId } from './providerRegistry';

export interface ProviderMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageBase64?: string;
  imageMimeType?: string;
}

export interface ProviderSendOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  signal?: AbortSignal;
  onStreamToken?: (token: string) => void;
}

export interface ProviderAdapter {
  sendMessage(messages: ProviderMessage[], options: ProviderSendOptions): Promise<string>;
  testConnectivity(options: { apiKey: string; model: string; baseUrl: string }): Promise<boolean>;
}

// ─── OpenAI-compatible adapter (used by most providers) ─────────────────────

const openaiCompatible: ProviderAdapter = {
  async sendMessage(messages: ProviderMessage[], opts: ProviderSendOptions): Promise<string> {
    const systemPrompt = JARVIS_SYSTEM_INSTRUCTION.parts[0].text;

    // Convert messages to OpenAI format
    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.imageBase64
          ? [
              { type: 'text', text: m.content },
              { type: 'image_url', image_url: { url: `data:${m.imageMimeType || 'image/jpeg'};base64,${m.imageBase64}` } },
            ]
          : m.content,
      })),
    ];

    const res = await fetch(`${opts.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: chatMessages,
        stream: false,
      }),
      signal: opts.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) {
        throw Object.assign(new Error(`Authentication failed (${res.status}). Check your API key.`), { code: 'invalid_key' });
      }
      if (res.status === 429) {
        throw Object.assign(new Error(''), { code: 'quota_exhausted' });
      }
      if (res.status === 404) {
        throw Object.assign(new Error(`Model "${opts.model}" not found.`), { code: 'model_unavailable' });
      }
      throw new Error(`API error ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || 'No response';
    opts.onStreamToken?.(text);
    return text;
  },

  async testConnectivity(opts: { apiKey: string; model: string; baseUrl: string }): Promise<boolean> {
    try {
      const res = await fetch(`${opts.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model: opts.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(10000),
      });
      return res.ok || res.status === 429; // 429 = valid key, just rate limited
    } catch {
      return false;
    }
  },
};

// ─── OpenRouter adapter (OpenAI-compatible + extra headers) ─────────────────

const openrouterAdapter: ProviderAdapter = {
  async sendMessage(messages: ProviderMessage[], opts: ProviderSendOptions): Promise<string> {
    const systemPrompt = JARVIS_SYSTEM_INSTRUCTION.parts[0].text;
    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    ];

    const res = await fetch(`${opts.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${opts.apiKey}`,
        'HTTP-Referer': 'https://github.com/hakizajr3-glitch/J.R.R.V.I.S',
        'X-Title': 'JARVIS',
      },
      body: JSON.stringify({
        model: opts.model,
        messages: chatMessages,
        stream: false,
      }),
      signal: opts.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`Auth failed (${res.status})`), { code: 'invalid_key' });
      if (res.status === 429) throw Object.assign(new Error(''), { code: 'quota_exhausted' });
      if (res.status === 404) throw Object.assign(new Error(`Model "${opts.model}" not found`), { code: 'model_unavailable' });
      throw new Error(`OpenRouter error ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || 'No response';
    opts.onStreamToken?.(text);
    return text;
  },

  async testConnectivity(opts: { apiKey: string; model: string; baseUrl: string }): Promise<boolean> {
    try {
      const res = await fetch(`${opts.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${opts.apiKey}`,
          'HTTP-Referer': 'https://github.com/hakizajr3-glitch/J.R.R.V.I.S',
          'X-Title': 'JARVIS',
        },
        body: JSON.stringify({ model: opts.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
        signal: AbortSignal.timeout(10000),
      });
      return res.ok || res.status === 429;
    } catch {
      return false;
    }
  },
};

// ─── Gemini adapter (Google's own format) ───────────────────────────────────

const geminiAdapter: ProviderAdapter = {
  async sendMessage(messages: ProviderMessage[], opts: ProviderSendOptions): Promise<string> {
    const contents = messages.map(m => {
      const parts: any[] = [];
      if (m.role === 'user' && m.imageBase64) {
        parts.push({ inlineData: { mimeType: m.imageMimeType || 'image/jpeg', data: m.imageBase64 } });
      }
      parts.push({ text: m.content });
      return { role: m.role === 'assistant' ? 'model' : 'user', parts };
    });

    const url = `${opts.baseUrl}/models/${opts.model}:generateContent?key=${opts.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: JARVIS_SYSTEM_INSTRUCTION, contents }),
      signal: opts.signal,
    });

    if (!res.ok) {
      if (res.status === 429) throw Object.assign(new Error(''), { code: 'quota_exhausted' });
      if (res.status === 400 || res.status === 401 || res.status === 403) throw Object.assign(new Error(`Auth failed (${res.status})`), { code: 'invalid_key' });
      if (res.status === 404) throw Object.assign(new Error(`Model "${opts.model}" not found`), { code: 'model_unavailable' });
      const body = await res.text().catch(() => '');
      throw new Error(`Gemini error ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
    opts.onStreamToken?.(text);
    return text;
  },

  async testConnectivity(opts: { apiKey: string; model: string; baseUrl: string }): Promise<boolean> {
    try {
      const url = `${opts.baseUrl}/models/${opts.model}:generateContent?key=${opts.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 1 } }),
        signal: AbortSignal.timeout(10000),
      });
      return res.ok || res.status === 429;
    } catch {
      return false;
    }
  },
};

// ─── Anthropic adapter (Claude's own format) ────────────────────────────────

const anthropicAdapter: ProviderAdapter = {
  async sendMessage(messages: ProviderMessage[], opts: ProviderSendOptions): Promise<string> {
    const systemPrompt = JARVIS_SYSTEM_INSTRUCTION.parts[0].text;
    // Anthropic uses top-level `system` + messages without system role
    const chatMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    const res = await fetch(`${opts.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: chatMessages,
      }),
      signal: opts.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`Auth failed (${res.status})`), { code: 'invalid_key' });
      if (res.status === 429) throw Object.assign(new Error(''), { code: 'quota_exhausted' });
      if (res.status === 404) throw Object.assign(new Error(`Model "${opts.model}" not found`), { code: 'model_unavailable' });
      throw new Error(`Anthropic error ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text || 'No response';
    opts.onStreamToken?.(text);
    return text;
  },

  async testConnectivity(opts: { apiKey: string; model: string; baseUrl: string }): Promise<boolean> {
    try {
      const res = await fetch(`${opts.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': opts.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model: opts.model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
        signal: AbortSignal.timeout(10000),
      });
      return res.ok || res.status === 429;
    } catch {
      return false;
    }
  },
};

// ─── Ollama adapter (local, no API key) ─────────────────────────────────────

const ollamaAdapter: ProviderAdapter = {
  async sendMessage(messages: ProviderMessage[], opts: ProviderSendOptions): Promise<string> {
    const systemPrompt = JARVIS_SYSTEM_INSTRUCTION.parts[0].text;
    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch(`${opts.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: opts.model, messages: chatMessages, stream: false }),
      signal: opts.signal,
    });

    if (!res.ok) {
      if (res.status === 404) throw Object.assign(new Error(`Model "${opts.model}" not found. Run: ollama pull ${opts.model}`), { code: 'model_unavailable' });
      throw new Error(`Ollama error ${res.status}`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || 'No response';
    opts.onStreamToken?.(text);
    return text;
  },

  async testConnectivity(_opts: { apiKey: string; model: string; baseUrl: string }): Promise<boolean> {
    try {
      const res = await fetch(`${_opts.baseUrl}/models`, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch {
      return false;
    }
  },
};

// ─── Adapter registry ───────────────────────────────────────────────────────

const ADAPTERS: Partial<Record<ProviderId, ProviderAdapter>> = {
  gemini: geminiAdapter,
  openai: openaiCompatible,
  anthropic: anthropicAdapter,
  openrouter: openrouterAdapter,
  groq: openaiCompatible,
  mistral: openaiCompatible,
  deepseek: openaiCompatible,
  together: openaiCompatible,
  fireworks: openaiCompatible,
  ollama: ollamaAdapter,
  xai: openaiCompatible,
  perplexity: openaiCompatible,
};

export function getAdapter(provider: ProviderId): ProviderAdapter {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new Error(`No adapter for provider "${provider}"`);
  return adapter;
}

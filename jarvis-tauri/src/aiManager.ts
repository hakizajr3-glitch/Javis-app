// Unified AI WebSocket Manager
// Handles both text and voice, plus multimodal inputs

type MessageHandler = (message: any) => void;

class AIManager {
  private ws: WebSocket | null = null;
  private url = 'ws://127.0.0.1:8000/ws/desktop';
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isConnected = false;
  private initialized = false;

  constructor() {
    // DO NOT auto-connect
  }

  init() {
    if (this.initialized) {
      console.log('[AIManager] Already initialized');
      return;
    }
    this.initialized = true;
    console.log('[AIManager] Initializing...');
    this.connect();
  }

  private connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    
    console.log('[AIManager] Connecting to:', this.url);
    this.isConnected = false;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('[AIManager] Connected');
      this.isConnected = true;
      if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[AIManager] Received:', data.type);
        this.handlers.forEach(handler => handler(data));
      } catch (e) {
        console.error('[AIManager] Parse error:', e);
      }
    };

    this.ws.onerror = (e) => console.error('[AIManager] Error:', e);

    this.ws.onclose = () => {
      console.log('[AIManager] Disconnected');
      this.isConnected = false;
      this.ws = null;
      if (this.initialized) {
        console.log('[AIManager] Reconnecting in 2s...');
        this.reconnectTimeout = setTimeout(() => this.connect(), 2000);
      }
    };
  }

  subscribe(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  sendCommand(command: string, context: any = {}) {
    console.log('[AIManager] Sending:', command.substring(0, 30));
    
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('[AIManager] Not connected, connecting...');
      this.connect();
      setTimeout(() => this.sendCommand(command, context), 1000);
      return;
    }

    const payload = JSON.stringify({
      type: 'user_command',
      payload: { command, context },
      timestamp: Date.now()
    });
    
    try {
      this.ws.send(payload);
      console.log('[AIManager] Sent:', command.substring(0, 30));
    } catch (e) {
      console.error('[AIManager] Send error:', e);
    }
  }

  // Send file to backend
  sendFile(file: File) {
    console.log('[AIManager] Sending file:', file.name);
    
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      this.sendCommand('file_upload', {
        filename: file.name,
        type: file.type,
        data: base64
      });
    };
    reader.readAsDataURL(file);
  }

  // Send multiple files
  sendFiles(files: FileList) {
    Array.from(files).forEach(file => this.sendFile(file));
  }

  disconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.initialized = false;
  }

  isInitialized() {
    return this.initialized;
  }
}

// Singleton
let aiManager: AIManager | null = null;

export function getAIManager(): AIManager {
  if (!aiManager) aiManager = new AIManager();
  return aiManager;
}

export function sendAICommand(command: string, context: any = {}) {
  getAIManager().sendCommand(command, context);
}

export function onAIResponse(handler: MessageHandler) {
  return getAIManager().subscribe(handler);
}

export function initAIManager() {
  getAIManager().init();
}

export function disconnectAIManager() {
  getAIManager().disconnect();
}

// New exports for multimodal
export function sendFileToAI(file: File) {
  getAIManager().sendFile(file);
}

export function sendFilesToAI(files: FileList) {
  getAIManager().sendFiles(files);
}

// ---------------------------------------------------------------------------
// Direct-to-Gemini API client (mirrors my-athena-v1/jarvis-tauri/src/geminiClient.ts).
// Used as a fallback when the Python AI engine at ws://localhost:8000 is offline.
// Includes quota retry with exponential backoff.
// ---------------------------------------------------------------------------

import { AIProviderConfig, sanitizeModel, JARVIS_SYSTEM_INSTRUCTION } from './aiProviderConfig';

export interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
}

export function setGeminiApiKey(key: string): void {
  try { localStorage.setItem('gemini_api_key', key); } catch (_) {}
}

// Lazy readers — re-evaluated on every GeminiClient construction so that
// `setGeminiApiKey()` (which writes to localStorage) takes effect for any
// client constructed after the call.
function readGeminiApiKey(): string {
  return (
    (import.meta as any)?.env?.VITE_GEMINI_API_KEY ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('gemini_api_key')) ||
    ''
  );
}

function readGeminiModel(): string {
  // Use the centralized provider config — no hardcoded model names.
  try {
    const saved = localStorage.getItem('jarvis_config');
    const cfg = saved && JSON.parse(saved);
    if (cfg?.model_fast) {
      // Migrate stale saved picks: a previously-saved model that is no
      // longer in the provider's available list (retired / quota-blocked)
      // falls back to the current default instead of 429/404-ing. Honor
      // deep mode on the fallback, matching aiService.readModel().
      const fallback = cfg?.reasoning_mode === 'deep'
        ? AIProviderConfig.deepModel
        : AIProviderConfig.fastModel;
      return sanitizeModel(cfg.model_fast, fallback);
    }
  } catch (_) {}
  // Dynamic import not needed here — use the env fallback then the
  // single source of truth from AIProviderConfig.
  return (
    (import.meta as any)?.env?.VITE_GEMINI_MODEL ||
    AIProviderConfig.fastModel
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class GeminiClient {
  apiKey: string;
  model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey ?? readGeminiApiKey();
    this.model = model ?? readGeminiModel();
  }

  async sendMessage(messages: ChatMessage[], maxRetries = 4): Promise<string> {
    // Re-read the latest key every request so a newly saved key is picked up
    // without requiring a page reload.
    const currentKey = this.apiKey || readGeminiApiKey();
    if (!currentKey) {
      throw new Error(
        'Gemini API key not set. Provide VITE_GEMINI_API_KEY in .env or call setGeminiApiKey().'
      );
    }

    const contents = messages.map((m) => ({
      role: m.role === 'ai' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${currentKey}`;

    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction: JARVIS_SYSTEM_INSTRUCTION, contents }),
      });

      if (res.ok) {
        const data = await res.json();
        return (
          data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response'
        );
      }

      // Do NOT retry on 429 — free-tier quotas are exhausted and retrying
      // only makes the lockout worse. Surface it to the user immediately.
      if (res.status === 429) {
        const detail = await res.text().catch(() => '');
        console.warn('[GeminiClient] 429 quota exceeded:', detail);
        // Silent — recoverable, recovered automatically by ConversationManager.
        // Attach `code` so the recovery layer can still branch on intent even
        // though `message` is empty (per the user's "remove this" mandate).
        throw Object.assign(new Error(''), { code: 'quota_exhausted' });
      }

      // Transient server errors — retry with backoff.
      if (res.status >= 500) {
        const backoff = Math.min(8000, 600 * Math.pow(2, attempt));
        console.warn(
          `[GeminiClient] ${res.status} on attempt ${attempt + 1}/${maxRetries}; retrying in ${backoff}ms`
        );
        await sleep(backoff);
        lastErr = new Error(`Gemini API error: ${res.status}`);
        continue;
      }

      // Non-retryable HTTP error.
      lastErr = new Error(`Gemini API error: ${res.status} ${await res.text()}`);
      break;
    }
    throw lastErr ?? new Error('Gemini request failed after retries');
  }
}
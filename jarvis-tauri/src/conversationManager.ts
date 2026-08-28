/**
 * JARVIS Conversation Manager — Shared conversation state.
 * 
 * All voice and text interactions pass through this singleton.
 * No UI component may call Gemini directly.
 * 
 * Manages: message history, streaming responses, typing indicators,
 * cancellation, and state transitions.
 */

import { aiService, ChatMessage, AIServiceError, getStatusMessage } from './aiService';

/** Capture a JPEG frame from a video element and return it as base64. */
async function captureVideoFrame(videoEl: HTMLVideoElement): Promise<string | null> {
  if (videoEl.readyState < 2) return null;
  try {
    const canvas = document.createElement('canvas');
    const width = 640;
    const height = 360;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoEl, 0, 0, width, height);
    ctx.restore();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85)
    );
    if (!blob) return null;
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Grab a frame from the active camera (if any). */
async function captureActiveFrame(): Promise<{ imageBase64: string; imageMimeType: string } | null> {
  const camEl = window.__jarvisCameraRef;
  if (camEl && camEl.readyState >= 2) {
    const frame = await captureVideoFrame(camEl);
    if (frame) return { imageBase64: frame, imageMimeType: 'image/jpeg' };
  }
  return null;
}

/** Quick check: does the message likely reference something visual? */
function isVisualQuery(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(see|look|watch|view|show|hand|screen|camera|this|that|here|holding|object|what|recognize|identify|describe|tell me what)\b/.test(t);
}

// ---- Types ----

export type ConversationState =
  | 'idle'
  | 'initializing'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'executing'
  | 'speaking'
  | 'error'
  | 'recovering';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface ConversationCallbacks {
  onStateChange?: (state: ConversationState) => void;
  onMessage?: (message: Message) => void;
  onStreamToken?: (token: string) => void;
  onError?: (error: string, recoverable: boolean) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
}

// ---- ConversationManager ----

class ConversationManager {
  private static instance: ConversationManager;
  private state: ConversationState = 'idle';
  private messages: Message[] = [];
  private callbacks: ConversationCallbacks = {};
  private abortController: AbortController | null = null;
  private retryCount = 0;
  private maxRetries = 3;

  static getInstance(): ConversationManager {
    if (!ConversationManager.instance) {
      ConversationManager.instance = new ConversationManager();
    }
    return ConversationManager.instance;
  }

  // ---- State Management ----

  getState(): ConversationState {
    return this.state;
  }

  setCallbacks(cb: ConversationCallbacks): void {
    this.callbacks = { ...this.callbacks, ...cb };
  }

  private setState(newState: ConversationState): void {
    if (this.state !== newState) {
      const prev = this.state;
      this.state = newState;
      console.log(`[ConversationManager] ${prev} → ${newState}`);
      this.callbacks.onStateChange?.(newState);
    }
  }

  // ---- Initialization ----

  async initialize(): Promise<boolean> {
    if (this.state === 'listening' || this.state === 'thinking' || this.state === 'speaking') {
      console.log('[ConversationManager] Already active');
      return true;
    }

    this.setState('initializing');

    try {
      // 1. Refresh credentials
      aiService.refreshCredentials();

      // 2. Validate API key
      const key = aiService.getApiKey();
      if (!key) {
        this.handleError('No API key configured. Open Settings > Configuration to add your Gemini API key.', false);
        return false;
      }

      // 3. Quick connectivity test
      const connectivity = await aiService.testConnectivity();
      if (connectivity !== 'ok') {
        const msg = getStatusMessage(connectivity);
        this.handleError(msg || `Gemini connectivity issue: ${connectivity}`, connectivity === 'quota_exhausted' || connectivity === 'network_error');
        if (connectivity === 'quota_exhausted') {
          // Still initialize — user may just wait
          console.warn('[ConversationManager] Quota exhausted, but initializing anyway');
        } else if (connectivity === 'missing_key' || connectivity === 'invalid_key') {
          return false;
        }
        // network_error, model_unavailable — continue anyway, will retry
      }

      // 4. Verify microphone
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      } catch (e: any) {
        this.handleError(
          e?.name === 'NotAllowedError'
            ? 'Microphone permission denied. Allow mic access in System Settings.'
            : 'Microphone not available.',
          false
        );
        return false;
      }

      // 5. Ready
      this.setState('listening');
      this.retryCount = 0;
      return true;

    } catch (e) {
      this.handleError(`Initialization failed: ${(e as Error).message}`, false);
      return false;
    }
  }

  // ---- Send Message (Text) ----

  async sendMessage(content: string): Promise<void> {
    if (this.state === 'idle' || this.state === 'error') {
      const ok = await this.initialize();
      if (!ok) return;
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    };

    this.messages.push(userMsg);
    this.callbacks.onMessage?.(userMsg);

    this.setState('thinking');

    try {
      this.abortController = new AbortController();

      // Capture a camera frame so the AI can "see" what the user is
      // looking at — but only when the message appears to be a visual
      // query, to avoid unnecessary latency on every message.
      const frame = isVisualQuery(userMsg.content) ? await captureActiveFrame() : null;

      const history: ChatMessage[] = this.messages.map((m) => ({
        role: m.role === 'assistant' ? 'ai' : 'user',
        content: m.content,
        // Inject the camera frame into this message if it's the one
        // we just created (matched by id).
        ...(frame && m.id === userMsg.id
          ? { imageBase64: frame.imageBase64, imageMimeType: frame.imageMimeType }
          : {}),
      }));

      const response = await aiService.sendMessage(history, {
        signal: this.abortController.signal,
        onStreamToken: (token) => {
          this.callbacks.onStreamToken?.(token);
        },
      });

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };

      this.messages.push(aiMsg);
      this.callbacks.onMessage?.(aiMsg);
      this.retryCount = 0;
      this.setState('speaking');

      // Auto-return to listening after a brief pause
      setTimeout(() => {
        if (this.state === 'speaking') {
          this.setState('listening');
        }
      }, 500);

    } catch (e) {
      if (this.abortController?.signal.aborted) {
        this.setState('listening');
        return;
      }

      // Honor any quota_exhausted signal — even from legacy non-AIServiceError
      // throws (e.g. `Object.assign(new Error(''), { code: 'quota_exhausted' })`
      // in geminiClient.ts / aiManager.ts, which are not `instanceof
      // AIServiceError` so they need an explicit code check here).
      if ((e as any)?.code === 'quota_exhausted') {
        this.handleError((e as Error).message, true);
        this.setState('listening');
        return;
      }

      if (e instanceof AIServiceError) {
        if (e.code === 'quota_exhausted') {
          this.handleError(e.message, true);
          this.setState('listening');
          return;
        }
        if (e.code === 'missing_key' || e.code === 'invalid_key') {
          this.handleError(e.message, false);
          return;
        }
      }

      // Recoverable?
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        this.setState('recovering');
        console.log(`[ConversationManager] Retry ${this.retryCount}/${this.maxRetries}`);
        setTimeout(() => this.sendMessage(content), 1500);
        return;
      }

      this.handleError((e as Error).message, false);
    } finally {
      this.abortController = null;
    }
  }

  // ---- Send through voice ----

  async sendVoiceTranscript(text: string): Promise<void> {
    this.callbacks.onTranscript?.(text, true);
    await this.sendMessage(text);
  }

  // ---- Cancel / Interrupt ----

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.setState('listening');
  }

  // ---- Terminate ----

  terminate(): void {
    this.cancel();
    this.messages = [];
    this.retryCount = 0;
    this.setState('idle');
  }

  // ---- Error Handling ----

  private handleError(message: string, recoverable: boolean): void {
    console.error('[ConversationManager] Error:', message);
    if (!recoverable) {
      this.setState('error');
    }
    this.callbacks.onError?.(message, recoverable);

    if (recoverable) {
      // Auto-recover after delay
      setTimeout(() => {
        if (this.state === 'error') {
          this.setState('recovering');
          setTimeout(() => {
            if (this.state === 'recovering') {
              this.setState('listening');
            }
          }, 2000);
        }
      }, 3000);
    }
  }

  // ---- Accessors ----

  getMessages(): Message[] {
    return [...this.messages];
  }

  clearMessages(): void {
    this.messages = [];
  }
}

// ---- Exports ----

export const conversationManager = ConversationManager.getInstance();

export function getConversationManager(): ConversationManager {
  return conversationManager;
}

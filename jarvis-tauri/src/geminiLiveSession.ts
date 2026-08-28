/**
 * GeminiLiveSession — Real-time vision + voice through the Gemini
 * Multimodal Live API (BidiGenerateContent WebSocket).
 *
 * Streams:
 *   - video frames from the camera widget (<video> element)
 *   - microphone audio (16-bit PCM @ 16kHz)
 * Receives:
 *   - model audio responses (16-bit PCM @ 24kHz)
 *   - text transcripts / turn-complete signals
 *
 * Designed to be started/stopped independently of the camera widget so the
 * camera preview keeps working even when Live Vision is off.
 */

import { JARVIS_SYSTEM_INSTRUCTION } from './aiProviderConfig';

export type LiveState = 'idle' | 'connecting' | 'connected' | 'error';

export interface GeminiLiveCallbacks {
  onStateChange?: (state: LiveState) => void;
  onError?: (message: string) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onSpeakingStart?: () => void;
  onSpeakingEnd?: () => void;
}

interface AudioOutputContext {
  ctx: AudioContext;
  nextTime: number;
}

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private state: LiveState = 'idle';
  private apiKey = '';
  private videoEl: HTMLVideoElement | null = null;
  private micStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private audioSampleRate = 16000;
  private scriptNode: ScriptProcessorNode | null = null;
  private frameInterval: ReturnType<typeof setInterval> | null = null;
  private outputCtx: AudioOutputContext | null = null;
  private callbacks: GeminiLiveCallbacks = {};

  // ---- Public API ----

  getState(): LiveState {
    return this.state;
  }

  async start(
    apiKey: string,
    videoEl: HTMLVideoElement,
    callbacks: GeminiLiveCallbacks = {}
  ): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error('GeminiLiveSession already active');
    }

    this.apiKey = apiKey;
    this.videoEl = videoEl;
    this.callbacks = callbacks;

    this.setState('connecting');

    try {
      await this.connectWebSocket();
      await this.startMicrophone();
      this.startFrameLoop();
      this.setState('connected');
    } catch (err) {
      this.setState('error');
      this.stop();
      throw err;
    }
  }

  stop(): void {
    this.setState('idle');

    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }

    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode = null;
    }

    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }

    if (this.outputCtx) {
      this.outputCtx.ctx.close().catch(() => {});
      this.outputCtx = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.videoEl = null;
    this.callbacks = {};
  }

  /**
   * Send an explicit text prompt while the session is running.
   * Useful for "Hey JARVIS, what do you see?" style commands.
   */
  sendText(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    // Gemini Live uses a client_content message for additional text input.
    this.ws.send(
      JSON.stringify({
        clientContent: {
          turns: [
            {
              role: 'user',
              parts: [{ text }],
            },
          ],
          turnComplete: true,
        },
      })
    );
  }

  // ---- WebSocket lifecycle ----

  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url =
        'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=' +
        encodeURIComponent(this.apiKey);

      this.ws = new WebSocket(url);
      let timeout: ReturnType<typeof setTimeout> | null = null;
      let settled = false;

      const finish = (fn: () => void) => {
        if (!settled) {
          settled = true;
          fn();
        }
      };

      this.ws.onopen = () => {
        this.sendSetup();
      };

      this.ws.onerror = () => {
        if (timeout) clearTimeout(timeout);
        this.setState('error');
        this.callbacks.onError?.('Gemini Live WebSocket error');
        finish(() => reject(new Error('Gemini Live WebSocket error')));
      };

      this.ws.onclose = (ev) => {
        if (timeout) clearTimeout(timeout);
        if (this.state !== 'idle') {
          this.setState('error');
          this.callbacks.onError?.(
            `Gemini Live connection closed (${ev.code})`
          );
        }
        finish(() => reject(new Error(`Gemini Live connection closed (${ev.code})`)));
      };

      this.ws.onmessage = (event) => {
        const msg = this.handleMessage(event.data);
        if (msg?.setupComplete) {
          if (timeout) clearTimeout(timeout);
          finish(() => resolve());
        }
      };

      // Fail fast if the socket cannot open
      timeout = setTimeout(() => {
        finish(() => reject(new Error('Gemini Live WebSocket failed to open')));
      }, 15000);
    });
  }

  private sendSetup(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(
      JSON.stringify({
        setup: {
          model: 'models/gemini-2.0-flash-exp',
          generationConfig: {
            responseModalities: ['AUDIO'],
            // Keep responses concise for a real-time assistant feel.
            maxOutputTokens: 2048,
          },
          systemInstruction: JARVIS_SYSTEM_INSTRUCTION,
        },
      })
    );
  }

  // ---- Video frame capture ----

  private startFrameLoop(): void {
    // Send one frame per second. Gemini Live handles low-frequency image
    // updates well; higher rates cost more bandwidth without proportional
    // gains for conversational use.
    this.frameInterval = setInterval(() => {
      void this.captureAndSendFrame();
    }, 1000);
  }

  private async captureAndSendFrame(): Promise<void> {
    try {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      if (!this.videoEl || this.videoEl.readyState < 2) return;

      const canvas = document.createElement('canvas');
      // Cap resolution to keep payload small and within API limits.
      const width = 640;
      const height = 360;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Mirror-aware drawing to match the visible preview.
      ctx.save();
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(this.videoEl, 0, 0, width, height);
      ctx.restore();

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.85)
      );
      if (!blob) return;

      const data = await this.blobToBase64(blob);
      this.ws.send(
        JSON.stringify({
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: 'image/jpeg',
                data,
              },
            ],
          },
        })
      );
    } catch (err) {
      console.error('[GeminiLiveSession] Frame capture error:', err);
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ---- Microphone audio capture ----

  private async startMicrophone(): Promise<void> {
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    // The browser may not honor the requested sample rate; use the actual rate
    // for the Web Audio graph and the PCM mime type sent to Gemini.
    this.audioCtx = new AudioContext({ sampleRate: 16000 });
    this.audioSampleRate = this.audioCtx.sampleRate;
    const source = this.audioCtx.createMediaStreamSource(this.micStream);

    // ScriptProcessorNode is universally supported and gives us raw PCM
    // without requiring an external worklet file.
    const bufferSize = 4096;
    this.scriptNode = this.audioCtx.createScriptProcessor(bufferSize, 1, 1);

    this.scriptNode.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const pcm = this.floatTo16BitPCM(input);
      const data = this.arrayBufferToBase64(pcm.buffer);
      this.sendAudioChunk(data);
    };

    source.connect(this.scriptNode);
    // Route ScriptProcessorNode output to a silent gain node instead of
    // directly to the destination. Sending mic input to the speakers causes
    // audible feedback/echo. A zero-gain node keeps the audio graph alive
    // without outputting any sound.
    const silent = this.audioCtx.createGain();
    silent.gain.value = 0;
    this.scriptNode.connect(silent);
    silent.connect(this.audioCtx.destination);
  }

  private sendAudioChunk(base64Data: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: `audio/pcm;rate=${this.audioSampleRate}`,
              data: base64Data,
            },
          ],
        },
      })
    );
  }

  private floatTo16BitPCM(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
  }

  private arrayBufferToBase64(buffer: ArrayBufferLike): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // ---- Incoming message handling ----

  private handleMessage(data: string): any {
    try {
      const msg = JSON.parse(data);

      // Server content (model turn / completion)
      if (msg.serverContent) {
        const turn = msg.serverContent.modelTurn;
        if (turn?.parts) {
          for (const part of turn.parts) {
            if (part.inlineData?.mimeType?.startsWith('audio/')) {
              void this.playAudioPCM(part.inlineData.data);
            }
            if (part.text) {
              this.callbacks.onTranscript?.(part.text, false);
            }
          }
        }
        if (msg.serverContent.turnComplete) {
          this.callbacks.onSpeakingEnd?.();
        }
      }

      // Explicit error from the API
      if (msg.error) {
        this.callbacks.onError?.(msg.error.message || 'Gemini Live error');
      }
      return msg;
    } catch (err) {
      console.error('[GeminiLiveSession] Failed to parse message:', err);
    }
    return null;
  }

  // ---- Audio output ----

  private async playAudioPCM(base64Data: string): Promise<void> {
    try {
      const pcm = this.base64ToInt16(base64Data);
      await this.queuePcmAudio(pcm, 24000);
    } catch (err) {
      console.error('[GeminiLiveSession] Audio playback error:', err);
    }
  }

  private base64ToInt16(base64: string): Int16Array {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Int16Array(bytes.buffer);
  }

  private async queuePcmAudio(pcm: Int16Array, sampleRate: number): Promise<void> {
    const ctx = this.outputCtx?.ctx || new AudioContext({ sampleRate });
    if (!this.outputCtx) {
      this.outputCtx = { ctx, nextTime: ctx.currentTime };
    }

    const buffer = ctx.createBuffer(1, pcm.length, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) {
      channel[i] = pcm[i] / 32768;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    if (this.outputCtx.nextTime < now) {
      this.outputCtx.nextTime = now;
    }
    source.start(this.outputCtx.nextTime);
    this.outputCtx.nextTime += buffer.duration;
  }

  // ---- State helpers ----

  private setState(state: LiveState): void {
    if (this.state === state) return;
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }
}

export default GeminiLiveSession;

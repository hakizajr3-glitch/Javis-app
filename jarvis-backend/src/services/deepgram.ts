import { EventEmitter } from 'events';
import WebSocket from 'ws';

export interface DeepgramConfig {
  apiKey: string;
  model?: string;
  language?: string;
  encoding?: string;
  sampleRate?: number;
  channels?: number;
}

export interface DeepgramTranscript {
  text: string;
  isFinal: boolean;
  confidence?: number;
  words?: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
  }>;
}

export class DeepgramService extends EventEmitter {
  private apiKey: string;
  private model: string;
  private language: string;
  private encoding: string;
  private sampleRate: number;
  private channels: number;
  private socket: WebSocket | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;

  constructor(config: DeepgramConfig) {
    super();
    this.apiKey = config.apiKey;
    this.model = config.model || 'nova-2';
    this.language = config.language || 'en-US';
    this.encoding = config.encoding || 'mulaw';
    this.sampleRate = config.sampleRate || 8000;
    this.channels = config.channels || 1;
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    const url = this.buildUrl();

    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(url);

      this.socket.on('open', () => {
        console.log('[Deepgram] 🔗 Connected to streaming STT');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        resolve();
      });

      this.socket.on('message', (data: Buffer) => {
        this.handleMessage(data);
      });

      this.socket.on('close', () => {
        console.log('[Deepgram] 🔌 Disconnected');
        this.isConnected = false;
        this.emit('close');
        this.attemptReconnect();
      });

      this.socket.on('error', (error) => {
        console.error('[Deepgram] ❌ Error:', error.message);
        this.emit('error', error);
        reject(error);
      });
    });
  }

  private buildUrl(): string {
    const params = new URLSearchParams({
      model: this.model,
      language: this.language,
      encoding: this.encoding,
      sample_rate: this.sampleRate.toString(),
      channels: this.channels.toString(),
      interim_results: 'true',
      punctuate: 'true',
      smart_format: 'true',
      endpointing: '500',
    });

    return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
  }

  private handleMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());

      if (message.channel?.alternatives?.[0]?.transcript) {
        const transcript = message.channel.alternatives[0].transcript;
        const isFinal = message.is_final || false;

        const result: DeepgramTranscript = {
          text: transcript,
          isFinal,
          confidence: message.channel.alternatives[0]?.confidence,
          words: message.channel?.alternatives?.[0]?.words,
        };

        this.emit('transcript', result);
      }
    } catch (error) {
      console.error('[Deepgram] Failed to parse message:', error);
    }
  }

  sendAudio(audioData: Buffer): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      this.socket.send(audioData);
    } catch (error) {
      console.error('[Deepgram] Failed to send audio:', error);
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Deepgram] Max reconnection attempts reached');
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[Deepgram] Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[Deepgram] Reconnection failed:', error);
      });
    }, delay);
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isConnected = false;
  }

  isReady(): boolean {
    return this.isConnected && this.socket !== null;
  }
}
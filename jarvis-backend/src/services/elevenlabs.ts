import { EventEmitter } from 'events';

export interface ElevenLabsConfig {
  apiKey: string;
  voiceId?: string;
  model?: string;
  stability?: number;
  similarityBoost?: number;
}

export interface AudioChunk {
  data: Buffer;
  isFinal: boolean;
}

export class ElevenLabsService extends EventEmitter {
  private apiKey: string;
  private voiceId: string;
  private model: string;
  private stability: number;
  private similarityBoost: number;
  private isStreaming: boolean = false;
  private queue: Buffer[] = [];
  private processing: boolean = false;

  constructor(config: ElevenLabsConfig) {
    super();
    this.apiKey = config.apiKey;
    this.voiceId = config.voiceId || 'pNInz6oncaO5iEyIKttX';
    this.model = config.model || 'eleven_multilingual_v2';
    this.stability = config.stability ?? 0.5;
    this.similarityBoost = config.similarityBoost ?? 0.8;
  }

  async speak(text: string): Promise<Buffer> {
    console.log('[ElevenLabs] 🎤 Generating speech...');

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream`;

    const payload = {
      text,
      model_id: this.model,
      voice_settings: {
        stability: this.stability,
        similarity_boost: this.similarityBoost,
      },
      output_format: 'mp3_44100_128',
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async stream(text: string): Promise<void> {
    if (this.isStreaming) {
      console.log('[ElevenLabs] Already streaming, queuing...');
      return;
    }

    this.isStreaming = true;
    console.log('[ElevenLabs] 🌊 Starting stream...');

    try {
      const audio = await this.speak(text);
      
      this.emit('audio', {
        data: audio,
        isFinal: true,
      } as AudioChunk);

    } catch (error) {
      console.error('[ElevenLabs] Stream error:', error);
      this.emit('error', error);
    } finally {
      this.isStreaming = false;
    }
  }

  async getAudioBuffer(text: string): Promise<Buffer> {
    return this.speak(text);
  }

  setVoice(voiceId: string): void {
    this.voiceId = voiceId;
    console.log(`[ElevenLabs] Voice changed to: ${voiceId}`);
  }

  isReady(): boolean {
    return !this.isStreaming;
  }

  close(): void {
    this.isStreaming = false;
    this.queue = [];
    this.processing = false;
    // Abort any in-flight fetch via stored AbortController
    // Note: To fully abort fetches, pass { signal: this.abortController.signal }
    // to fetch() in speak(). This is a shallow reset for now.
  }
}

let instance: ElevenLabsService | null = null;

export function initElevenLabsService(config: ElevenLabsConfig): ElevenLabsService {
  instance = new ElevenLabsService(config);
  return instance;
}

export function getElevenLabsService(): ElevenLabsService | null {
  return instance;
}
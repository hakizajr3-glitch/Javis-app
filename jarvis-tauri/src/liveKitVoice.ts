// LiveKit Voice Agent for Tauri
// Full real-time voice pipeline using LiveKit

import { Room, LocalAudioTrack, RemoteAudioTrack, AudioSource, TrackPublishOptions } from 'livekit-client';

interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
  roomName: string;
  participantName: string;
}

interface VoiceCallbacks {
  onStateChange: (state: string) => void;
  onTranscript: (text: string, isFinal: boolean) => void;
  onAIResponse: (text: string) => void;
  onError: (error: string) => void;
}

class LiveKitVoiceAgent {
  private config: LiveKitConfig;
  private callbacks: VoiceCallbacks;
  
  private room: Room | null = null;
  private localAudioTrack: LocalAudioTrack | null = null;
  private audioSource: AudioSource | null = null;
  private isConnected = false;
  
  private state: 'idle' | 'connecting' | 'listening' | 'speaking' | 'error' = 'idle';
  
  constructor(config: LiveKitConfig, callbacks: VoiceCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  async start(): Promise<void> {
    console.log('[LiveKit] ════════════════════════════════════════════════════');
    console.log('[LiveKit] 🚀 Starting LiveKit Voice Agent');
    console.log('[LiveKit] ════════════════════════════════════════════════════');
    
    try {
      this.setState('connecting');
      
      // Create room
      console.log('[LiveKit] Creating room connection...');
      this.room = new Room();
      
      // Set up event handlers
      this.setupRoomHandlers();
      
      // Connect to LiveKit
      console.log('[LiveKit] Connecting to:', this.config.url);
      await this.room.connect(
        this.config.url,
        this.config.apiKey,
        {
          secret: this.config.apiSecret,
          name: this.config.roomName,
          identity: this.config.participantName,
        }
      );
      
      console.log('[LiveKit] ✅ Connected to room:', this.config.roomName);
      this.isConnected = true;
      
      // Create and publish microphone track
      console.log('[LiveKit] Publishing microphone...');
      await this.publishMicrophone();
      
      this.setState('listening');
      console.log('[LiveKit] ✅ PIPELINE ACTIVE - Speak now!');
      console.log('[LiveKit] ════════════════════════════════════════════════════');
      
    } catch (error) {
      console.error('[LiveKit] ❌ Failed to start:', error);
      this.callbacks.onError(`Failed to connect: ${error}`);
      this.setState('error');
      throw error;
    }
  }

  private setupRoomHandlers(): void {
    if (!this.room) return;
    
    // Handle remote participants joining
    this.room.on('participantConnected', (participant) => {
      console.log('[LiveKit] Participant connected:', participant.identity);
    });
    
    // Handle track subscriptions (receiving audio from remote)
    this.room.on('trackSubscribed', (track, publication, participant) => {
      console.log('[LiveKit] Track subscribed:', track.kind, 'from', participant.identity);
      
      if (track.kind === 'audio' && track instanceof RemoteAudioTrack) {
        // Play remote audio (assistant's voice)
        console.log('[LiveKit] 🎤 Playing remote audio track...');
        const audioElement = track.attach();
        audioElement.play();
      }
    });
    
    // Handle disconnection
    this.room.on('disconnected', () => {
      console.log('[LiveKit] Disconnected from room');
      this.isConnected = false;
      this.setState('idle');
    });
    
    // Handle errors
    this.room.on('error', (error) => {
      console.error('[LiveKit] Room error:', error);
      this.callbacks.onError(`Room error: ${error}`);
    });
  }

  private async publishMicrophone(): Promise<void> {
    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      
      // Create audio track from stream
      this.localAudioTrack = LocalAudioTrack.fromMediaStream(stream);
      
      // Publish to room
      if (this.room) {
        await this.room.localParticipant.publishTrack(this.localAudioTrack, {
          name: 'microphone',
          dtx: true,
        });
        console.log('[LiveKit] ✅ Microphone published successfully');
      }
    } catch (error) {
      console.error('[LiveKit] ❌ Failed to publish microphone:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    console.log('[LiveKit] 🛑 Stopping LiveKit Voice Agent');
    
    // Stop and cleanup local track
    if (this.localAudioTrack) {
      this.localAudioTrack.stop();
      this.localAudioTrack = null;
    }
    
    // Disconnect from room
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
    
    this.isConnected = false;
    this.setState('idle');
    console.log('[LiveKit] ✅ Stopped');
  }

  private setState(state: typeof this.state): void {
    this.state = state;
    this.callbacks.onStateChange(state);
  }

  getState(): string {
    return this.state;
  }

  isActive(): boolean {
    return this.isConnected;
  }
}

// LiveKit configuration - set via environment variables
const LIVEKIT_CONFIG: LiveKitConfig = {
  url: '',
  apiKey: '',
  apiSecret: '',
  roomName: 'jarvis-voice-room',
  participantName: 'jarvis-client',
};

let liveKitAgent: LiveKitVoiceAgent | null = null;

export async function initLiveKitVoice(callbacks: VoiceCallbacks): Promise<void> {
  liveKitAgent = new LiveKitVoiceAgent(LIVEKIT_CONFIG, callbacks);
  return liveKitAgent.start();
}

export function getLiveKitAgent(): LiveKitVoiceAgent | null {
  return liveKitAgent;
}

export async function stopLiveKitVoice(): Promise<void> {
  if (liveKitAgent) {
    await liveKitAgent.stop();
    liveKitAgent = null;
  }
}
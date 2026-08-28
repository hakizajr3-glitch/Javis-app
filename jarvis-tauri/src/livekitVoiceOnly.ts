// ═══════════════════════════════════════════════════════════════════════════════
// 🔥 LIVEKIT-ONLY VOICE SYSTEM - Agent: Casey-2c7
// ═══════════════════════════════════════════════════════════════════════════════
// 
// CORE REQUIREMENT: ONLY LiveKit is used for ALL voice input and output.
// 
// FORBIDDEN (NEVER USE):
//   ❌ Web Speech API
//   ❌ MediaRecorder
//   ❌ External STT services (direct API calls)
//   ❌ External TTS services (direct API calls)
//   ❌ Browser speech synthesis
//   ❌ Any fallback voice systems
// 
// PERMITTED (ONLY THESE):
//   ✅ LiveKit microphone stream
//   ✅ LiveKit audio streaming
//   ✅ LiveKit voice playback
//   ✅ LiveKit real-time conversation flow
//
// BEHAVIOR: Continuous conversational AI that never stops listening.
//   1. Listen via LiveKit microphone stream
//   2. Detect user speech (via LiveKit agent VAD)
//   3. Process input (LiveKit agent does STT → LLM)
//   4. Generate response
//   5. Send audio response back through LiveKit
//   6. IMMEDIATELY return to listening (NO BREAKS)
//
// NO TERMINATION: The loop runs forever until user explicitly triggers TERMINATE.
//
// ═══════════════════════════════════════════════════════════════════════════════

import { 
  Room, 
  LocalAudioTrack, 
  RemoteAudioTrack, 
  RemoteTrackPublication,
  Track,
  RoomEvent,
  TrackPublication,
  Participant,
  ConnectionState 
} from 'livekit-client';

import { 
  AccessToken,
  VideoGrant,
} from 'livekit-server-sdk';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

interface VoiceCallbacks {
  onStateChange: (state: VoiceState) => void;
  onTranscript: (text: string, isFinal: boolean) => void;
  onAIResponse: (text: string) => void;
  onAudioLevel?: (level: number) => void;
  onError?: (error: string) => void;
  onConnectionChange?: (connected: boolean) => void;
}

type VoiceState = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking' | 'error';

interface LiveKitConfig {
  wsUrl: string;
  token: string;  // JWT token for authentication
  roomName: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIVEKIT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const LIVEKIT_CONFIG: LiveKitConfig = {
  wsUrl: 'wss://teat-marster-qk1ufthf.livekit.cloud',
  token: '',
  roomName: 'casey-voice-room',
};

const LIVEKIT_API_KEY = import.meta.env.VITE_LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = import.meta.env.VITE_LIVEKIT_API_SECRET || '';

const AGENT_NAME = 'Casey';
const AGENT_ID = 'CA_2kXC8LinoJpe';

// ═══════════════════════════════════════════════════════════════════════════════
// LIVEKIT-ONLY VOICE AGENT
// ═══════════════════════════════════════════════════════════════════════════════

class LiveKitOnlyVoiceAgent {
  private config: LiveKitConfig;
  private callbacks: VoiceCallbacks;
  
  private room: Room | null = null;
  private localAudioTrack: LocalAudioTrack | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;
  
  private state: VoiceState = 'idle';
  private isRunning = false;
  private isConnected = false;
  
  // Audio visualization
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animationFrame: number = 0;
  
  constructor(config: LiveKitConfig, callbacks: VoiceCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
    console.log('[LiveKit-Only] Agent created - NO FALLBACK SYSTEMS ENABLED');
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // START - The voice loop begins here and NEVER STOPS (until terminate)
  // ═════════════════════════════════════════════════════════════════════════════
  
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[LiveKit-Only] ⚠️ Already running');
      return;
    }
    
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log(`║     🔥 LIVEKIT-ONLY ${AGENT_NAME} VOICE SYSTEM STARTING              ║`);
    console.log('║                                                                ║');
    console.log(`║  🤖 Agent:          ${AGENT_NAME} (${AGENT_ID})              ║`);
    console.log('║  🎙️  Microphone:     LIVEKIT ONLY                             ║');
    console.log('║  📢  Audio Output:   LIVEKIT ONLY                             ║');
    console.log('║  🧠  STT Processing: LIVEKIT AGENT                            ║');
    console.log('║  🗣️  TTS Output:    LIVEKIT AGENT                            ║');
    console.log('║                                                                ║');
    console.log('║  ❌ NO Web Speech API    ❌ NO MediaRecorder                   ║');
    console.log('║  ❌ NO External STT      ❌ NO External TTS                    ║');
    console.log('║                                                                ║');
    console.log('║  🔄 LOOP: Listen → Process → Speak → Listen (FOREVER)         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    
    this.isRunning = true;
    
    try {
      this.setState('connecting');
      
      // Step 1: Connect to LiveKit room
      await this.connectToRoom();
      
      // Step 2: Publish microphone (input goes to LiveKit agent)
      await this.publishMicrophone();
      
      // Step 3: Start audio visualization for UI feedback
      this.startAudioVisualization();
      
      // Step 4: Set listening state - AGENT IS NOW ACTIVE
      this.setState('listening');
      
      console.log('[LiveKit-Only] ✅ VOICE LOOP ACTIVE - LISTENING FOREVER');
      console.log('[LiveKit-Only] 🎙️ Speak anytime - I am always listening...');
      console.log('');
      
    } catch (error) {
      console.error('[LiveKit-Only] ❌ Failed to start:', error);
      this.setState('error');
      this.callbacks.onError?.(String(error));
      
      // NEVER GIVE UP - Auto retry after 3 seconds
      console.log('[LiveKit-Only] 🔄 Retrying in 3 seconds...');
      setTimeout(() => {
        if (this.isRunning) {
          this.start();
        }
      }, 3000);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // CONNECT TO LIVEKIT ROOM
  // ═════════════════════════════════════════════════════════════════════════════
  
  private async connectToRoom(): Promise<void> {
    console.log('[LiveKit-Only] Connecting to LiveKit server...');
    
    // Create room with options optimized for voice
    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        dtx: true,  // Enable DTX for efficiency
        red: true,  // Enable redundancy for packet loss
        audioPreset: { maxBitrate: 32000 },
      },
    });
    
    // Set up all event handlers BEFORE connecting
    this.setupRoomHandlers();
    
    // Generate or fetch token (in production, get from your backend)
    const token = this.config.token || await this.generateToken();
    
    // Connect to LiveKit
    await this.room.connect(this.config.wsUrl, token);
    
    this.isConnected = true;
    console.log('[LiveKit-Only] ✅ Connected to room:', this.config.roomName);
    this.callbacks.onConnectionChange?.(true);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SETUP ROOM EVENT HANDLERS
  // ═════════════════════════════════════════════════════════════════════════════
  
  private setupRoomHandlers(): void {
    if (!this.room) return;
    
    // Connection state changes
    this.room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      console.log('[LiveKit-Only] Connection state:', state);
      
      if (state === ConnectionState.Disconnected) {
        this.isConnected = false;
        this.callbacks.onConnectionChange?.(false);
        
        // AUTO RECONNECT - NEVER STOP LISTENING
        if (this.isRunning) {
          console.log('[LiveKit-Only] 🔄 Connection lost - Reconnecting...');
          setTimeout(() => this.reconnect(), 2000);
        }
      }
    });
    
    // Track subscribed (receiving AI voice from agent)
    this.room.on(RoomEvent.TrackSubscribed, (
      track: Track,
      publication: RemoteTrackPublication,
      participant: Participant
    ) => {
      console.log('[LiveKit-Only] Track subscribed:', track.kind, 'from', participant.identity);
      
      if (track.kind === Track.Kind.Audio && track instanceof RemoteAudioTrack) {
        console.log('[LiveKit-Only] 🎤 AI audio track received - AGENT IS SPEAKING');
        
        // Attach and play the audio
        this.playRemoteAudio(track);
        
        // Update state - AGENT IS SPEAKING
        this.setState('speaking');
        
        // Note: Metadata would come from data channel, not track info
        // The AI transcript will be received via RoomEvent.DataReceived
      }
    });
    
    // Track unsubscribed (AI finished speaking)
    this.room.on(RoomEvent.TrackUnsubscribed, (
      track: Track,
      publication: RemoteTrackPublication,
      participant: Participant
    ) => {
      console.log('[LiveKit-Only] Track unsubscribed:', track.kind);
      
      if (track.kind === Track.Kind.Audio) {
        // AI FINISHED SPEAKING - IMMEDIATELY RETURN TO LISTENING
        console.log('[LiveKit-Only] ✓ AI finished - RETURNING TO LISTENING MODE');
        this.setState('listening');
        
        // Clean up audio element
        if (this.remoteAudioElement) {
          this.remoteAudioElement.pause();
          this.remoteAudioElement = null;
        }
      }
    });
    
    // Data messages from agent (transcripts, state updates)
    this.room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: Participant) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload));
        console.log('[LiveKit-Only] Data received:', data.type);
        
        switch (data.type) {
          case 'user_transcript':
            // User speech detected and transcribed
            this.callbacks.onTranscript(data.text, data.isFinal);
            if (data.isFinal) {
              console.log('[LiveKit-Only] 👤 User:', data.text);
              this.setState('processing');
            }
            break;
            
          case 'agent_transcript':
            // AI response text
            console.log('[LiveKit-Only] 🤖 Agent:', data.text);
            this.callbacks.onAIResponse(data.text);
            break;
            
          case 'agent_state':
            // Agent state update
            if (data.state === 'thinking') {
              this.setState('processing');
            } else if (data.state === 'speaking') {
              this.setState('speaking');
            } else if (data.state === 'listening') {
              this.setState('listening');
            }
            break;
            
          case 'error':
            console.error('[LiveKit-Only] Agent error:', data.message);
            // NEVER STOP - just log and continue listening
            this.setState('listening');
            break;
        }
      } catch (e) {
        console.error('[LiveKit-Only] Failed to parse data:', e);
      }
    });
    
    // Participant connected (the agent joined)
    this.room.on(RoomEvent.ParticipantConnected, (participant: Participant) => {
      console.log('[LiveKit-Only] Participant connected:', participant.identity);
    });
    
    // Errors
    this.room.on(RoomEvent.MediaDevicesError, (e: Error) => {
      console.error('[LiveKit-Only] Media device error:', e);
      this.callbacks.onError?.(`Microphone error: ${e.message}`);
    });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // PUBLISH MICROPHONE (INPUT TO LIVEKIT AGENT)
  // ═════════════════════════════════════════════════════════════════════════════
  
  private async publishMicrophone(): Promise<void> {
    console.log('[LiveKit-Only] Publishing microphone to LiveKit...');
    
    // Get microphone - THIS IS THE ONLY AUDIO INPUT METHOD
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 24000,
        channelCount: 1,
      },
      video: false,  // NO VIDEO - Voice only
    });
    
    // Create LocalAudioTrack from stream using the proper constructor
    const audioTrack = stream.getAudioTracks()[0];
    this.localAudioTrack = new LocalAudioTrack(audioTrack);
    
    // Publish to room - Audio goes to LiveKit agent for processing
    if (this.room && this.localAudioTrack) {
      await this.room.localParticipant.publishTrack(this.localAudioTrack);
    }
    
    console.log('[LiveKit-Only] ✅ Microphone published - Audio streaming to agent');
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // PLAY REMOTE AUDIO (AI VOICE OUTPUT FROM LIVEKIT)
  // ═════════════════════════════════════════════════════════════════════════════
  
  private playRemoteAudio(track: RemoteAudioTrack): void {
    // Create audio element for playback
    this.remoteAudioElement = track.attach();
    this.remoteAudioElement.autoplay = true;
    
    // Ensure it plays
    const playPromise = this.remoteAudioElement.play();
    if (playPromise) {
      playPromise.catch(err => {
        console.error('[LiveKit-Only] Audio play error:', err);
      });
    }
    
    console.log('[LiveKit-Only] 🔊 Playing AI voice...');
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // AUDIO VISUALIZATION (FOR UI FEEDBACK)
  // ═════════════════════════════════════════════════════════════════════════════
  
  private startAudioVisualization(): void {
    if (!this.localAudioTrack?.mediaStream) return;
    
    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.3;
    
    const source = this.audioContext.createMediaStreamSource(
      this.localAudioTrack.mediaStream
    );
    source.connect(this.analyser);
    
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    
    const visualize = () => {
      if (!this.isRunning) return;
      
      this.analyser!.getByteFrequencyData(dataArray);
      
      // Calculate audio level
      let sum = 0;
      let max = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
        if (dataArray[i] > max) max = dataArray[i];
      }
      const average = sum / dataArray.length;
      const normalized = Math.min(1, (average / 255) * 3);
      
      this.callbacks.onAudioLevel?.(normalized);
      
      this.animationFrame = requestAnimationFrame(visualize);
    };
    
    visualize();
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // RECONNECT (NEVER GIVE UP - ALWAYS STAY LISTENING)
  // ═════════════════════════════════════════════════════════════════════════════
  
  private async reconnect(): Promise<void> {
    console.log('[LiveKit-Only] 🔄 Reconnecting to maintain voice loop...');
    
    try {
      // Clean up existing
      await this.cleanup(false);  // Don't stop the loop
      
      // Reconnect
      await this.connectToRoom();
      await this.publishMicrophone();
      
      this.setState('listening');
      console.log('[LiveKit-Only] ✅ Reconnected - Voice loop restored');
      
    } catch (error) {
      console.error('[LiveKit-Only] Reconnect failed:', error);
      // Try again in 3 seconds
      setTimeout(() => this.reconnect(), 3000);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // STOP - ONLY CALLED WHEN USER EXPLICITLY TERMINATES
  // ═════════════════════════════════════════════════════════════════════════════
  
  async stop(): Promise<void> {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║     🛑 USER TERMINATED - STOPPING VOICE LOOP                   ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    
    this.isRunning = false;
    await this.cleanup(true);
  }

  private async cleanup(fullStop: boolean): Promise<void> {
    // Stop animation
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
    
    // Close audio context
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
    this.analyser = null;
    
    // Stop local track
    if (this.localAudioTrack) {
      this.localAudioTrack.stop();
      this.localAudioTrack = null;
    }
    
    // Stop remote audio
    if (this.remoteAudioElement) {
      this.remoteAudioElement.pause();
      this.remoteAudioElement = null;
    }
    
    // Disconnect from room
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
    
    this.isConnected = false;
    
    if (fullStop) {
      this.setState('idle');
      this.callbacks.onConnectionChange?.(false);
      console.log('[LiveKit-Only] ✅ Full stop complete');
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // STATE MANAGEMENT
  // ═════════════════════════════════════════════════════════════════════════════
  
  private setState(state: VoiceState): void {
    const prevState = this.state;
    this.state = state;
    
    // Log state transitions
    if (prevState !== state) {
      const emoji = {
        'idle': '⚪',
        'connecting': '🔄',
        'listening': '👂',
        'processing': '⚙️',
        'speaking': '🔊',
        'error': '❌'
      }[state];
      
      console.log(`[LiveKit-Only] ${emoji} State: ${prevState} → ${state}`);
    }
    
    this.callbacks.onStateChange(state);
  }

  getState(): VoiceState {
    return this.state;
  }

  isActive(): boolean {
    return this.isRunning;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // TOKEN GENERATION (For development - use server-side in production)
  // ═════════════════════════════════════════════════════════════════════════════
  
  private async generateToken(): Promise<string> {
    console.log('[LiveKit-Only] Generating LiveKit access token...');

    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      throw new Error(
        'LiveKit API key and secret are not configured. ' +
        'Set VITE_LIVEKIT_API_KEY and VITE_LIVEKIT_API_SECRET environment variables, ' +
        'or generate the token server-side and pass it to the config.'
      );
    }

    try {
      const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: 'jarvis-client',
        name: 'J.R.R.V.I.S. Desktop Client',
      });

      at.addGrant(new VideoGrant({
        roomJoin: true,
        room: LIVEKIT_CONFIG.roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      }));

      const token = await at.toJwt();
      console.log('[LiveKit-Only] Token generated successfully');
      return token;
    } catch (err) {
      console.error('[LiveKit-Only] Token generation error:', err);
      throw err;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

let liveKitVoiceAgent: LiveKitOnlyVoiceAgent | null = null;

export async function initLiveKitVoiceOnly(callbacks: VoiceCallbacks): Promise<void> {
  if (liveKitVoiceAgent?.isActive()) {
    console.log('[LiveKit-Only] Agent already running');
    return;
  }
  
  liveKitVoiceAgent = new LiveKitOnlyVoiceAgent(LIVEKIT_CONFIG, callbacks);
  return liveKitVoiceAgent.start();
}

export async function stopLiveKitVoiceOnly(): Promise<void> {
  if (liveKitVoiceAgent) {
    await liveKitVoiceAgent.stop();
    liveKitVoiceAgent = null;
  }
}

export function getLiveKitVoiceState(): VoiceState {
  return liveKitVoiceAgent?.getState() || 'idle';
}

export function isLiveKitVoiceActive(): boolean {
  return liveKitVoiceAgent?.isActive() || false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export type { VoiceCallbacks, VoiceState, LiveKitConfig };
export { LiveKitOnlyVoiceAgent };

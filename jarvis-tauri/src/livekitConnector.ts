/**
 * J.A.R.V.I.S. LiveKit Voice Connector
 * Full-duplex voice AI with instant barge-in
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { AccessToken } from 'livekit-server-sdk';

interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
  roomName?: string;
}

interface UseLiveKitVoiceOptions {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
  onSpeakingStateChange?: (speaking: boolean) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onAIResponse?: (text: string) => void;
}

// LiveKit credentials from .env
export const LIVEKIT_CONFIG: LiveKitConfig = {
  url: '',
  apiKey: '',
  apiSecret: '',
  roomName: 'jarvis-room',
};

// Generate JWT token for LiveKit connection
export async function generateLiveKitToken(
  participantName: string,
  roomName: string = LIVEKIT_CONFIG.roomName || 'jarvis-room'
): Promise<string> {
  const token = new AccessToken(
    LIVEKIT_CONFIG.apiKey,
    LIVEKIT_CONFIG.apiSecret,
    {
      identity: participantName,
      name: participantName,
    }
  );
  
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  
  // Token expires in 24 hours
  token.ttl = '24h';
  
  return await token.toJwt();
}

// React hook for LiveKit voice
export function useLiveKitVoice(options: UseLiveKitVoiceOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [connectionState, setConnectionState] = useState<string>('disconnected');
  const roomRef = useRef<any>(null);

  const connect = useCallback(async () => {
    try {
      console.log('[LiveKit] Connecting to room...');
      
      // Dynamic import to avoid SSR issues
      const { Room, RoomEvent } = await import('livekit-client');
      
      // Generate token
      const participantName = `user-${Date.now()}`;
      const token = await generateLiveKitToken(participantName);
      
      // Create room
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
        audioPlaybackDefaults: {
          echoCancellation: true,
        },
      });
      
      roomRef.current = room;
      
      // Handle connection events
      room.on(RoomEvent.Connected, () => {
        console.log('[LiveKit] ✅ Connected');
        setIsConnected(true);
        setConnectionState('connected');
        options.onConnected?.();
      });
      
      room.on(RoomEvent.Disconnected, () => {
        console.log('[LiveKit] 🔌 Disconnected');
        setIsConnected(false);
        setConnectionState('disconnected');
        options.onDisconnected?.();
      });
      
      room.on(RoomEvent.Disconnected, () => {
        console.log('[LiveKit] 🔌 Disconnected');
        setIsConnected(false);
        setConnectionState('disconnected');
        options.onDisconnected?.();
      });
      
      room.on(RoomEvent.MediaDevicesError, (error) => {
        console.error('[LiveKit] ❌ Media devices error:', error);
        options.onError?.(error);
      });
      
      // Handle AI speaking state
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === 'audio' && participant.isAgent) {
          console.log('[LiveKit] 🤖 AI started speaking');
          setIsSpeaking(true);
          options.onSpeakingStateChange?.(true);
        }
      });
      
      room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        if (track.kind === 'audio' && participant.isAgent) {
          console.log('[LiveKit] 🤖 AI stopped speaking');
          setIsSpeaking(false);
          options.onSpeakingStateChange?.(false);
        }
      });
      
      // Connect to room
      await room.connect(LIVEKIT_CONFIG.url, token);
      console.log('[LiveKit] 🎙️ Connected to LiveKit room');
      
    } catch (error) {
      console.error('[LiveKit] ❌ Connection failed:', error);
      options.onError?.(error as Error);
    }
  }, [options]);

  const disconnect = useCallback(() => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    setIsConnected(false);
    setConnectionState('disconnected');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
      }
    };
  }, []);

  return {
    isConnected,
    isSpeaking,
    connectionState,
    connect,
    disconnect,
    room: roomRef.current,
  };
}

// LiveKit status component
export const LiveKitStatus: React.FC<{
  isConnected: boolean;
  isSpeaking: boolean;
}> = ({ isConnected, isSpeaking }) => {
  return (
    <div className="fixed bottom-2 left-2 flex items-center gap-2 px-3 py-1.5 rounded-lg pointer-events-none"
         style={{ background: 'rgba(0,20,30,0.9)', border: '1px solid rgba(0,212,255,0.2)' }}>
      <span className="flex items-center gap-1 text-[9px] font-mono">
        <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
        <span style={{ color: isConnected ? '#00ff88' : '#ff4444' }}>LiveKit</span>
      </span>
      {isSpeaking && (
        <span className="flex items-center gap-1 text-[9px] font-mono">
          <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
          <span style={{ color: '#00d4ff' }}>AI SPEAKING</span>
        </span>
      )}
    </div>
  );
};

export default {
  useLiveKitVoice,
  generateLiveKitToken,
  LiveKitStatus,
  LIVEKIT_CONFIG,
};
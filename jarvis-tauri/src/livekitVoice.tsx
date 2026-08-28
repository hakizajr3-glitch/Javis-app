/**
 * J.A.R.V.I.S. LiveKit Voice Connector
 * Connects the Tauri app to LiveKit for real-time voice AI
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useRoomContext, useTracks } from '@livekit/components-react';
import { Track, LocalTrackPublication, RemoteTrackPublication, ConnectionState } from 'livekit-client';
import { AccessToken } from 'livekit-server-sdk';

interface LiveKitVoiceConfig {
  serverUrl: string;
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
}

export function useLiveKitVoice(config: LiveKitVoiceConfig, options: UseLiveKitVoiceOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);

  const generateToken = useCallback(async (participantName: string): Promise<string> => {
    const token = new AccessToken(config.apiKey, config.apiSecret, {
      identity: participantName,
      name: participantName,
    });
    
    token.addGrant({
      roomJoin: true,
      room: config.roomName || 'jarvis-room',
      canPublish: true,
      canSubscribe: true,
    });
    
    return await token.toJwt();
  }, [config]);

  return {
    isConnected,
    isSpeaking,
    connectionState,
    generateToken,
  };
}

// Component to render inside LiveKitRoom
export const LiveKitVoiceHandler: React.FC<{
  onSpeakingStateChange?: (speaking: boolean) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
}> = ({ onSpeakingStateChange, onTranscript }) => {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  
  useEffect(() => {
    const handleConnectionStateChange = (state: ConnectionState) => {
      console.log('[LiveKit] Connection state:', state);
    };
    
    const handleParticipantSpeaking = (speaking: boolean) => {
      console.log('[LiveKit] Speaking:', speaking);
      onSpeakingStateChange?.(speaking);
    };
    
    room.on('connectionStateChanged', handleConnectionStateChange);
    localParticipant.on('speakingChanged', handleParticipantSpeaking);
    
    return () => {
      room.off('connectionStateChanged', handleConnectionStateChange);
      localParticipant.off('speakingChanged', handleParticipantSpeaking);
    };
  }, [room, localParticipant, onSpeakingStateChange]);

  return (
    <>
      <RoomAudioRenderer />
    </>
  );
};

// Token generation endpoint (call your backend)
export async function getLiveKitToken(
  serverUrl: string,
  roomName: string,
  participantName: string
): Promise<string> {
  const response = await fetch(`${serverUrl}/api/livekit-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomName, participantName }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to get LiveKit token');
  }
  
  const { token } = await response.json();
  return token;
}
// ═══════════════════════════════════════════════════════════════════════════════
// 🔥 LIVEKIT INTEGRATION - Connect LiveKit Voice to CenterHub UI
// ═══════════════════════════════════════════════════════════════════════════════
//
// This module provides the bridge between the LiveKit-only voice system
// and the CenterHub UI components.
//
// Usage:
//   import { initLiveKitVoice, stopLiveKitVoice } from './livekitIntegration';
//   await initLiveKitVoice({ onStateChange, onTranscript, onAIResponse });
//
// ═══════════════════════════════════════════════════════════════════════════════

import { initLiveKitVoiceOnly, stopLiveKitVoiceOnly, getLiveKitVoiceState } from './livekitVoiceOnly';

export type VoiceState = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking' | 'error';

interface VoiceCallbacks {
  onStateChange: (state: VoiceState) => void;
  onTranscript: (text: string, isFinal: boolean) => void;
  onAIResponse: (text: string) => void;
  onAudioLevel?: (level: number) => void;
  onError?: (error: string) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INITIALIZE LIVEKIT VOICE
// ═══════════════════════════════════════════════════════════════════════════════

export async function initLiveKitVoice(callbacks: VoiceCallbacks): Promise<void> {
  console.log('[LiveKit Integration] Initializing LiveKit voice system...');
  
  try {
    await initLiveKitVoiceOnly({
      onStateChange: (state) => {
        console.log('[LiveKit Integration] State:', state);
        callbacks.onStateChange(state as VoiceState);
      },
      onTranscript: (text, isFinal) => {
        console.log('[LiveKit Integration] Transcript:', text.substring(0, 50), isFinal ? '(final)' : '(interim)');
        callbacks.onTranscript(text, isFinal);
      },
      onAIResponse: (text) => {
        console.log('[LiveKit Integration] AI Response:', text.substring(0, 50));
        callbacks.onAIResponse(text);
      },
      onAudioLevel: (level) => {
        callbacks.onAudioLevel?.(level);
      },
      onError: (error) => {
        console.error('[LiveKit Integration] Error:', error);
        callbacks.onError?.(error);
      },
      onConnectionChange: (connected) => {
        console.log('[LiveKit Integration] Connection:', connected ? 'connected' : 'disconnected');
      }
    });
    
    console.log('[LiveKit Integration] ✅ Voice system initialized');
  } catch (error) {
    console.error('[LiveKit Integration] Failed to initialize:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STOP LIVEKIT VOICE
// ═══════════════════════════════════════════════════════════════════════════════

export async function stopLiveKitVoice(): Promise<void> {
  console.log('[LiveKit Integration] Stopping voice system...');
  await stopLiveKitVoiceOnly();
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET CURRENT STATE
// ═══════════════════════════════════════════════════════════════════════════════

export function getVoiceState(): VoiceState {
  return getLiveKitVoiceState() as VoiceState;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK IF ACTIVE
// ═══════════════════════════════════════════════════════════════════════════════

export function isVoiceActive(): boolean {
  const state = getVoiceState();
  return state !== 'idle' && state !== 'error';
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export type { VoiceCallbacks };

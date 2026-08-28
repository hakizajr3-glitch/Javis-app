import WebSocket from 'ws';
import { DeepgramService } from '../services/deepgram.js';
import { NIMService, Message, LLMResponse } from '../services/nim.js';
import { ElevenLabsService } from '../services/elevenlabs.js';
import { SessionManager } from '../memory/sessionManager.js';

interface ConnectionState {
  deepgram: DeepgramService | null;
  nim: NIMService;
  eleven: ElevenLabsService;
  isAudioMode: boolean;
  currentTranscript: string;
}

const NIM_CONFIG = {
  baseUrl: process.env.NIM_BASE_URL || 'https://integrate.api.nvidia.com',
  apiKey: process.env.NIM_API_KEY || '',
  model: process.env.NIM_MODEL || 'nvidia/llama-3.1-nemotron-70b-instruct',
};

const ELEVENLABS_CONFIG = {
  apiKey: process.env.ELEVENLABS_API_KEY || '',
  voiceId: process.env.ELEVENLABS_VOICE_ID,
};

export async function handleConnection(
  ws: WebSocket,
  sessionId: string,
  sessionManager: SessionManager
): Promise<void> {
  console.log(`[Handler] Setting up connection for ${sessionId}`);

  const state: ConnectionState = {
    deepgram: null,
    nim: new NIMService(NIM_CONFIG),
    eleven: new ElevenLabsService(ELEVENLABS_CONFIG),
    isAudioMode: false,
    currentTranscript: '',
  };

  ws.on('message', async (data: WebSocket.Data) => {
    try {
      const message = JSON.parse(data.toString());
      await handleMessage(ws, message, sessionId, sessionManager, state);
    } catch (error) {
      if (data instanceof Buffer) {
        await handleAudio(ws, data, sessionId, sessionManager, state);
      } else {
        console.error('[Handler] Invalid message:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    }
  });

  ws.on('close', () => {
    console.log(`[Handler] Connection closed for ${sessionId}`);
    state.deepgram?.disconnect();
    state.eleven.close?.();
  });

  ws.send(JSON.stringify({ 
    type: 'connected', 
    sessionId,
    message: 'J.A.R.V.I.S. is ready' 
  }));
}

async function handleMessage(
  ws: WebSocket,
  message: Record<string, unknown>,
  sessionId: string,
  sessionManager: SessionManager,
  state: ConnectionState
): Promise<void> {
  const { type } = message;

  switch (type) {
    case 'start_audio':
      await startAudioMode(ws, sessionId, state);
      break;
      
    case 'stop_audio':
      await stopAudioMode(ws, sessionId, state);
      break;
      
    case 'text':
      await handleTextMessage(
        ws,
        message.content as string,
        sessionId,
        sessionManager,
        state
      );
      break;
      
    case 'transcript':
      state.currentTranscript = message.text as string;
      break;
      
    case 'user_command':
      const commandPayload = message.payload as Record<string, unknown> || {};
      const commandText = (commandPayload.command || message.command || '') as string;
      if (commandText) {
        await handleTextMessage(ws, commandText, sessionId, sessionManager, state);
      }
      break;
      
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
      
    default:
      console.log(`[Handler] Unknown message type: ${type}, payload keys: ${Object.keys(message.payload || {}).join(',')}`);
  }
}

async function startAudioMode(
  ws: WebSocket,
  sessionId: string,
  state: ConnectionState
): Promise<void> {
  console.log('[Handler] Starting audio mode...');
  
  state.isAudioMode = true;
  state.deepgram = new DeepgramService({
    apiKey: process.env.DEEPGRAM_API_KEY || '',
  });

  try {
    await state.deepgram.connect();
    
    state.deepgram.on('transcript', (result) => {
      ws.send(JSON.stringify({
        type: 'transcript',
        text: result.text,
        isFinal: result.isFinal,
      }));

      if (result.isFinal && result.text.trim()) {
        state.currentTranscript = result.text;
        ws.send(JSON.stringify({ type: 'speech_final', text: result.text }));
      } else if (!result.isFinal) {
        ws.send(JSON.stringify({ type: 'speech_partial', text: result.text }));
      }
    });
    
    ws.send(JSON.stringify({ type: 'audio_started' }));
    
  } catch (error) {
    console.error('[Handler] Failed to start audio mode:', error);
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Failed to start audio capture' 
    }));
  }
}

async function stopAudioMode(
  ws: WebSocket,
  sessionId: string,
  state: ConnectionState
): Promise<void> {
  console.log('[Handler] Stopping audio mode...');
  
  state.isAudioMode = false;
  
  if (state.deepgram) {
    await state.deepgram.disconnect();
    state.deepgram = null;
  }
  
  ws.send(JSON.stringify({ type: 'audio_stopped' }));
}

async function handleAudio(
  ws: WebSocket,
  audioData: Buffer,
  sessionId: string,
  sessionManager: SessionManager,
  state: ConnectionState
): Promise<void> {
  if (!state.isAudioMode || !state.deepgram) {
    return;
  }

  state.deepgram.sendAudio(audioData);
}

async function handleTextMessage(
  ws: WebSocket,
  text: string,
  sessionId: string,
  sessionManager: SessionManager,
  state: ConnectionState
): Promise<void> {
  console.log(`[Handler] Text message: ${text}`);

  sessionManager.addMessage(sessionId, {
    role: 'user',
    content: text,
  });

  ws.send(JSON.stringify({ type: 'thinking' }));

  try {
    const messages = sessionManager.getMessages(sessionId);
    const response: LLMResponse = await state.nim.chat(messages, sessionId);

    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const toolCall of response.toolCalls) {
        ws.send(JSON.stringify({ 
          type: 'tool_call', 
          tool: toolCall.name,
          args: toolCall.arguments,
        }));

        const toolResult = await state.nim.executeTool(
          toolCall.name,
          toolCall.arguments
        );

        sessionManager.addMessage(sessionId, {
          role: 'assistant',
          content: '',
          name: toolCall.name,
          tool_call_id: toolCall.id,
        });

        sessionManager.addMessage(sessionId, {
          role: 'tool',
          content: toolResult,
          name: toolCall.name,
          tool_call_id: toolCall.id,
        });
      }

      const followUp = await state.nim.chat(
        sessionManager.getMessages(sessionId),
        sessionId
      );
      response.content = followUp.content;
    }

    sessionManager.addMessage(sessionId, {
      role: 'assistant',
      content: response.content,
    });

    // Send dual-format response: flat text for raw consumers, payload for frontend React components
    ws.send(JSON.stringify({ 
      type: 'response', 
      payload: { response: response.content },
      text: response.content 
    }));

    // Try to generate and send audio, but don't fail if it errors
    try {
      const audio = await state.eleven.getAudioBuffer(response.content);
      ws.send(JSON.stringify({ 
        type: 'audio', 
        data: audio.toString('base64'),
        format: 'mp3',
      }));
    } catch (audioErr) {
      console.log('[Handler] Audio synthesis skipped (frontend will use browser TTS):', audioErr);
    }

  } catch (error) {
    console.error('[Handler] Error processing message:', error);
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Failed to process message' 
    }));
  }
}
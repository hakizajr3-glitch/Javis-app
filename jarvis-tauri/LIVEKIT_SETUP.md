# 🔥 LiveKit-Only JARVIS Voice System

This is a **LIVEKIT-ONLY** voice system that removes all other audio methods. 

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE (Tauri)                          │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     │
│  │   Microphone    │────▶│  LiveKit Client │────▶│ LiveKit Cloud/  │     │
│  │   (Web API)     │     │  (livekit-      │     │ Self-Hosted     │     │
│  └─────────────────┘     │   client)         │     └─────────────────┘     │
│  ┌─────────────────┐     └─────────────────┘              │              │
│  │  Audio Output   │◀─────────────────────────────────────┘              │
│  │  (LiveKit)      │                                                   │
│  └─────────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ WebRTC
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      PYTHON AGENT (LiveKit Agents SDK)                  │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     │
│  │ LiveKit Agent   │────▶│  Deepgram STT   │────▶│  OpenAI LLM     │     │
│  │ (livekit-       │     │  (Speech-to-    │     │  (GPT-4o-mini)  │     │
│  │  agents)        │◀────│   Text)         │◀────│                 │     │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘     │
│         │                                              │                │
│         │                                              ▼                │
│         │                                     ┌─────────────────┐       │
│         │                                     │ ElevenLabs TTS  │       │
│         │                                     │  (Text-to-      │       │
│         │                                     │   Speech)       │       │
│         │                                     └─────────────────┘       │
│         │                                              │                │
│         └──────────────────────────────────────────────┘                │
│                    (Audio response back to user)                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## What Changed?

### ❌ REMOVED (FORBIDDEN)
- Web Speech API (`SpeechRecognition`, `speechSynthesis`)
- MediaRecorder API
- Direct ElevenLabs API calls from client
- Direct STT API calls from client
- Browser TTS fallbacks

### ✅ ONLY PERMITTED
- LiveKit for microphone input
- LiveKit for audio output
- LiveKit data channels for transcripts
- LiveKit Agents SDK for STT/LLM/TTS pipeline

## Files

| File | Purpose |
|------|---------|
| `src/livekitVoiceOnly.ts` | **NEW** - LiveKit-only voice client |
| `livekit_agent_v2.py` | **NEW** - Python agent with full pipeline |
| `src/components/CenterHubExact.tsx` | **UPDATED** - Uses LiveKit-only voice |
| `src/elevenLabsVoice.ts` | **DEPRECATED** - Old voice system (kept for reference) |

## Setup Instructions

### 1. Install Python Dependencies

```bash
cd /Users/innocekaiser/Documents/J.R.R.V.I.S/jarvis-tauri
pip install livekit livekit-agents livekit-plugins-openai livekit-plugins-silero livekit-plugins-deepgram livekit-plugins-elevenlabs
```

### 2. Set Environment Variables

```bash
export OPENAI_API_KEY="your-openai-key"
export ELEVENLABS_API_KEY="your-elevenlabs-key"
export DEEPGRAM_API_KEY="your-deepgram-key"  # Optional but recommended
export LIVEKIT_URL="wss://your-livekit-server.cloud"
export LIVEKIT_API_KEY="your-api-key"
export LIVEKIT_API_SECRET="your-api-secret"
```

### 3. Start the LiveKit Agent

```bash
python livekit_agent_v2.py
```

The agent will:
1. Connect to the LiveKit room
2. Wait for the Tauri client to join
3. Start the continuous voice loop
4. Process: STT → LLM → TTS → Speak → Listen (forever)

### 4. Start the Tauri App

```bash
npm run tauri dev
```

### 5. Initialize Voice

Click the **"INITIALIZE"** button in the UI. The system will:
1. Connect to LiveKit
2. Publish the microphone
3. Subscribe to the agent's audio
4. Start continuous listening

## How It Works

### Continuous Voice Loop

```
┌─────────────┐
│  LISTENING  │◀──────────────────────────────────┐
└──────┬──────┘                                    │
       │                                           │
       ▼                                           │
┌─────────────┐     ┌─────────────┐     ┌────────┴────┐
│  SPEECH     │────▶│   STT       │────▶│    LLM      │
│  DETECTED   │     │  (Deepgram) │     │  (GPT-4o)   │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │    TTS      │
                                        │ (ElevenLabs)│
                                        └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │   SPEAK     │
                                        │  (Audio out)│
                                        └─────────────┘
```

### State Machine

| State | Description |
|-------|-------------|
| `idle` | Not connected |
| `connecting` | Connecting to LiveKit |
| `listening` | Always listening for user speech |
| `processing` | STT → LLM pipeline running |
| `speaking` | Playing TTS response |

The loop **NEVER STOPS** automatically:
- After speaking → immediately back to listening
- On errors → retries and continues
- On disconnect → auto-reconnects

### Data Flow

1. **User speaks** → Microphone captured by LiveKit client
2. **Audio streamed** → To Python agent via WebRTC
3. **STT processes** → Transcribed text sent to LLM
4. **LLM generates** → Response text
5. **TTS converts** → Response to audio
6. **Audio streamed** → Back to Tauri client
7. **Playback** → User hears response
8. **Back to step 1** → Immediately listening again

## Configuration

### LiveKit Cloud (Recommended for testing)

1. Sign up at [livekit.io](https://livekit.io)
2. Create a project
3. Get your API keys
4. Update the credentials in both files

### Self-Hosted LiveKit

For production, self-host LiveKit:
```bash
docker run -p 7880:7880 -p 7881:7881 livekit/livekit-server
```

## Troubleshooting

### Agent won't connect
- Check LiveKit credentials
- Verify network connectivity
- Check LiveKit Cloud dashboard

### No audio output
- Check audio permissions in Tauri
- Verify TTS API keys
- Check agent logs for errors

### Echo or feedback
- Use headphones
- Enable echo cancellation (already configured)

### Latency issues
- Use geographically close LiveKit servers
- Check internet connection
- Reduce TTS voice quality for faster response

## API Keys Needed

| Service | Purpose | Get From |
|---------|---------|----------|
| LiveKit | WebRTC signaling | [livekit.io](https://livekit.io) |
| OpenAI | LLM (GPT-4o) | [platform.openai.com](https://platform.openai.com) |
| ElevenLabs | TTS voice | [elevenlabs.io](https://elevenlabs.io) |
| Deepgram | STT (optional) | [deepgram.com](https://deepgram.com) |

## Next Steps

1. **Test the voice loop** - Say "Hello JARVIS" and verify response
2. **Check transcripts** - Look at browser console and agent logs
3. **Monitor states** - UI orb should animate with each state change
4. **Try interruptions** - Speak while agent is responding
5. **Test persistence** - Leave running for extended period

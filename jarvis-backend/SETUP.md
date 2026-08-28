# J.A.R.V.I.S. Voice AI Backend Setup

## Prerequisites

### Required API Keys

1. **NVIDIA NIM** - Get from https://build.nvidia.com/
   - Create account
   - Select a model (e.g., Llama 3.1 Nemotron)
   - Get your API key

2. **Deepgram STT** - Get from https://console.deepgram.com/
   - Create account
   - Create project
   - Copy API key

3. **ElevenLabs TTS** - Get from https://elevenlabs.io/
   - Create account
   - Copy API key from profile
   - Optionally create custom voice

## Installation

```bash
cd /Users/innocekaiser/Documents/J.R.R.V.I.S/jarvis-backend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
```

## Environment Variables

```env
# Server
WS_PORT=8000
MAX_SESSIONS=50

# NVIDIA NIM
NIM_BASE_URL=https://integrate.api.nvidia.com
NIM_API_KEY=your_nvidia_api_key
NIM_MODEL=nvidia/llama-3.1-nemotron-70b-instruct

# Deepgram
DEEPGRAM_API_KEY=your_deepgram_key

# ElevenLabs
ELEVENLABS_API_KEY=your_elevenlabs_key
ELEVENLABS_VOICE_ID=pNInz6oncaO5iEyIKttX
```

## Running the Backend

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm run start
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         J.A.R.V.I.S. ARCHITECTURE                    │
└─────────────────────────────────────────────────────────────────────┘

┌──────────┐      ┌──────────────┐      ┌──────────────┐
│ Frontend │─────▶│  WebSocket   │─────▶│   Deepgram   │
│ (React)  │      │   Server     │      │    (STT)     │
└──────────┘      │  (Port 8000) │      └──────────────┘
                 └──────┬────────┘
                        │
                        ▼
                 ┌──────────────┐
                 │ NVIDIA NIM   │
                 │    (LLM)     │
                 └──────┬────────┘
                        │
                        ▼
                 ┌──────────────┐
                 │ ElevenLabs   │
                 │    (TTS)     │
                 └──────┬────────┘
                        │
                        ▼
                 ┌──────────────┐
                 │   Frontend   │
                 │  (Audio Out) │
                 └──────────────┘
```

### Pipeline Steps:

1. **User speaks** → Microphone captures audio in frontend
2. **Audio sent** → WebSocket sends audio chunks to backend
3. **STT** → Deepgram streams transcript back
4. **LLM** → NVIDIA NIM processes with conversation memory
5. **Function Calling** → Executes tools (weather, calendar, search)
6. **TTS** → ElevenLabs converts response to audio
7. **Playback** → Frontend plays audio instantly

## WebSocket Protocol

### Messages from Frontend:

```json
{ "type": "start_audio" }
{ "type": "stop_audio" }
{ "type": "text", "content": "Hello JARVIS" }
{ "type": "ping" }
```

### Messages from Backend:

```json
{ "type": "connected", "sessionId": "...", "message": "J.A.R.V.I.S. is ready" }
{ "type": "audio_started" }
{ "type": "transcript", "text": "...", "isFinal": false }
{ "type": "speech_final", "text": "..." }
{ "type": "thinking" }
{ "type": "response", "text": "..." }
{ "type": "speaking" }
{ "type": "audio", "data": "...", "format": "mp3" }
{ "type": "speech_complete" }
{ "type": "error", "message": "..." }
```

## Function Calling

The LLM has access to these tools:

- `get_weather(location)` - Get weather for a location
- `schedule_meeting(time, title, duration)` - Schedule a meeting
- `search_web(query)` - Search the web

## Performance Targets

- **STT Latency**: <500ms for partial results
- **Full Response**: <1.5s target
- **Audio Streaming**: Chunked for instant playback

## Troubleshooting

### Backend won't start
- Check all API keys in `.env`
- Verify ports are available: `lsof -i :8000`

### No audio response
- Check ElevenLabs API key
- Verify voice ID is valid

### STT not working
- Check Deepgram API key
- Verify account has credits

### LLM errors
- Check NVIDIA NIM API key
- Verify model name is correct

## Architecture

```
jarvis-backend/
├── src/
│   ├── index.ts              # Entry point
│   ├── services/
│   │   ├── deepgram.ts       # Streaming STT
│   │   ├── nim.ts           # NVIDIA NIM LLM
│   │   └── elevenlabs.ts     # Streaming TTS
│   ├── websocket/
│   │   └── handler.ts        # WebSocket message handling
│   └── memory/
│       └── sessionManager.ts # Session & conversation memory
├── .env.example              # Environment template
├── package.json
└── SETUP.md                  # This file
```

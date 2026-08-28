# JARVIS Project Note

## What is JARVIS?
JARVIS is a local, desktop-based AI assistant inspired by Iron Man's JARVIS, built as a clone of the Stonic AI product. It is a "local-first" app that runs directly on your computer (Windows with macOS/Linux support), designed to act as a personal AI agent with deep access to your operating system, browser, and files. Unlike general chatbots that only talk, JARVIS is built to take action: it can control your PC, automate tasks, and interact with almost everything on your desktop. It uses a modern, futuristic glassmorphism (translucent, blurred glass-style) user interface.

**Core Philosophy**: "Your computer runs itself." — JARVIS is designed to be proactive, not just reactive.

## What can JARVIS do?

### 1. Voice Interaction (Core Feature)
- **Speech-to-Text (STT)**: Deepgram-powered real-time voice transcription with <500ms latency
- **Text-to-Speech (TTS)**: ElevenLabs natural voice synthesis for spoken responses
- **Continuous Voice Loop**: Always-listening mode that immediately returns to listening after responding
- **LiveKit Integration**: WebRTC-based voice pipeline (jarvis-tauri build) for low-latency audio streaming
- **State Machine**: Cycles through idle → connecting → listening → processing → speaking states automatically

### 2. System Control
- **File Management**: Create, edit, delete, and organize files and folders
- **App Control**: Launch, manage, and close applications via system commands
- **Process Management**: Control system processes and monitor execution
- **OS-Level Operations**: Direct integration with Windows/macOS/Linux system APIs

### 3. Browser Automation (Playwright)
- Navigate websites, fill forms, extract web data
- Hands-free web searches and data collection
- Take screenshots of web content
- Automate repetitive web-based tasks

### 4. AI Intelligence & Reasoning
- **LLM Integration**: NVIDIA NIM (Llama 3.1 Nemotron 70B), OpenAI GPT-4o, and configurable models
- **Function Calling**: Execute tools like `get_weather()`, `schedule_meeting()`, `search_web()`
- **Deep Reasoning Mode**: Toggle for complex, multi-step task processing
- **Conversation Memory**: Maintains context across sessions with session management
- **Streaming Responses**: Real-time AI response streaming for faster interactions

### 5. Multi-Agent Orchestration (jarvis-os)
- **Commander Agent**: Parses natural language, classifies intent, extracts entities
- **Planner Agent**: Automatically decomposes complex tasks into executable steps with dependency graphs
- **Execution Agents** (run in parallel):
  - File Agent (file system operations)
  - Browser Agent (Playwright web automation)
  - System Agent (OS-level operations)
  - Communication Agent (email, messaging, notifications)
- **Observer Agent**: Monitors execution in real-time via screenshots and state tracking, detects errors automatically
- **Memory Agent**: Stores episodic (experiences), semantic (knowledge), and procedural (workflows) memories
- **Reflection Agent**: Reviews executions, identifies optimizations, self-improves strategies

### 6. Visual Intelligence
- **Screen Capture**: Real-time screenshot capability (Electron desktopCapturer / Playwright)
- **Vision Analysis**: AI-powered image analysis via GPT-4V or similar vision models
- **Diagram Generation**: Create mind maps and flowcharts (Mermaid.js integration)
- **Object/Text Recognition**: Camera and screen-based recognition

### 7. Personalization & Memory
- **Memory Bank**: SQLite + ChromaDB (vector store) for user preferences, conversation history, learned behaviors
- **Context Awareness**: Remembers past workflows (e.g., "Weekly report = Analytics + CRM + Slack summary")
- **Personalized Responses**: Adapts to user patterns over time

### 8. Media & Widgets
- Integrated music/video player (YouTube, local files)
- Today's Headlines widget (news, weather, stock updates)
- Visual Intelligence Hub for diagrams
- Real-time System Transcript log

### 9. Communication
- WhatsApp Web integration for automated messaging
- Email notifications and messaging support
- WebSocket real-time communication between frontend and backend

## Features You Planned to Build

### Architecture Overview
```
User Command → Commander Agent (intent) → Planner Agent (task decomposition)
     ↓
Execution Agents (parallel: File / Browser / System / Communication)
     ↓
Observer Agent (real-time monitoring) → Memory Agent (learning)
     ↓
Reflection Agent (self-improvement) → Response Synthesis
```

### Five Implementation Builds

#### 1. jarvis-backend (Voice AI Backend)
- **Tech**: Node.js + TypeScript + WebSocket (ws)
- **Purpose**: Production-ready voice AI pipeline
- **Pipeline**: Microphone → WebSocket → Deepgram STT → NVIDIA NIM LLM → ElevenLabs TTS → Audio playback
- **Features**:
  - WebSocket server on port 8000 with session management (max 50 sessions)
  - Streaming STT with partial results (<500ms latency)
  - Function calling (weather, calendar, web search)
  - Conversation memory per session
  - Chunked audio streaming for instant playback
- **API Keys Needed**: NVIDIA NIM, Deepgram, ElevenLabs

#### 2. jarvis-electron (Electron Desktop App)
- **Tech**: Electron + Node.js
- **Purpose**: Initial Electron-based desktop wrapper
- **Status**: Early stage (only package.json and node_modules)

#### 3. jarvis-tauri (Tauri Desktop App with LiveKit)
- **Tech**: Tauri v2 + React + TypeScript + Vite + Tailwind CSS
- **Purpose**: Lightweight, secure desktop app (Tauri is more efficient than Electron)
- **Key Feature**: **LiveKit-only voice system** (no Web Speech API, no MediaRecorder)
  - LiveKit Cloud/Self-hosted WebRTC signaling
  - Python LiveKit Agent (livekit_agent_v2.py) handles: STT → LLM → TTS pipeline
  - Continuous voice loop: Listening → Speech Detected → STT → LLM → TTS → Speak → Listen (never stops)
  - State machine: idle → connecting → listening → processing → speaking
  - Auto-reconnects on disconnect, retries on errors
- **Frontend**: React with lucide-react icons, @livekit/components-react
- **API Keys Needed**: OpenAI (GPT-4o), ElevenLabs, Deepgram, LiveKit

#### 4. jarvis-os (Multi-Agent OS Layer)
- **Tech**: Electron + React (frontend) + Python FastAPI (backend) + Playwright
- **Purpose**: "Category-defining autonomous desktop OS layer" — goes beyond traditional assistants
- **Six Core Agents**:
  1. Commander (intent understanding)
  2. Planner (task decomposition with dependency graphs)
  3. Execution Agents (File, Browser, System, Communication — run in parallel)
  4. Observer (real-time state monitoring via screenshots)
  5. Memory (episodic + semantic + procedural memory with ChromaDB)
  6. Reflection (self-improvement and strategy updates)
- **Memory Architecture**: SQLite (structured data) + ChromaDB (vector embeddings)
- **Business Applications**: White-label for AI agencies, solopreneurs, enterprises; vertical specializations (Real Estate OS, E-commerce OS, Marketing Agency OS, Content Creator OS)

#### 5. jarvis-new (Next-Gen Build)
- **Tech**: Vite + React + TypeScript + Tailwind CSS + PostCSS
- **Purpose**: Latest iteration with modern tooling (Vite instead of CRA)
- **Status**: Has dist/ folder (built), source in src/

### Tech Stack Summary
| Component | Technology |
|-----------|------------|
| Frontend UI | React + TypeScript + Tailwind CSS |
| Desktop Shell | Electron (jarvis-electron, jarvis-os) / Tauri v2 (jarvis-tauri) |
| Build Tools | Vite (jarvis-tauri, jarvis-new) / Webpack (older builds) |
| Backend API | Node.js + Express / Python FastAPI |
| Browser Automation | Playwright (primary), Puppeteer (alternative) |
| Voice STT | Deepgram (streaming) |
| Voice TTS | ElevenLabs (natural voices) |
| LLM | OpenAI GPT-4o, NVIDIA NIM (Llama 3.1 Nemotron 70B), configurable |
| Voice Transport | LiveKit (WebRTC) for jarvis-tauri |
| Memory/Storage | SQLite (structured) + ChromaDB (vectors) / JSON files |
| Diagrams | Mermaid.js |
| State Management | WebSocket real-time bridge |
| Icons | lucide-react |

### Key Differentiators (vs. OpenClaw & Traditional Assistants)
| Feature | JARVIS OS | Traditional Assistants | OpenClaw |
|---------|-----------|------------------------|----------|
| Architecture | Multi-agent orchestration | Single-pass LLM | Modular skills |
| Execution | Parallel with dependency graph | Sequential | Sequential |
| Awareness | Proactive (Observer Agent) | Reactive | Reactive |
| Learning | Full episodic + semantic memory | Basic preferences | None |
| Planning | Automatic task decomposition | None | Basic |
| Recovery | Self-healing with retry logic | Manual | Manual |
| UI | Polished glassmorphism desktop UI | CLI/Gateway | CLI |
| Extensibility | Dynamic Tool Registry | Hard-coded | skills/ plugins |

### Project Goals
1. **Local-First**: Core application runs locally; external LLMs optional
2. **Deep OS Integration**: Direct system control, not just API calls
3. **Product-Ready**: Polished UI that feels like a shipped product (not a hobbyist tool)
4. **Proactive Automation**: Observer Agent monitors and acts without user prompting
5. **Self-Improving**: Reflection Agent learns from past executions
6. **Multi-Platform**: Windows (primary), macOS/Linux (planned)
7. **Business Model** (jarvis-os): B2B source code sales, white-label for agencies, vertical-specific OS variants

### API Keys Required (across all builds)
| Service | Purpose | Get From |
|---------|---------|----------|
| OpenAI | LLM (GPT-4o) | platform.openai.com |
| NVIDIA NIM | LLM (Llama 3.1 Nemotron 70B) | build.nvidia.com |
| Deepgram | STT (Speech-to-Text) | console.deepgram.com |
| ElevenLabs | TTS (Text-to-Speech) | elevenlabs.io |
| LiveKit | WebRTC voice transport | livekit.io |

### Data Flow (jarvis-backend voice pipeline)
```
User speaks → Mic captures audio → WebSocket sends chunks → Deepgram STT streams transcript → 
NVIDIA NIM LLM processes with memory → Function calls execute (weather, calendar, search) → 
ElevenLabs TTS converts to audio → Frontend plays audio instantly
```

### Data Flow (jarvis-tauri LiveKit pipeline)
```
User speaks → LiveKit Client (Tauri) → WebRTC to LiveKit Cloud → Python Agent receives → 
Deepgram STT → OpenAI LLM → ElevenLabs TTS → LiveKit streams audio back → Tauri plays audio → 
Immediately returns to listening state
```

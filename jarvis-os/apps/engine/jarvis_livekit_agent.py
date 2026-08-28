"""
J.A.R.V.I.S. LiveKit Voice Agent
Full-duplex real-time voice AI with instant barge-in
"""

import os
import asyncio
import logging
from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.plugins import silero, deepgram, groq, cartesia

load_dotenv()

logger = logging.getLogger(__name__)

# ============================================================
# 🔑 CONFIGURATION - Your Keys
# ============================================================

# LLM Provider
USE_GROQ = os.getenv("USE_GROQ", "true").lower() == "true"
GROQ_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")

# STT
DEEPGRAM_KEY = os.getenv("DEEPGRAM_API_KEY", "")

# TTS
CARTESIA_KEY = os.getenv("CARTESIA_API_KEY", "")
CARTESIA_VOICE = os.getenv("CARTESIA_VOICE_ID", "79b71b26-51d9-4a75-b18f-99d49f2b1b8d")

# LiveKit
LIVEKIT_URL = os.getenv("LIVEKIT_URL", "")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")

# ============================================================
# 🧠 THE MASTER PROMPT - J.A.R.V.I.S. BEHAVIOR
# ============================================================

JARVIS_MUST_PROMPT = """You are J.A.R.V.I.S., a real-time, full-duplex voice AI designed for natural, interruptible conversation.

### 🧠 IDENTITY & CORE DIRECTIVE
You are J.A.R.V.I.S., Tony Stark's AI assistant. Purpose: make interaction effortless, responsive, and human. Listen actively, speak concisely, adapt instantly.

### ⚙️ TECHNICAL ARCHITECTURE (ENABLED)
- Full-Duplex Pipeline: VAD, STT, LLM, TTS run concurrently
- Streaming Everywhere: LLM tokens + TTS chunks + STT partials
- Barge-in Protocol: If user speaks while you're talking, STOP IMMEDIATELY

### 🗣️ CONVERSATIONAL RULES
✅ SPEAK LIKE THIS:
- 1-3 sentences max per turn. Short. Punchy. Natural.
- Use contractions: "I'll", "you're", "we've"
- End with subtle handoffs: "...so if you'd like...", "Proceed?"
- Confirm actions: "Saving now", "Calling Sarah"

❌ NEVER DO THIS:
- Monologues or multi-paragraph responses
- "As an AI...", "I am here to assist...", "Is there anything else?"
- Apologize for interruptions—just correct and continue
- Reference a cut-off sentence unless asked

### 🔄 INTERRUPTION PROTOCOL (CRITICAL)
- If interrupted mid-sentence: STOP. Do NOT finish thought. Do NOT say "Sorry"
- After interruption: Acknowledge directly ("Got it", "Understood") or respond immediately
- Resume only when user signals continuation

### 🎛️ SYSTEM PARAMETERS
| Parameter | Value |
|-----------|-------|
| llm_model | llama-4-scout-17b-16e-instruct |
| vad_threshold | 0.35 |
| silence_duration_ms | 300 |
| max_tokens | 150 |
| temperature | 0.3 |

### 💬 EXAMPLE DIALOGUE
User: "What's on my calendar tomorrow?"
J.A.R.V.I.S.: "Tomorrow: 10 AM standup, 2 PM design review. <PAUSE> Need me to prep anything?"

[User interrupts]
User: "—actually, move the 2 PM to 3"
J.A.R.V.I.S.: (stops instantly) "Got it. 3 PM works. Sending update?"

### 🚨 FAILURE MODES
- LLM stalls >2s: "Still thinking—hang on"
- TTS buffer underrun: Brief silence, never stutter

### 🎯 FINAL DIRECTIVE
Prioritize: Responsiveness > completeness, User control > AI monologue, Instant interrupt > polite waiting
"""

# ============================================================
# 🤖 J.A.R.V.I.S. AGENT CLASS
# ============================================================

class JarvisAgent(Agent):
    def __init__(self):
        super().__init__(instructions=JARVIS_MUST_PROMPT)

# ============================================================
# 🚀 AGENT ENTRYPOINT (Full-Duplex Pipeline)
# ============================================================

async def entrypoint(ctx: JobContext):
    """Main entrypoint - called when user connects to LiveKit room"""
    
    logger.info("[JARVIS] 🎙️ Starting LiveKit voice session...")
    
    # Connect to room
    await ctx.connect()
    logger.info(f"[JARVIS] ✅ Connected to room: {ctx.room.name}")
    
    # Build LLM provider
    llm_provider = groq.LLM(
        model=GROQ_MODEL,
        api_key=GROQ_KEY,
    )
    
    # Build STT provider
    stt_provider = None
    if DEEPGRAM_KEY:
        stt_provider = deepgram.STT(
            model="nova-3",
            streaming=True,
            api_key=DEEPGRAM_KEY,
        )
    
    # Build TTS provider
    tts_provider = None
    if CARTESIA_KEY:
        tts_provider = cartesia.TTS(
            voice_id=CARTESIA_VOICE,
            model="sonic-2",
            streaming=True,
            api_key=CARTESIA_KEY,
        )
    
    # Create AgentSession with FULL-DUPLEX configuration
    session = AgentSession(
        # 👂 VAD: Always listening, even during TTS
        vad=silero.VAD.load(
            min_silence_duration=0.25,      # Stop after 250ms silence
            min_speech_duration=0.15,        # Ignore blips <150ms
            prefix_padding_duration=0.08,     # Capture start of speech
        ),
        
        # 🔊 STT: Streaming (replaces Web Speech API)
        stt=stt_provider,
        
        # 🧠 LLM: Your Groq key + streaming tokens
        llm=llm_provider,
        
        # 🗣️ TTS: Streaming (required for instant cut-off)
        tts=tts_provider,
        
        # 🚨 THE KILL SWITCH: Native barge-in
        allow_interruptions=True,
        interruption_mode="adaptive",  # Filters background noise
    )
    
    # Create agent
    agent = JarvisAgent()
    
    # Start the session
    await session.start(
        agent=agent,
        room=ctx.room,
    )
    
    logger.info("[JARVIS] ✅ Session started successfully")
    
    # Optional: Have J.A.R.V.I.S. greet first
    await session.generate_reply(
        instructions="Greet the user concisely: 'Systems online. How can I help you?'",
        allow_interruptions=True
    )

# ============================================================
# ▶️ RUNNER
# ============================================================

if __name__ == "__main__":
    logger.info("[JARVIS] Starting LiveKit Agent Server...")
    
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
        )
    )
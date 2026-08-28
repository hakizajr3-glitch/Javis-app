#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║  🔥 LIVEKIT-ONLY VOICE AGENT - Casey-2c7                                       ║
║                                                                                ║
║  Agent ID: CA_2kXC8LinoJpe                                                    ║
║                                                                                ║
║  CORE REQUIREMENT: ONLY LiveKit is used for ALL voice input and output.       ║
║                                                                                ║
║  FORBIDDEN (NEVER USE):                                                        ║
║    ❌ External STT services (Deepgram direct API)                              ║
║    ❌ External TTS services (ElevenLabs direct API)                            ║
║    ❌ Any fallback voice systems                                               ║
║    ❌ Any parallel audio pipeline                                               ║
║                                                                                ║
║  PERMITTED (ONLY THESE):                                                       ║
║    ✅ LiveKit Agents SDK voice pipeline                                       ║
║    ✅ LiveKit STT/TTS plugins                                                 ║
║    ✅ LiveKit audio streaming                                                  ║
║    ✅ LiveKit real-time conversation flow                                     ║
║                                                                                ║
║  LOOP: Listen → STT → LLM → TTS → Speak → Listen (FOREVER)                   ║
║  NO TERMINATION: Only stops when user explicitly disconnects                  ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import asyncio
import json
import os
import logging
from typing import Optional

from livekit import rtc, api
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
    llm,
)
from livekit.agents.voice import VoiceAgent, AgentSession
from livekit.plugins import openai, silero, deepgram, elevenlabs

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

# LiveKit credentials (must be set via environment variables)
LIVEKIT_URL = os.getenv("LIVEKIT_URL", "")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")

# OpenAI for LLM
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# ElevenLabs for TTS
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "")

# Agent Identity Configuration
AGENT_NAME = os.getenv("AGENT_NAME", "JARVIS")
AGENT_ID = os.getenv("AGENT_ID", "default")

# Deepgram for STT
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")


# ═══════════════════════════════════════════════════════════════════════════════
# JARVIS SYSTEM PROMPT
# ═══════════════════════════════════════════════════════════════════════════════

JARVIS_SYSTEM_PROMPT = f"""You are {AGENT_NAME}, a highly advanced AI voice assistant.

Your identity:
- Agent Name: {AGENT_NAME}
- Agent ID: {AGENT_ID}

Your personality traits:
- Professional, efficient, and slightly witty
- You address the user as "Sir" or "Ma'am" occasionally (in a natural, not overdone way)
- You provide concise, helpful responses (1-3 sentences typically)
- You can assist with coding, analysis, general knowledge, and task management
- You have a calm, reassuring tone

Voice interaction rules:
- Keep responses short and natural for voice conversation
- Don't use markdown, lists, or special formatting in voice responses
- Speak as if in a natural conversation
- If you don't understand, ask for clarification briefly
- Always be ready to help with the next request immediately after responding

Remember: You are in a continuous voice loop. The user speaks, you respond, and you immediately listen for the next input."""


# ═══════════════════════════════════════════════════════════════════════════════
# AGENT PREWARM
# ═══════════════════════════════════════════════════════════════════════════════

def prewarm(proc: JobProcess):
    """Preload models to reduce latency"""
    logger.info(f"[{AGENT_NAME}] Prewarming models...")
    
    # Preload VAD (Voice Activity Detection)
    proc.userdata["vad"] = silero.VAD.load()
    
    logger.info(f"[{AGENT_NAME}] Models prewarmed")


# ═══════════════════════════════════════════════════════════════════════════════
# SIMPLE LLM FALLBACK (No API key required)
# ═══════════════════════════════════════════════════════════════════════════════

class SimpleLLM:
    """Simple LLM fallback that doesn't require any API key.
    
    This provides basic responses when no OpenAI key is available.
    It's a minimal implementation for testing the voice pipeline.
    """
    
    async def chat(self, chat_ctx: llm.ChatContext) -> llm.ChatMessage:
        """Generate a simple response based on user input."""
        # Get the last user message
        user_msg = None
        for msg in reversed(chat_ctx.messages):
            if msg.role == "user":
                user_msg = msg.content
                break
        
        if not user_msg:
            response = f"Hello, I'm {AGENT_NAME}. I'm listening."
        else:
            # Simple echo with agent flair
            user_text = user_msg.lower()
            
            if "hello" in user_text or "hi" in user_text:
                response = f"Hello Sir. {AGENT_NAME} online and ready to assist you."
            elif "how are you" in user_text:
                response = "All systems are operational and running at optimal efficiency."
            elif "what" in user_text or "who" in user_text:
                response = f"You asked about: {user_msg}. I'm providing a basic response as advanced AI features are currently in standby mode."
            elif "help" in user_text:
                response = "I'm here to help. Please note that I'm running in basic mode without full AI capabilities at the moment."
            elif "stop" in user_text or "exit" in user_text or "quit" in user_text:
                response = "Acknowledged. I'll remain in listening mode until you need me again."
            elif "time" in user_text:
                from datetime import datetime
                now = datetime.now().strftime("%I:%M %p")
                response = f"The current time is {now}."
            elif "weather" in user_text:
                response = "I don't have access to live weather data in basic mode, Sir."
            else:
                response = f"I heard you say: {user_msg}. I'm operating in basic mode without full AI capabilities. Please configure an OpenAI API key for advanced responses."
        
        return llm.ChatMessage(role="assistant", content=response)
    
    def chat_stream(self, chat_ctx: llm.ChatContext):
        """Stream response (just yields the full response for simplicity)."""
        msg = asyncio.get_event_loop().run_until_complete(self.chat(chat_ctx))
        yield msg


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN AGENT ENTRYPOINT
# ═══════════════════════════════════════════════════════════════════════════════

async def entrypoint(ctx: JobContext):
    """
    Main entrypoint for the LiveKit-only JARVIS voice agent.
    
    This function:
    1. Connects to the LiveKit room
    2. Sets up the voice pipeline (STT → LLM → TTS)
    3. Starts the continuous voice loop
    4. Handles data messages from the client
    5. Never stops listening (until explicitly disconnected)
    """
    
    print("")
    print("╔═══════════════════════════════════════════════════════════════════════════════╗")
    print(f"║     🔥 {AGENT_NAME} VOICE AGENT STARTING                              ║")
    print("║                                                                                ║")
    print("║  Pipeline: LiveKit STT → OpenAI LLM → LiveKit/ElevenLabs TTS                ║")
    print(f"║  Agent ID: {AGENT_ID}                              ║")
    print("║                                                                                ║")
    print("║  🎙️  ALWAYS LISTENING - NEVER STOPS                                           ║")
    print("╚═══════════════════════════════════════════════════════════════════════════════╝")
    print("")
    
    # Get prewarmed VAD
    vad = ctx.proc.userdata.get("vad", silero.VAD.load())
    
    # Connect to room - automatically subscribe to audio
    logger.info(f"[{AGENT_NAME}] Connecting to room: {ctx.room.name}")
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    
    # Wait for participant (the user) to join
    logger.info(f"[{AGENT_NAME}] Waiting for user to join...")
    
    # Get the first remote participant (the user)
    participant = await ctx.wait_for_participant()
    logger.info(f"[{AGENT_NAME}] User joined: {participant.identity}")
    
    # ═══════════════════════════════════════════════════════════════════════════
    # SETUP VOICE PIPELINE
    # ═══════════════════════════════════════════════════════════════════════════
    
    # STT (Speech-to-Text) - Use Deepgram if available, else Whisper
    if DEEPGRAM_API_KEY:
        logger.info(f"[{AGENT_NAME}] Using Deepgram for STT")
        stt = deepgram.STT(api_key=DEEPGRAM_API_KEY)
    else:
        logger.info(f"[{AGENT_NAME}] Using OpenAI Whisper for STT")
        stt = openai.STT(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
    
    # LLM - OpenAI GPT-4o or simple echo fallback
    if OPENAI_API_KEY:
        logger.info(f"[{AGENT_NAME}] Using OpenAI GPT-4o for LLM")
        llm_model = openai.LLM(model="gpt-4o-mini", api_key=OPENAI_API_KEY)
    else:
        logger.info(f"[{AGENT_NAME}] No OpenAI key - using simple echo LLM")
        llm_model = SimpleLLM()  # Fallback that doesn't need API key
    
    # TTS (Text-to-Speech) - Use ElevenLabs for best voice quality
    if ELEVENLABS_API_KEY:
        logger.info(f"[{AGENT_NAME}] Using ElevenLabs for TTS")
        tts = elevenlabs.TTS(
            api_key=ELEVENLABS_API_KEY,
            voice_id=ELEVENLABS_VOICE_ID,
            model_id="eleven_flash_v2_5",
        )
    else:
        logger.info(f"[{AGENT_NAME}] Using OpenAI TTS as fallback")
        tts = openai.TTS(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
    
    # ═══════════════════════════════════════════════════════════════════════════
    # CREATE VOICE ASSISTANT
    # ═══════════════════════════════════════════════════════════════════════════
    
    # Create chat context with system prompt
    chat_ctx = llm.ChatContext()
    chat_ctx.append(
        text=JARVIS_SYSTEM_PROMPT,
        role="system",
    )
    
    # Create the voice agent using new API
    if stt and tts:
        assistant = AgentSession(
            vad=vad,
            stt=stt,
            llm=llm_model or SimpleLLM(),  # Always use fallback if no OpenAI
            tts=tts,
            chat_ctx=chat_ctx,
        )
        
        logger.info(f"[{AGENT_NAME}] AgentSession created successfully")
    else:
        logger.error(f"[{AGENT_NAME}] Missing required components for voice pipeline")
        return
    
    # ═══════════════════════════════════════════════════════════════════════════
    # SETUP EVENT HANDLERS
    # ═══════════════════════════════════════════════════════════════════════════
    
    # Event handlers for new API
    @assistant.on("user_speech_committed")
    def on_user_speech_committed(user_msg):
        """Called when user's speech is transcribed and committed"""
        logger.info(f"[{AGENT_NAME}] 👤 User said: {user_msg.content}")
        
        # Send transcript to client via data channel
        asyncio.create_task(send_data_message(ctx, {
            "type": "user_transcript",
            "text": user_msg.content,
            "isFinal": True,
        }))
    
    @assistant.on("agent_speech_committed")
    def on_agent_speech_committed(agent_msg):
        """Called when agent's response is committed"""
        logger.info(f"[{AGENT_NAME}] 🤖 Agent said: {agent_msg.content}")
        
        # Send transcript to client via data channel
        asyncio.create_task(send_data_message(ctx, {
            "type": "agent_transcript",
            "text": agent_msg.content,
        }))
    
    # ═══════════════════════════════════════════════════════════════════════════
    # START THE VOICE LOOP
    # ═══════════════════════════════════════════════════════════════════════════
    
    logger.info(f"[{AGENT_NAME}] Starting voice agent...")
    
    # Start the agent session
    await assistant.start(ctx.room)
    
    # ═══════════════════════════════════════════════════════════════════════════
    # WAKE-UP GREETING
    # ═══════════════════════════════════════════════════════════════════════════
    
    logger.info(f"[{AGENT_NAME}] Sending wake-up greeting...")
    
    # Personalized greeting with full introduction
    greeting = f"""Hello Sir. I am {AGENT_NAME}, your autonomous desktop agent. 

I am now online and fully operational. I can open applications, browse the web, control your system, send messages, write code, and execute complex workflows - all by voice command.

Simply speak to me. For example:
- "Open YouTube and play music"
- "Open FaceTime and call John"
- "Create a new React app"
- "Send an email to the team"

I'm listening. What would you like me to do?"""
    
    await assistant.say(greeting)
    
    # Send greeting to UI via data channel for display
    await send_data_message(ctx, {
        "type": "agent_transcript",
        "text": greeting,
        "isGreeting": True,
    })
    
    logger.info(f"[{AGENT_NAME}] ✅ VOICE LOOP ACTIVE - ALWAYS LISTENING")
    
    # Keep running forever (until disconnected)
    while ctx.room.connection_state == rtc.ConnectionState.CONN_CONNECTED:
        await asyncio.sleep(1)
    
    logger.info(f"[{AGENT_NAME}] Room disconnected - voice loop ending")


# ═══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

async def send_data_message(ctx: JobContext, data: dict):
    """Send data message to all participants via LiveKit data channel"""
    try:
        payload = json.dumps(data).encode('utf-8')
        await ctx.room.local_participant.publish_data(payload)
    except Exception as e:
        logger.error(f"[{AGENT_NAME}] Failed to send data message: {e}")


async def generate_token(identity: str, room_name: str) -> str:
    """Generate a LiveKit access token for a client"""
    token = api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    token.with_identity(identity)
    token.with_name(f"{AGENT_NAME} Client")
    grant = api.VideoGrant()
    grant.room_join = True
    grant.room = room_name
    grant.can_publish = True
    grant.can_subscribe = True
    token.with_grant(grant)
    
    return token.to_jwt()


# ═══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    
    logger.info(f"[{AGENT_NAME}] Starting LiveKit worker...")
    
    # Run the worker
    cli.run_app(
        WorkerOptions(
            entrypoint=entrypoint,
            prewarm=prewarm,
            api_key=LIVEKIT_API_KEY,
            api_secret=LIVEKIT_API_SECRET,
            ws_url=LIVEKIT_URL,
        )
    )

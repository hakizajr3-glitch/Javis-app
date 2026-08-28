#!/usr/bin/env python3
"""
JARVIS LiveKit Agent - Voice AI Assistant
Receives audio from Tauri client, processes through STT->LLM->TTS, sends audio back
"""

import asyncio
import os
from livekit import rtc
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
    emit,
)
from livekit.agents.pipeline import VoicePipelineAgent
from livekit.agents import ChatContext, ChatMessage
from openai import AsyncOpenAI
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")  # Add your key
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")  # Add your key for better STT
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "")

# Initialize clients
openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None


async def get_llm_response(prompt: str) -> str:
    """Get response from LLM"""
    if not openai_client:
        # Fallback if no OpenAI key
        return f"I heard you say: {prompt}. How can I help you further?"

    try:
        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": "You are JARVIS, a helpful AI assistant. Keep responses short (1-3 sentences), conversational, and helpful.",
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=150,
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error(f"LLM error: {e}")
        return "I'm sorry, I had trouble processing that. Could you try again?"


async def text_to_speech(text: str) -> bytes:
    """Convert text to speech using ElevenLabs"""
    try:
        import requests

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"
        headers = {
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": ELEVENLABS_API_KEY,
        }
        data = {
            "text": text,
            "model_id": "eleven_flash_v2_5",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        }
        response = requests.post(url, json=data, headers=headers)
        if response.status_code == 200:
            return response.content
        else:
            logger.error(f"TTS error: {response.status_code}")
            return b""
    except Exception as e:
        logger.error(f"TTS error: {e}")
        return b""


@emit
async def entrypoint(ctx: JobContext):
    """Main agent entrypoint"""
    logger.info("JARVIS Agent starting...")

    # Connect to room
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Create initial chat context
    chat_context = ChatContext(
        messages=[
            ChatMessage(
                role="system",
                content="You are JARVIS, a helpful AI voice assistant. Keep responses short, natural, and conversational.",
            )
        ]
    )

    logger.info(f"Room: {ctx.room.name}, Agent connected")

    # Listen for user audio
    async for event in ctx.room.streams():
        if isinstance(event, rtc.AudioFrame):
            # Process audio frame
            logger.info(
                f"Received audio frame: {event.sample_rate}Hz, {len(event.data)} samples"
            )

            # Here we'd typically stream to STT (Deepgram) and get transcript
            # For now, we'll implement a simple response


# Simple agent using LiveKit's built-in voice pipeline
async def run_agent(ctx: JobContext):
    """Run the voice agent"""
    logger.info("Starting JARVIS Voice Agent...")

    await ctx.connect()

    # This would typically use the LiveKit Agent SDK with proper STT/LLM/TTS
    # For now, we just maintain the connection and wait for audio

    logger.info("JARVIS is listening...")

    # Keep the agent running
    await asyncio.sleep(float("inf"))


if __name__ == "__main__":
    # Run with: python livekit_agent.py --config ./livekit.yaml
    cli.run_app(
        WorkerOptions(
            entrypoint=entrypoint,
            prewarm=False,
        )
    )

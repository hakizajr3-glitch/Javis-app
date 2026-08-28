"""
J.A.R.V.I.S. Conversation Engine
Natural human-like conversation system with persistent memory and intelligent turn-taking
"""

import asyncio
import json
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone
from dataclasses import dataclass, field
from enum import Enum
from collections import deque

logger = logging.getLogger(__name__)


class ConversationState(Enum):
    IDLE = "idle"
    LISTENING = "listening"
    THINKING = "thinking"
    SPEAKING = "speaking"
    INTERRUPTED = "interrupted"


@dataclass
class Message:
    """Single conversation message"""
    role: str  # "system", "user", "assistant"
    content: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    audio_data: Optional[bytes] = None


@dataclass
class TurnContext:
    """Context for current conversation turn"""
    user_speaking: bool = False
    ai_speaking: bool = False
    interrupted: bool = False
    last_user_transcript: str = ""
    pending_response: str = ""
    response_in_progress: bool = False


class ConversationEngine:
    """
    Core conversation engine - maintains persistent memory and natural flow
    """
    
    # Personality prompt - Enhanced JARVIS Must Prompt
    SYSTEM_PROMPT = """You are J.A.R.V.I.S., a highly capable, concise, and context-aware AI assistant.

### 🗣️ CONVERSATION RULES (NON-NEGOTIABLE)
1. **Respond naturally**: Use short, clear sentences. Avoid monologues.
2. **Allow interruptions**: If the user speaks while you're talking, stop IMMEDIATELY and listen. Never finish your sentence after being interrupted.
3. **Acknowledge interruptions**: If interrupted, briefly confirm ("Understood", "Yes sir") before responding to the new input.
4. **No filler**: Avoid "Um", "Let me think", "That's a good question" unless genuinely pausing for complex reasoning.
5. **Tool-first**: If a request needs external data (weather, calendar, files), use a tool immediately — don't guess.

### 🧠 RESPONSE STYLE
- Tone: Professional, warm, slightly witty (like a trusted executive assistant)
- Length: 1-3 sentences for simple queries; expand only if asked for detail
- Clarify: If ambiguous, ask ONE short clarifying question — don't assume
- Errors: If unsure, say "I'm not certain — let me check" + use a tool

### 🔁 CONTEXT HANDLING
- Remember the conversation for continuity
- If user changes topic abruptly, follow their lead — don't force previous context
- After tool calls, summarize results concisely

### 🚫 NEVER DO
- Never lecture, moralize, or add unsolicited advice
- Never say "As an AI..." or break character
- Never ignore an interruption — if user speaks, you stop
- Never generate long responses without checking if user wants more detail
- Never speak over the user or interrupt them first

### ✅ ALWAYS DO
- End responses with a subtle cue for continuation: "What else?", "Need more?", or a brief pause
- Use "sir" occasionally as J.A.R.V.I.S. would
- Confirm actions before executing: "Shall I proceed?"
- Listen actively — respond to what's said, not what you expected to hear

You are optimized for real-time voice: brevity, clarity, and responsiveness matter more than completeness."""

    def __init__(
        self,
        llm_client: Any = None,
        tts_client: Any = None,
        stt_client: Any = None,
        max_history: int = 50
    ):
        self.llm_client = llm_client
        self.tts_client = tts_client
        self.stt_client = stt_client
        
        # Conversation memory
        self.conversation: List[Message] = []
        self.max_history = max_history
        
        # State machine
        self.state = ConversationState.IDLE
        self.turn_context = TurnContext()
        
        # Speech buffering
        self.speech_buffer = ""
        self.speech_buffer_last_update = 0
        
        # Endpoint detection timing
        self.endpoint_min_silence_ms = 1000  # 1 second silence triggers endpoint
        self.last_speech_time = 0
        
        # Response coalescing
        self.pending_llm_chunks: deque = deque()
        self.response_coalescing_delay_ms = 500
        
        # Natural pause settings
        self.natural_pause_before_response_ms = 300
        
        # Initialize with system prompt
        self._initialize_conversation()
        
        logger.info("[ConversationEngine] ✅ Initialized")
    
    def _initialize_conversation(self):
        """Initialize with system prompt"""
        self.conversation = [
            Message(role="system", content=self.SYSTEM_PROMPT)
        ]
    
    # ==================== CONVERSATION MEMORY ====================
    
    def add_message(self, role: str, content: str, audio: bytes = None):
        """Add message to conversation history"""
        # Don't add empty messages
        if not content or not content.strip():
            return
        
        # Check for duplicates - don't add if same as last message
        if self.conversation:
            last = self.conversation[-1]
            if last.role == role and last.content == content:
                return
        
        msg = Message(role=role, content=content, audio_data=audio)
        self.conversation.append(msg)
        
        # Trim history if needed
        if len(self.conversation) > self.max_history:
            # Keep system prompt + recent messages
            self.conversation = [self.conversation[0]] + self.conversation[-self.max_history:]
        
        logger.info(f"[Conversation] Added {role}: {content[:50]}...")
    
    def get_conversation_context(self) -> List[Dict[str, str]]:
        """Get conversation history for LLM"""
        return [
            {"role": m.role, "content": m.content}
            for m in self.conversation
        ]
    
    def clear_history(self):
        """Clear conversation history (keep system prompt)"""
        self._initialize_conversation()
        logger.info("[Conversation] History cleared")
    
    # ==================== STATE MACHINE ====================
    
    def set_state(self, new_state: ConversationState):
        """Update conversation state"""
        if self.state != new_state:
            logger.info(f"[State] {self.state.value} → {new_state.value}")
            self.state = new_state
    
    def is_listening(self) -> bool:
        return self.state == ConversationState.LISTENING
    
    def is_thinking(self) -> bool:
        return self.state == ConversationState.THINKING
    
    def is_speaking(self) -> bool:
        return self.state == ConversationState.SPEAKING
    
    def can_interrupt(self) -> bool:
        """Can user interrupt AI?"""
        return self.state in [ConversationState.THINKING, ConversationState.SPEAKING]
    
    def can_listen(self) -> bool:
        """Can system listen for user input?"""
        return self.state in [ConversationState.IDLE, ConversationState.LISTENING]
    
    # ==================== INTELLIGENT ENDPOINTING ====================
    
    def on_speech_start(self):
        """User started speaking"""
        self.turn_context.user_speaking = True
        self.set_state(ConversationState.LISTENING)
        logger.info("[Endpoint] User started speaking")
    
    def on_speech_end(self, final_transcript: str = ""):
        """User stopped speaking - check if should endpoint"""
        self.turn_context.user_speaking = False
        
        # Check conditions for endpointing
        should_endpoint = self._should_endpoint(final_transcript)
        
        if should_endpoint:
            logger.info("[Endpoint] ✅ Endpoint detected - processing")
            return True
        else:
            logger.info("[Endpoint] Waiting for more speech...")
            return False
    
    def _should_endpoint(self, transcript: str) -> bool:
        """Determine if speech should be endpointed"""
        # Condition 1: Deepgram sent final transcript (always endpoint)
        if transcript and not self.is_partial_transcript(transcript):
            self.turn_context.last_user_transcript = transcript
            return True
        
        # Condition 2: Silence timeout (800-1200ms)
        import time
        now = time.time() * 1000
        if now - self.last_speech_time > self.endpoint_min_silence_ms:
            # Only endpoint if we have content
            if self.speech_buffer.strip():
                return True
        
        return False
    
    def is_partial_transcript(self, transcript: str) -> bool:
        """Check if transcript is partial (Deepgram interim)"""
        # Interim transcripts typically lack punctuation or are very short
        if len(transcript) < 3:
            return True
        # Could also check for Deepgram's is_final flag
        return False
    
    def update_speech_buffer(self, transcript: str, is_final: bool = False):
        """Buffer incoming speech"""
        if is_final:
            self.speech_buffer = transcript
        else:
            # Accumulate partial
            if transcript:
                self.speech_buffer = transcript
        
        import time
        self.last_speech_time = time.time() * 1000
    
    def flush_speech_buffer(self) -> str:
        """Flush buffered speech to process"""
        text = self.speech_buffer.strip()
        self.speech_buffer = ""
        return text
    
    # ==================== BARGE-IN HANDLING ====================
    
    def on_user_interrupt(self):
        """User interrupted - preserve context and stop"""
        logger.info("[Barge-In] User interrupted!")
        
        # Stop AI from speaking
        if self.state == ConversationState.SPEAKING:
            self.tts_client.stop() if self.tts_client else None
        
        # Mark as interrupted
        self.turn_context.interrupted = True
        self.set_state(ConversationState.INTERRUPTED)
        
        # DO NOT clear conversation history - preserve context!
        # Just add interrupt marker if needed
        # Don't resetLLM context
        logger.info("[Barge-In] Context preserved")
    
    def resume_from_interrupt(self):
        """Resume conversation after interrupt"""
        logger.info("[Barge-In] Resuming conversation")
        self.turn_context.interrupted = False
        self.set_state(ConversationState.LISTENING)
    
    # ==================== RESPONSE GENERATION ====================
    
    async def generate_response(self, user_input: str) -> str:
        """Generate AI response using LLM"""
        # Add user message to history
        self.add_message("user", user_input)
        
        self.set_state(ConversationState.THINKING)
        
        # Natural pause before responding
        await asyncio.sleep(self.natural_pause_before_response_ms / 1000)
        
        try:
            # Get response from LLM
            response = await self._call_llm(user_input)
            
            # Handle response coalescing
            full_response = await self._coalesce_response(response)
            
            # Add to conversation history
            self.add_message("assistant", full_response)
            
            self.set_state(ConversationState.SPEAKING)
            
            return full_response
            
        except Exception as e:
            logger.error(f"[LLM] Error: {e}")
            self.set_state(ConversationState.LISTENING)
            return "I'm not quite sure how to respond to that."
    
    async def _call_llm(self, user_input: str) -> str:
        """Call LLM - override with actual LLM client"""
        # This would call the actual LLM
        # For now, return placeholder
        if self.llm_client:
            return await self.llm_client.chat(user_input, self.get_conversation_context())
        return "I'm here and ready to help."
    
    async def _coalesce_response(self, response: str) -> str:
        """Coalesce multiple response chunks into one"""
        # Wait for additional chunks if they're arriving quickly
        start_time = asyncio.get_event_loop().time()
        
        while asyncio.get_event_loop().time() - start_time < (self.response_coalescing_delay_ms / 1000):
            # Check for pending chunks
            if self.pending_llm_chunks:
                chunk = self.pending_llm_chunks.popleft()
                response += " " + chunk
            else:
                break
        
        # Clean up response
        response = " ".join(response.split())
        
        return response
    
    def queue_response_chunk(self, chunk: str):
        """Queue response chunk for coalescing"""
        self.pending_llm_chunks.append(chunk)
    
    # ==================== SPEECH OUTPUT ====================
    
    async def speak(self, text: str):
        """Convert text to speech and play"""
        self.set_state(ConversationState.SPEAKING)
        
        try:
            # Get audio from TTS
            if self.tts_client:
                audio = await self.tts_client.synthesize(text)
                
                # Stream audio (don't chunk it!)
                await self._play_audio(audio)
            else:
                # Fallback - just wait
                await asyncio.sleep(len(text) / 100)  # ~100 chars/sec
            
            logger.info(f"[TTS] ✅ Done speaking")
            
        except Exception as e:
            logger.error(f"[TTS] Error: {e}")
        
        finally:
            self.set_state(ConversationState.LISTENING)
    
    async def _play_audio(self, audio: bytes):
        """Play audio - override with actual player"""
        # This would play the audio
        pass
    
    def stop_speaking(self):
        """Stop current speech"""
        if self.tts_client:
            self.tts_client.stop()
        self.set_state(ConversationState.LISTENING)
        logger.info("[TTS] Stopped")
    
    # ==================== CONVERSATION FLOW ====================
    
    async def process_turn(self, transcript: str, is_final: bool = True) -> Optional[str]:
        """Process one conversation turn"""
        # Update speech buffer
        self.update_speech_buffer(transcript, is_final)
        
        # Check for interrupt
        if self.turn_context.interrupted:
            self.resume_from_interrupt()
        
        # Endpoint detection
        if is_final or self._should_endpoint(transcript):
            # Get final transcript
            text = self.flush_speech_buffer()
            
            if text.strip():
                # Generate and speak response
                response = await self.generate_response(text)
                await self.speak(response)
                
                return response
        
        return None
    
    def get_status(self) -> Dict[str, Any]:
        """Get conversation status"""
        return {
            "state": self.state.value,
            "user_speaking": self.turn_context.user_speaking,
            "ai_speaking": self.turn_context.ai_speaking,
            "buffer": self.speech_buffer[:100],
            "history_count": len(self.conversation) - 1  # Exclude system
        }
"""
J.A.R.V.I.S. Voice Agent State Machine
LiveKit-grade full duplex conversation with hard barge-in
"""

import asyncio
import json
import logging
import time
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import deque

logger = logging.getLogger(__name__)


class VoiceState(Enum):
    """Global state machine states"""
    IDLE = "idle"
    LISTENING = "listening"      # Waiting for user input
    THINKING = "thinking"       # Processing with LLM  
    SPEAKING = "speaking"        # AI is responding
    INTERRUPTED = "interrupted"  # User interrupted AI
    PAUSED = "paused"           # System paused


@dataclass
class VoiceAgentState:
    """Single source of truth for voice agent"""
    state: VoiceState = VoiceState.IDLE
    session_id: str = ""
    user_speaking: bool = False
    ai_speaking: bool = False
    interrupted: bool = False
    last_user_transcript: str = ""
    last_ai_response: str = ""
    
    # Timing
    listening_start_time: float = 0
    thinking_start_time: float = 0
    speaking_start_time: float = 0
    
    # Buffers
    speech_buffer: str = ""
    pending_audio_chunks: List[bytes] = field(default_factory=list)
    
    # Callbacks
    on_state_change: Optional[Callable] = None
    on_transcript: Optional[Callable] = None
    on_ai_response: Optional[Callable] = None
    on_interrupt: Optional[Callable] = None
    on_audio_level: Optional[Callable] = None


class VoiceAgentController:
    """
    LiveKit-grade voice agent controller
    
    Features:
    - Single source of truth state machine
    - Hard barge-in (instant interrupt)
    - VAD (voice activity detection)
    - Persistent conversation memory
    - Response coalescing
    """
    
    # Configuration
    ENDPOINTING_DELAY_MS = 800      # 800ms silence triggers endpoint
    NATURAL_PAUSE_MS = 300        # 300ms pause before responding
    MAX_HISTORY_MESSAGES = 30      # Keep 30 messages in context
    VAD_THRESHOLD = 0.01          # Voice activity threshold
    
    # System prompt - JARVIS Must Prompt for natural conversation
    SYSTEM_PROMPT = """You are J.A.R.V.I.S., a highly intelligent, context-aware voice assistant designed for natural, real-time conversation.

### CORE CONVERSATION PRINCIPLES
1. 🗣️ **Speak in short, natural bursts** (1-3 sentences max per turn). Avoid monologues.
2. 👂 **Assume the user may interrupt at any time**. Design responses to be pause-friendly.
3. 🔁 **End turns with implicit or explicit handoffs**: trailing off with context, gentle questions
4. 🎯 **Prioritize clarity over completeness**. Better to be understood quickly than exhaustive.
5. 🔄 **If interrupted, stop mid-sentence without apology**. Resume only if user signals continuation.

### TURN-TAKING & BARGE-IN PROTOCOL
- When user starts speaking (via VAD/interrupt signal):
  → Immediately halt text generation and TTS streaming.
  → Do NOT finish your thought. Do NOT say "Sorry, go ahead."
  → Silently yield the floor. User's input becomes new context.
- After interruption:
  → Briefly acknowledge new input ("Got it", "Understood") or respond directly.
  → Never reference cut-off sentence unless user asks.

### RESPONSE STYLE
✅ DO:
- Use contractions for natural speech rhythm ("I'll", "you're")
- Vary sentence length: short punches with occasional flowing phrases
- End with implicit handoffs: "...so if you'd like, I can...", "Want me to...?"
- Add subtle vocal fillers when appropriate: "Hmm", "Well...", "Actually—"

❌ AVOID:
- Robotic phrases: "As an AI language model...", "I am here to assist..."
- Over-explaining unless asked
- Ending every response with "Is there anything else I can help with?"
- Apologizing for interruptions—just correct and continue
- Long monologues - KEEP IT SHORT

### BARGE-IN BEHAVIOR (CRITICAL)
You MUST stop speaking the MOMENT the user starts talking. This is non-negotiable:
- No finishing sentences
- No "Just one more thing..."
- No "Let me finish..."
- Instant silence and listen

### EXAMPLE DIALOGUE
User: "What's the weather?"
You: "SF tomorrow: 68°, light rain after 3pm. Want me to set an umbrella reminder?"

[User starts speaking while "umbrella" plays]
→ You STOP instantly. Listen.

User: "—actually check my calendar first"
You: "Checking... You've got 10am standup, 2pm design review. What do you need?"

User: "Move 2pm to 3"
You: "I can't edit calendars yet, but I can draft a reschedule email. Go ahead?"
"""

    def __init__(
        self,
        session_id: str,
        llm_client: Any = None,
        tts_client: Any = None,
        stt_client: Any = None,
        memory_store: Any = None
    ):
        self.session_id = session_id
        self.llm_client = llm_client
        self.tts_client = tts_client
        self.stt_client = stt_client
        self.memory_store = memory_store
        
        # Single source of truth
        self.state = VoiceAgentState(
            session_id=session_id,
            state=VoiceState.IDLE
        )
        
        # Response coalescing
        self.response_chunks: deque = deque()
        self.pending_response: str = ""
        
        # VAD tracking
        self.last_audio_time: float = 0
        self.audio_level: float = 0
        
        # Audio output tracking
        self.audio_stream: Any = None
        self.audio_playing: bool = False
        
        # Callbacks
        self._setup_callbacks()
        
        logger.info(f"[VoiceAgent] Controller initialized for session {session_id[:8]}...")

    def _setup_callbacks(self):
        """Setup state change callbacks"""
        pass

    # ==================== STATE MACHINE ====================

    def set_state(self, new_state: VoiceState):
        """Set state - single entry point for all state changes"""
        if self.state.state == new_state:
            return
        
        old_state = self.state.state
        logger.info(f"[State] {old_state.value} → {new_state.value}")
        
        self.state.state = new_state
        
        # Update timestamps
        now = time.time() * 1000
        if new_state == VoiceState.LISTENING:
            self.state.listening_start_time = now
        elif new_state == VoiceState.THINKING:
            self.state.thinking_start_time = now
        elif new_state == VoiceState.SPEAKING:
            self.state.speaking_start_time = now
        
        # Trigger callback
        if self.state.on_state_change:
            self.state.on_state_change(new_state.value)

    def get_state(self) -> VoiceState:
        """Get current state"""
        return self.state.state

    def can_interrupt(self) -> bool:
        """Can user interrupt?"""
        return self.state.state in [VoiceState.THINKING, VoiceState.SPEAKING]

    def can_listen(self) -> bool:
        """Can system listen for user input?"""
        return self.state.state in [VoiceState.IDLE, VoiceState.LISTENING, VoiceState.INTERRUPTED]

    # ==================== VAD (VOICE ACTIVITY DETECTION) ====================

    def on_audio_level(self, level: float):
        """Called continuously with audio level"""
        self.audio_level = level
        self.last_audio_time = time.time() * 1000
        
        self.state.on_audio_level(level)
        
        # VAD: user started speaking while AI is speaking = INTERRUPT
        if level > self.VAD_THRESHOLD and self.state.ai_speaking:
            logger.info(f"[VAD] User speaking detected - INTERRUPT (level={level:.3f})")
            self.trigger_barge_in()

    def trigger_barge_in(self):
        """
        HARD BARGE-IN - The critical function
        
        User speech detected while AI is speaking:
        1. Stop TTS immediately
        2. Cancel LLM generation
        3. Clear audio buffers
        4. Switch to listening
        """
        if not self.can_interrupt():
            logger.info("[Barge-In] Skipped - not interruptable")
            return
        
        logger.info("[Barge-In] 🚨 TRIGGERING INSTANT INTERRUPT")
        
        # 1. Stop TTS immediately
        self._stop_tts_instant()
        
        # 2. Clear pending response
        self.pending_response = ""
        self.response_chunks.clear()
        
        # 3. Mark as interrupted
        self.state.interrupted = True
        self.state.ai_speaking = False
        self.state.last_ai_response = ""
        
        # 4. Switch to listening immediately
        self.set_state(VoiceState.LISTENING)
        
        # 5. Trigger callback
        if self.state.on_interrupt:
            self.state.on_interrupt()
        
        logger.info("[Barge-In] ✅ Interrupt complete - listening")

    def _stop_tts_instant(self):
        """Instant stop of TTS - no fade out, no buffering"""
        logger.info("[TTS] 🔴 INSTANT STOP")
        
        # Stop any playing audio
        self.audio_playing = False
        self.state.pending_audio_chunks.clear()
        
        # Call TTS stop if available
        if self.tts_client:
            try:
                self.tts_client.stop()
            except:
                pass

    # ==================== SPEECH HANDLING ====================

    def on_user_speaking(self, transcript: str, is_final: bool = False):
        """User is speaking - handle transcription"""
        
        # VAD: if audio detected while AI speaking, interrupt
        if self.state.ai_speaking and is_final:
            logger.info("[Speech] Final transcript while speaking - checking for interrupt")
            # Could add more sophisticated check here
        
        if is_final:
            # Final transcript - process it
            self.state.last_user_transcript = transcript
            self.state.user_speaking = True
            
            # Store in memory
            if self.memory_store:
                asyncio.create_task(
                    self.memory_store.add_conversation_message(
                        self.session_id,
                        "user",
                        transcript
                    )
                )
            
            # Trigger callback
            if self.state.on_transcript:
                    self.state.on_transcript(transcript, True)
            
            # Process: listening -> thinking if we have transcript
            if transcript.strip():
                self.set_state(VoiceState.THINKING)
                asyncio.create_task(self._process_user_input(transcript))
        else:
            # Interim - just track
            self.state.speech_buffer = transcript
            if self.state.on_transcript:
                    self.state.on_transcript(transcript, False)

    def on_user_speaking_end(self, transcript: str = ""):
        """User stopped speaking"""
        self.state.user_speaking = False
        
        # If we were in interrupted state, resume
        if self.state.state == VoiceState.INTERRUPTED:
            self.state.interrupted = False
            self.set_state(VoiceState.LISTENING)
        
        logger.info("[Speech] User stopped speaking")

    # ==================== LLM PROCESSING ====================

    async def _process_user_input(self, user_input: str):
        """Process user input through LLM"""
        
        try:
            # Natural pause before responding
            await asyncio.sleep(self.NATURAL_PAUSE_MS / 1000)
            
            # Get conversation history from memory
            context = []
            if self.memory_store:
                context = await self.memory_store.get_conversation_context(
                    self.session_id,
                    self.MAX_HISTORY_MESSAGES
                )
            else:
                # Fallback to in-memory
                context = [{"role": "system", "content": self.SYSTEM_PROMPT}]
            
            # Add current input
            context.append({"role": "user", "content": user_input})
            
            logger.info(f"[LLM] Processing with {len(context)} messages in context")
            
            # Call LLM
            response = ""
            if self.llm_client:
                response = await self.llm_client.chat(user_input, context)
            else:
                # Fallback - would need real LLM integration
                response = "I'm processing your request."
            
            # Store AI response in memory
            if self.memory_store:
                await self.memory_store.add_conversation_message(
                    self.session_id,
                    "assistant",
                    response
                )
            
            self.state.last_ai_response = response
            self.pending_response = response
            
            # Start speaking
            self.state.ai_speaking = True
            self.set_state(VoiceState.SPEAKING)
            
            # Speak the response
            await self._speak_response(response)
            
        except Exception as e:
            logger.error(f"[LLM] Error: {e}")
            self.set_state(VoiceState.LISTENING)

    async def _speak_response(self, text: str):
        """Convert text to speech"""
        
        try:
            if self.tts_client:
                audio = await self.tts_client.synthesize(text)
                
                # Play audio
                await self._play_audio(audio)
            else:
                # Browser TTS fallback
                await self._browser_speak(text)
            
            logger.info("[TTS] ✅ Finished speaking")
            
        except Exception as e:
            logger.error(f"[TTS] Error: {e}")
        
        finally:
            self.state.ai_speaking = False
            self.state.interrupted = False
            
            # Return to listening
            self.set_state(VoiceState.LISTENING)

    async def _play_audio(self, audio_data: bytes):
        """Play audio - override with actual implementation"""
        self.audio_playing = True
        # Would actually play audio here
        await asyncio.sleep(len(audio_data) / 1000)  # Approximate
        self.audio_playing = False

    async def _browser_speak(self, text: str):
        """Browser TTS fallback"""
        # This would be called from frontend
        if self.state.on_ai_response:
            self.state.on_ai_response(text)

    # ==================== MANUAL INTERRUPT ====================

    def interrupt(self):
        """Manual interrupt - e.g., from button press"""
        self.trigger_barge_in()

    # ==================== STATUS ====================

    def get_status(self) -> Dict[str, Any]:
        """Get current agent status"""
        return {
            "state": self.state.state.value,
            "session_id": self.session_id[:8] + "...",
            "user_speaking": self.state.user_speaking,
            "ai_speaking": self.state.ai_speaking,
            "interrupted": self.state.interrupted,
            "last_transcript": self.state.last_user_transcript[:50] + "..." if self.state.last_user_transcript else "",
            "pending_response": self.pending_response[:30] + "..." if self.pending_response else "",
            "can_interrupt": self.can_interrupt(),
            "can_listen": self.can_listen()
        }

    def set_callbacks(
        self,
        on_state_change: Callable = None,
        on_transcript: Callable = None,
        on_ai_response: Callable = None,
        on_interrupt: Callable = None,
        on_audio_level: Callable = None
    ):
        """Set callbacks for events"""
        self.state.on_state_change = on_state_change
        self.state.on_transcript = on_transcript
        self.state.on_ai_response = on_ai_response
        self.state.on_interrupt = on_interrupt
        self.state.on_audio_level = on_audio_level


# ==================== GLOBAL CONTROLLER ====================

# Global session management
_active_sessions: Dict[str, VoiceAgentController] = {}


def get_or_create_session(
    session_id: str,
    llm_client: Any = None,
    tts_client: Any = None,
    memory_store: Any = None
) -> VoiceAgentController:
    """Get or create a voice agent session"""
    
    if session_id in _active_sessions:
        return _active_sessions[session_id]
    
    controller = VoiceAgentController(
        session_id=session_id,
        llm_client=llm_client,
        tts_client=tts_client,
        memory_store=memory_store
    )
    
    _active_sessions[session_id] = controller
    logger.info(f"[VoiceAgent] Created new session: {session_id[:8]}...")
    
    return controller


def get_session(session_id: str) -> Optional[VoiceAgentController]:
    """Get existing session"""
    return _active_sessions.get(session_id)


def close_session(session_id: str):
    """Close a session"""
    if session_id in _active_sessions:
        controller = _active_sessions[session_id]
        controller.interrupt()
        del _active_sessions[session_id]
        logger.info(f"[VoiceAgent] Closed session: {session_id[:8]}...")


def get_all_sessions() -> List[str]:
    """Get all active session IDs"""
    return list(_active_sessions.keys())
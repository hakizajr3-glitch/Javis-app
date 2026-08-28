"""
Turn-taking state machine for the voice pipeline.

Explicit states — no component infers turn ownership from timing alone.
Every component can query the current state at any time.

State diagram:
    idle
      ↓ (user triggers voice session)
    listening
      ↓ (VAD detects speech onset)
    user_speaking
      ↓ (VAD detects silence / end of utterance)
    processing
      ↓ (LLM response received, TTS begins)
    responding
      ↓ (user interrupts during TTS)     ↓ (TTS completes)
    interrupted ←──────────────────────→ idle
      ↓
    listening (hand control back to user)
"""

import asyncio
import time
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Optional, Callable

# ── Enable timestamp logging for every state transition ──
_STATE_LOG_ENABLED = True


def _state_log(msg: str) -> None:
    """Diagnostic log for state transitions."""
    if _STATE_LOG_ENABLED:
        print(f"STATE_TRANSITION t={time.monotonic():.3f} {msg}")


class TurnState(Enum):
    """Explicit turn-taking states."""
    IDLE = auto()          # No active conversation
    LISTENING = auto()     # Waiting for user speech
    USER_SPEAKING = auto() # User is actively talking
    PROCESSING = auto()    # Transcribing + LLM reasoning
    RESPONDING = auto()    # TTS is playing response
    INTERRUPTED = auto()   # User barged in — flushing TTS


@dataclass
class TurnEvent:
    """A state transition event."""
    from_state: TurnState
    to_state: TurnState
    timestamp: float = field(default_factory=time.monotonic)
    reason: str = ""


class TurnStateMachine:
    """
    Thread-safe turn-taking state machine.

    Features:
      - Explicit state transitions (no implicit inference)
      - State-change callbacks for cross-component coordination
      - Event history for debugging
      - Barge-in detection with sub-frame response
    """

    VALID_TRANSITIONS = {
        TurnState.IDLE:          [TurnState.LISTENING],
        TurnState.LISTENING:     [TurnState.USER_SPEAKING, TurnState.IDLE],
        TurnState.USER_SPEAKING: [TurnState.PROCESSING, TurnState.LISTENING],
        TurnState.PROCESSING:    [TurnState.RESPONDING, TurnState.LISTENING],
        TurnState.RESPONDING:    [TurnState.IDLE, TurnState.INTERRUPTED],
        TurnState.INTERRUPTED:   [TurnState.LISTENING],
    }

    def __init__(self):
        self._state: TurnState = TurnState.IDLE
        self._lock = asyncio.Lock()
        self._event_history: list[TurnEvent] = []
        self._max_history = 100
        self._listeners: list[Callable[[TurnEvent], None]] = []

        # Barge-in metrics
        self._last_barge_in_time: float = 0.0
        self._barge_in_count: int = 0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    @property
    def state(self) -> TurnState:
        return self._state

    @property
    def is_idle(self) -> bool:
        return self._state == TurnState.IDLE

    @property
    def is_listening(self) -> bool:
        return self._state in (TurnState.LISTENING, TurnState.USER_SPEAKING)

    @property
    def is_responding(self) -> bool:
        return self._state == TurnState.RESPONDING

    @property
    def is_interrupted(self) -> bool:
        return self._state == TurnState.INTERRUPTED

    async def transition(self, to_state: TurnState, reason: str = "") -> None:
        """
        Transition to a new state. Validates the transition and fires callbacks.

        Args:
            to_state: Target state.
            reason: Human-readable reason for the transition.
        """
        async with self._lock:
            valid_next = self.VALID_TRANSITIONS.get(self._state, [])
            if to_state not in valid_next:
                raise ValueError(
                    f"Invalid transition: {self._state.name} → {to_state.name}. "
                    f"Valid: {[s.name for s in valid_next]}"
                )

            event = TurnEvent(
                from_state=self._state,
                to_state=to_state,
                reason=reason,
            )
            self._state = to_state
            self._event_history.append(event)

            if len(self._event_history) > self._max_history:
                self._event_history = self._event_history[-self._max_history:]

            if to_state == TurnState.INTERRUPTED:
                self._last_barge_in_time = event.timestamp
                self._barge_in_count += 1

        # ── DIAGNOSTIC: log every transition with timestamp (outside lock) ──
        _state_log(
            f"{event.from_state.name} → {event.to_state.name}  "
            f"reason=\"{event.reason}\""
        )

        # Fire listeners outside the lock
        for listener in self._listeners:
            try:
                listener(event)
            except Exception:
                pass

    # Convenience transitions
    async def start_listening(self, reason: str = "session started") -> None:
        await self.transition(TurnState.LISTENING, reason)

    async def user_started_speaking(self, reason: str = "VAD speech onset") -> None:
        await self.transition(TurnState.USER_SPEAKING, reason)

    async def user_stopped_speaking(self, reason: str = "VAD end of utterance") -> None:
        await self.transition(TurnState.PROCESSING, reason)

    async def start_responding(self, reason: str = "TTS playback started") -> None:
        await self.transition(TurnState.RESPONDING, reason)

    async def response_complete(self, reason: str = "TTS finished") -> None:
        await self.transition(TurnState.IDLE, reason)

    async def user_interrupted(self, reason: str = "VAD barge-in detected") -> None:
        await self.transition(TurnState.INTERRUPTED, reason)

    async def resume_listening(self, reason: str = "TTS flushed, listening") -> None:
        await self.transition(TurnState.LISTENING, reason)

    async def stop(self, reason: str = "session ended") -> None:
        # Allow stop from any state
        self._state = TurnState.IDLE
        event = TurnEvent(from_state=TurnState.IDLE, to_state=TurnState.IDLE, reason=reason)
        self._event_history.append(event)

    # ------------------------------------------------------------------
    # Listener registration
    # ------------------------------------------------------------------
    def on_state_change(self, listener: Callable[[TurnEvent], None]) -> None:
        """Register a callback for state transitions."""
        self._listeners.append(listener)

    # ------------------------------------------------------------------
    # Metrics
    # ------------------------------------------------------------------
    @property
    def barge_in_count(self) -> int:
        return self._barge_in_count

    @property
    def history(self) -> list[TurnEvent]:
        return list(self._event_history)

    def last_event(self) -> Optional[TurnEvent]:
        return self._event_history[-1] if self._event_history else None

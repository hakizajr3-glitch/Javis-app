"""
Main voice-to-voice pipeline orchestrator.

Wires together:
  Audio I/O → VAD → STT → (LLM stub) → TTS
with full-duplex barge-in support and latency tracking.

LLM integration point: self._llm_handler(text) → response_text
Replace the stub with your actual LLM call (Gemini, local model, etc.).
"""

import asyncio
import time
from typing import Optional, Callable

from .audio_io import DuplexAudioStream, AudioConfig
from .vad_engine import VADEngine, VADConfig
from .stt_engine import StreamingSTT, STTConfig
from .tts_engine import TTSEngine, TTSConfig
from .state_machine import TurnStateMachine, TurnState
from .latency import LatencyTracker


class JarvisVoicePipeline:
    """
    Full-duplex real-time voice-to-voice pipeline.

    Usage:
        pipeline = JarvisVoicePipeline(
            llm_handler=lambda text: f"You said: {text}",
            on_state_change=lambda evt: print(f"{evt.from_state} → {evt.to_state}"),
        )
        await pipeline.start()
        # ... voice conversation happens ...
        await pipeline.stop()
    """

    def __init__(
        self,
        llm_handler: Optional[Callable[[str], str]] = None,
        on_state_change: Optional[Callable] = None,
        on_partial_transcript: Optional[Callable[[str], None]] = None,
        on_final_transcript: Optional[Callable[[str], None]] = None,
        on_response: Optional[Callable[[str], None]] = None,
        on_error: Optional[Callable[[str], None]] = None,
    ):
        """
        Args:
            llm_handler: async function taking user text, returning response text.
                         Replace with your actual LLM call.
            on_state_change: Called on each state transition with TurnEvent.
            on_partial_transcript: Called with partial STT results.
            on_final_transcript: Called with final transcription.
            on_response: Called with the response text.
            on_error: Called on pipeline errors.
        """
        # Configuration
        self.audio_config = AudioConfig(sample_rate=16000, block_size=480)
        self.vad_config = VADConfig(speech_threshold=0.5)
        self.stt_config = STTConfig(model_size="base")
        self.tts_config = TTSConfig()

        # Handlers
        self._llm_handler = llm_handler or self._default_llm
        self._on_state_change = on_state_change
        self._on_partial_transcript = on_partial_transcript
        self._on_final_transcript = on_final_transcript
        self._on_response = on_response
        self._on_error = on_error

        # Components
        self.audio: Optional[DuplexAudioStream] = None
        self.vad: Optional[VADEngine] = None
        self.stt: Optional[StreamingSTT] = None
        self.tts: Optional[TTSEngine] = None
        self.state_machine = TurnStateMachine()
        self.latency = LatencyTracker()

        # Internal state
        self._running = False
        self._last_user_text: str = ""
        self._is_tts_playing: bool = False

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    async def start(self) -> None:
        """Start the voice pipeline. Begins listening immediately."""
        if self._running:
            return
        self._running = True

        # Register state change listener
        if self._on_state_change:
            self.state_machine.on_state_change(self._on_state_change)

        # Initialize components
        self.audio = DuplexAudioStream(self.audio_config)
        self.vad = VADEngine(self.vad_config)
        self.stt = StreamingSTT(self.stt_config)
        self.tts = TTSEngine(self.tts_config)

        # Load models
        self.vad.load_model()
        self.stt.load_model()
        self.tts.start()

        # Start STT with callbacks
        self.stt.start(
            on_partial=self._on_stt_partial,
            on_final=self._on_stt_final,
            on_error=self._emit_error,
        )

        # Start audio stream — feeds mic into VAD
        self.audio.start(on_audio_in=self._on_audio_chunk)

        # Start in listening state
        await self.state_machine.start_listening()
        print("[Jarvis Voice] Pipeline started — listening.")

    async def stop(self) -> None:
        """Stop the pipeline and release all resources."""
        self._running = False
        if self.audio:
            self.audio.stop()
        if self.stt:
            self.stt.stop()
        if self.tts:
            self.tts.stop()
        await self.state_machine.stop()
        print("[Jarvis Voice] Pipeline stopped.")
        print(self.latency.summary())

    # ------------------------------------------------------------------
    # Audio callback — runs on the audio thread
    # ------------------------------------------------------------------
    def _on_audio_chunk(self, chunk) -> None:
        """
        Called by the audio stream for each 30ms chunk.
        This runs on the CoreAudio callback thread — keep it fast!
        """
        state = self.state_machine.state
        now = time.monotonic()

        # Feed STT buffer always (so we have audio context)
        self.stt.feed(chunk)

        if state == TurnState.LISTENING:
            # Check for speech onset
            is_speech = self.vad.update(chunk)
            if is_speech:
                print(
                    f"VAD_TRIGGER t={now:.3f} state={state.name} "
                    f"prob={self.vad.last_probability:.3f} "
                    f"tts_playing={self._is_tts_playing}"
                )
                asyncio.run_coroutine_threadsafe(
                    self._handle_speech_onset(), asyncio.get_event_loop()
                )

        elif state == TurnState.USER_SPEAKING:
            # Continue tracking until silence
            is_speech = self.vad.update(chunk)
            if not is_speech and self.vad.speech_duration_ms > 0:
                asyncio.run_coroutine_threadsafe(
                    self._handle_speech_end(), asyncio.get_event_loop()
                )

        elif state == TurnState.RESPONDING:
            # Check for barge-in — user interrupts TTS
            barge_prob = self.vad.process(chunk)
            barge_threshold = max(0.3, self.vad.config.speech_threshold - 0.15)
            # Heartbeat every ~2s to confirm the audio callback is alive
            if not hasattr(self, '_last_resp_heartbeat'):
                self._last_resp_heartbeat = 0.0
            if now - self._last_resp_heartbeat >= 2.0:
                self._last_resp_heartbeat = now
                print(
                    f"VAD_CHECK t={now:.3f} state={state.name} "
                    f"prob={barge_prob:.3f} threshold={barge_threshold:.2f} "
                    f"tts_is_speaking={self.tts.is_speaking if self.tts else 'N/A'}"
                )
            if barge_prob >= barge_threshold:
                print(
                    f"VAD_TRIGGER t={now:.3f} state={state.name} "
                    f"prob={barge_prob:.3f} threshold={barge_threshold:.2f} "
                    f"tts_playing={self._is_tts_playing}"
                )
                asyncio.run_coroutine_threadsafe(
                    self._handle_barge_in(), asyncio.get_event_loop()
                )

        else:
            # PROCESSING, INTERRUPTED, IDLE — still run VAD in case we
            # need to detect speech (e.g. during PROCESSING / LLM call)
            prob = self.vad.process(chunk)
            if prob >= self.vad.config.speech_threshold:
                print(
                    f"VAD_TRIGGER t={now:.3f} state={state.name} "
                    f"prob={prob:.3f} tts_playing={self._is_tts_playing}"
                )

    # ------------------------------------------------------------------
    # State transition handlers (run on asyncio event loop)
    # ------------------------------------------------------------------
    async def _handle_speech_onset(self) -> None:
        """User started speaking."""
        self.latency.new_turn()
        self.latency.mark_speech_onset()
        self.vad.set_tts_active(False)
        await self.state_machine.user_started_speaking()

    async def _handle_speech_end(self) -> None:
        """User stopped speaking — transcribe and process."""
        self.latency.mark_speech_end()
        await self.state_machine.user_stopped_speaking()

        # Get final transcript
        text = self.stt.finalize()
        self.latency.mark_final_transcript()
        self._last_user_text = text

        if text.strip():
            if self._on_final_transcript:
                self._on_final_transcript(text)
            # Process through LLM
            await self._process_response(text)
        else:
            await self.state_machine.resume_listening()

    async def _handle_barge_in(self) -> None:
        """User interrupted during TTS playback — barge-in!"""
        t0 = time.monotonic()
        print(
            f"INTERRUPT_HANDLER_CALLED t={t0:.3f} "
            f"tts_is_speaking={self.tts.is_speaking if self.tts else 'N/A'}"
        )
        self.latency.mark_barge_in_detected()

        # Immediately stop TTS and flush any queued audio
        self.tts.cancel()
        self.audio.flush_output()
        self.stt.clear_buffer()
        self.vad.set_tts_active(False)
        self._is_tts_playing = False
        self.latency.mark_tts_halted()

        print(
            f"PLAYBACK_HALTED t={time.monotonic():.3f} "
            f"halt_latency_ms={(time.monotonic() - t0)*1000:.1f} "
            f"tts_is_speaking_after={self.tts.is_speaking if self.tts else 'N/A'}"
        )

        await self.state_machine.user_interrupted(
            reason=f"barge-in halted in {self.latency.current.barge_in_to_halt_ms:.0f}ms"
        )
        # Switch to listening immediately
        await self.state_machine.resume_listening()

    async def _process_response(self, user_text: str) -> None:
        """Run LLM and speak the response."""
        # Run LLM in a thread executor so the event loop stays alive
        # for barge-in events during processing.
        loop = asyncio.get_event_loop()
        response_text = await loop.run_in_executor(
            None, self._llm_handler, user_text
        )
        if self._on_response:
            self._on_response(response_text)

        if not response_text.strip():
            await self.state_machine.resume_listening()
            return

        # Start speaking
        self.latency.mark_tts_received()
        self.vad.set_tts_active(True)
        self._is_tts_playing = True

        await self.state_machine.start_responding()

        def _on_tts_start():
            self.latency.mark_tts_first_audio()

        def _on_tts_done():
            self._is_tts_playing = False
            self.latency.finish_turn()
            asyncio.run_coroutine_threadsafe(
                self.state_machine.response_complete(), asyncio.get_event_loop()
            )

        def _on_tts_cancelled():
            self._is_tts_playing = False

        self.tts.speak(
            response_text,
            on_start=_on_tts_start,
            on_done=_on_tts_done,
            on_cancelled=_on_tts_cancelled,
        )

    # ------------------------------------------------------------------
    # STT callbacks
    # ------------------------------------------------------------------
    def _on_stt_partial(self, text: str) -> None:
        """Partial transcript update."""
        if not self.latency.current or self.latency.current.stt_first_partial_time == 0:
            self.latency.mark_first_partial()
        if self._on_partial_transcript:
            self._on_partial_transcript(text)

    def _on_stt_final(self, text: str) -> None:
        """Final transcript."""
        pass  # Handled in _handle_speech_end

    # ------------------------------------------------------------------
    # Error handling
    # ------------------------------------------------------------------
    def _emit_error(self, msg: str) -> None:
        if self._on_error:
            self._on_error(msg)

    # ------------------------------------------------------------------
    # Default LLM (echo — replace with your actual LLM)
    # ------------------------------------------------------------------
    def _default_llm(self, text: str) -> str:
        """Stub LLM handler — echoes back. Replace with Gemini/local model."""
        return f"I heard you say: {text}"

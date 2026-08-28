"""
Latency instrumentation for the voice pipeline.

Tracks key timing metrics:
  - speech_onset_to_stt_first_partial: VAD detects speech → first STT partial
  - speech_end_to_final_transcript: silence detected → final transcript
  - text_to_first_audio_byte: TTS text received → first audio output
  - barge_in_detect_to_playback_halted: VAD barge-in → TTS stopped
  - total_turn_time: speech onset → response audio complete
"""

import time
from dataclasses import dataclass, field
from collections import deque
from typing import Optional


@dataclass
class TurnMetrics:
    """Metrics for a single conversation turn."""
    turn_id: int = 0

    # STT timing
    speech_onset_time: float = 0.0       # VAD first detected speech
    stt_first_partial_time: float = 0.0  # First partial transcript
    speech_end_time: float = 0.0         # VAD silence detected
    stt_final_time: float = 0.0          # Final transcript ready

    # TTS timing
    tts_text_received_time: float = 0.0  # Text handed to TTS
    tts_first_audio_time: float = 0.0    # First audio byte out

    # Barge-in timing
    barge_in_detected_time: float = 0.0  # VAD detected user during TTS
    tts_halted_time: float = 0.0         # TTS stopped

    @property
    def speech_to_first_partial_ms(self) -> float:
        return (self.stt_first_partial_time - self.speech_onset_time) * 1000

    @property
    def speech_end_to_final_ms(self) -> float:
        return (self.stt_final_time - self.speech_end_time) * 1000

    @property
    def text_to_first_audio_ms(self) -> float:
        return (self.tts_first_audio_time - self.tts_text_received_time) * 1000

    @property
    def barge_in_to_halt_ms(self) -> float:
        if self.barge_in_detected_time == 0 or self.tts_halted_time == 0:
            return 0.0
        return (self.tts_halted_time - self.barge_in_detected_time) * 1000

    @property
    def total_turn_ms(self) -> float:
        if self.speech_onset_time == 0 or self.tts_first_audio_time == 0:
            return 0.0
        return (self.tts_first_audio_time - self.speech_onset_time) * 1000


@dataclass
class LatencyStats:
    """Aggregated latency statistics across turns."""
    turns: int = 0
    total_speech_to_partial_ms: float = 0.0
    total_speech_to_final_ms: float = 0.0
    total_text_to_audio_ms: float = 0.0
    total_barge_in_halt_ms: float = 0.0
    total_turn_time_ms: float = 0.0

    min_speech_to_partial_ms: float = float("inf")
    max_speech_to_partial_ms: float = 0.0
    min_text_to_audio_ms: float = float("inf")
    max_text_to_audio_ms: float = 0.0
    min_barge_in_halt_ms: float = float("inf")
    max_barge_in_halt_ms: float = 0.0

    barge_in_count: int = 0

    def record(self, metrics: TurnMetrics) -> None:
        self.turns += 1
        sp = metrics.speech_to_first_partial_ms
        sf = metrics.speech_end_to_final_ms
        ta = metrics.text_to_first_audio_ms
        bh = metrics.barge_in_to_halt_ms
        tt = metrics.total_turn_ms

        self.total_speech_to_partial_ms += sp
        self.total_speech_to_final_ms += sf
        self.total_text_to_audio_ms += ta
        self.total_turn_time_ms += tt

        if sp > 0:
            self.min_speech_to_partial_ms = min(self.min_speech_to_partial_ms, sp)
            self.max_speech_to_partial_ms = max(self.max_speech_to_partial_ms, sp)
        if ta > 0:
            self.min_text_to_audio_ms = min(self.min_text_to_audio_ms, ta)
            self.max_text_to_audio_ms = max(self.max_text_to_audio_ms, ta)
        if bh > 0:
            self.total_barge_in_halt_ms += bh
            self.barge_in_count += 1
            self.min_barge_in_halt_ms = min(self.min_barge_in_halt_ms, bh)
            self.max_barge_in_halt_ms = max(self.max_barge_in_halt_ms, bh)

    @property
    def avg_speech_to_partial_ms(self) -> float:
        return self.total_speech_to_partial_ms / self.turns if self.turns else 0

    @property
    def avg_speech_to_final_ms(self) -> float:
        return self.total_speech_to_final_ms / self.turns if self.turns else 0

    @property
    def avg_text_to_audio_ms(self) -> float:
        return self.total_text_to_audio_ms / self.turns if self.turns else 0

    @property
    def avg_barge_in_halt_ms(self) -> float:
        return (self.total_barge_in_halt_ms / self.barge_in_count
                if self.barge_in_count else 0)

    @property
    def avg_total_turn_ms(self) -> float:
        return self.total_turn_time_ms / self.turns if self.turns else 0

    def summary(self) -> str:
        lines = [
            f"=== Latency Stats ({self.turns} turns) ===",
            f"  Speech → first partial:  "
            f"avg={self.avg_speech_to_partial_ms:.0f}ms  "
            f"min={self.min_speech_to_partial_ms:.0f}ms  "
            f"max={self.max_speech_to_partial_ms:.0f}ms",
            f"  Speech end → final:      avg={self.avg_speech_to_final_ms:.0f}ms",
            f"  Text → first audio:       "
            f"avg={self.avg_text_to_audio_ms:.0f}ms  "
            f"min={self.min_text_to_audio_ms:.0f}ms  "
            f"max={self.max_text_to_audio_ms:.0f}ms",
            f"  Barge-in → TTS halted:   "
            f"avg={self.avg_barge_in_halt_ms:.0f}ms  "
            f"min={self.min_barge_in_halt_ms:.0f}ms  "
            f"max={self.max_barge_in_halt_ms:.0f}ms  "
            f"({self.barge_in_count} events)",
            f"  Total turn time:         avg={self.avg_total_turn_ms:.0f}ms",
        ]
        return "\n".join(lines)


class LatencyTracker:
    """
    Tracks per-turn and aggregate latency metrics.
    Thread-safe for use across audio/STT/TTS threads.
    """

    def __init__(self):
        self._current: Optional[TurnMetrics] = None
        self._stats = LatencyStats()
        self._turn_counter: int = 0

    # ------------------------------------------------------------------
    # Per-turn recording
    # ------------------------------------------------------------------
    def new_turn(self) -> TurnMetrics:
        self._turn_counter += 1
        self._current = TurnMetrics(turn_id=self._turn_counter)
        return self._current

    @property
    def current(self) -> Optional[TurnMetrics]:
        return self._current

    def mark_speech_onset(self) -> None:
        if self._current:
            self._current.speech_onset_time = time.monotonic()

    def mark_first_partial(self) -> None:
        if self._current:
            self._current.stt_first_partial_time = time.monotonic()

    def mark_speech_end(self) -> None:
        if self._current:
            self._current.speech_end_time = time.monotonic()

    def mark_final_transcript(self) -> None:
        if self._current:
            self._current.stt_final_time = time.monotonic()

    def mark_tts_received(self) -> None:
        if self._current:
            self._current.tts_text_received_time = time.monotonic()

    def mark_tts_first_audio(self) -> None:
        if self._current:
            self._current.tts_first_audio_time = time.monotonic()

    def mark_barge_in_detected(self) -> None:
        if self._current:
            self._current.barge_in_detected_time = time.monotonic()

    def mark_tts_halted(self) -> None:
        if self._current:
            self._current.tts_halted_time = time.monotonic()

    def finish_turn(self) -> None:
        if self._current:
            self._stats.record(self._current)
            self._current = None

    # ------------------------------------------------------------------
    # Aggregate stats
    # ------------------------------------------------------------------
    @property
    def stats(self) -> LatencyStats:
        return self._stats

    def summary(self) -> str:
        return self._stats.summary()

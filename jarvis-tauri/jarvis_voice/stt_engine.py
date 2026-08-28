"""
Streaming Speech-to-Text via faster-whisper (CTranslate2 backend).

Provides partial (incremental) transcripts as the user speaks — not batch
transcription after silence. The engine runs on a background thread and
publishes partial results through an asyncio-safe callback.

Model selection:
  tiny  →  39M params, ~50ms first partial, lower accuracy
  base  →  74M params, ~100ms first partial, decent accuracy
  small → 244M params, ~200ms first partial, good accuracy
  (medium/large exist but sacrifice latency)

For real-time voice, tiny or base is recommended.
"""

import asyncio
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional, Callable
import numpy as np

try:
    from faster_whisper import WhisperModel
    HAS_WHISPER = True
except ImportError:
    HAS_WHISPER = False


@dataclass
class STTConfig:
    """STT engine configuration."""
    model_size: str = "base"            # tiny | base | small | medium
    compute_type: str = "int8"         # int8 | float16 | float32
    device: str = "auto"               # auto | cpu | cuda
    cpu_threads: int = 4
    num_workers: int = 1
    language: Optional[str] = "en"     # None = auto-detect
    vad_filter: bool = True            # Use internal VAD for segmentation
    # Streaming config
    min_speech_duration: float = 0.1   # seconds
    max_silence_duration: float = 0.8  # seconds
    partial_interval: float = 0.2      # seconds between partial updates


@dataclass
class STTStats:
    """STT performance statistics."""
    utterances_transcribed: int = 0
    total_audio_seconds: float = 0.0
    last_latency_ms: float = 0.0       # time from audio end to final transcript
    min_latency_ms: float = float("inf")
    max_latency_ms: float = 0.0


class StreamingSTT:
    """
    Streaming speech-to-text with partial transcript support.

    Audio is accumulated in a ring buffer. A background thread periodically
    transcribes the buffer and produces partial results through callbacks.
    When speech ends (VAD silence), a final transcription is produced.
    """

    def __init__(self, config: Optional[STTConfig] = None):
        if not HAS_WHISPER:
            raise RuntimeError("faster-whisper not installed: pip install faster-whisper")
        self.config = config or STTConfig()
        self.stats = STTStats()
        self._model: Optional[WhisperModel] = None
        self._model_loaded = False

        # Audio buffer (ring buffer of float32 samples @ 16kHz)
        self._buffer: deque = deque()
        self._buffer_samples: int = 0
        self._max_buffer_samples: int = 16000 * 30  # 30 seconds max

        # State
        self._running = threading.Event()
        self._transcribing = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._last_partial: str = ""
        self._last_final: str = ""

        # Callbacks
        self._on_partial: Optional[Callable[[str], None]] = None
        self._on_final: Optional[Callable[[str], None]] = None
        self._on_error: Optional[Callable[[str], None]] = None

    # ------------------------------------------------------------------
    # Model loading
    # ------------------------------------------------------------------
    def load_model(self) -> None:
        """Load the faster-whisper model."""
        if self._model_loaded:
            return
        self._model = WhisperModel(
            self.config.model_size,
            device=self.config.device,
            compute_type=self.config.compute_type,
            cpu_threads=self.config.cpu_threads,
            num_workers=self.config.num_workers,
        )
        self._model_loaded = True

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    def start(
        self,
        on_partial: Optional[Callable[[str], None]] = None,
        on_final: Optional[Callable[[str], None]] = None,
        on_error: Optional[Callable[[str], None]] = None,
    ) -> None:
        """Start the STT engine with callbacks for transcript events."""
        if not self._model_loaded:
            self.load_model()
        self._on_partial = on_partial
        self._on_final = on_final
        self._on_error = on_error
        self._running.set()
        self._thread = threading.Thread(target=self._transcribe_loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        """Stop the STT engine."""
        self._running.clear()
        if self._thread is not None:
            self._thread.join(timeout=2.0)

    # ------------------------------------------------------------------
    # Audio input
    # ------------------------------------------------------------------
    def feed(self, audio_chunk: np.ndarray) -> None:
        """
        Feed a chunk of audio (float32, 16kHz) into the streaming buffer.
        Thread-safe — can be called from the audio callback thread.
        """
        self._buffer.append(audio_chunk.copy())
        self._buffer_samples += len(audio_chunk)
        # Trim old audio
        while self._buffer_samples > self._max_buffer_samples:
            if self._buffer:
                old = self._buffer.popleft()
                self._buffer_samples -= len(old)

    def clear_buffer(self) -> None:
        """Clear accumulated audio (for barge-in / reset)."""
        self._buffer.clear()
        self._buffer_samples = 0
        self._last_partial = ""

    # ------------------------------------------------------------------
    # Transcription loop
    # ------------------------------------------------------------------
    def _transcribe_loop(self) -> None:
        """Background thread: periodically transcribe the audio buffer."""
        while self._running.is_set():
            if self._buffer_samples < 16000 * self.config.min_speech_duration:
                time.sleep(0.05)
                continue

            self._transcribing.set()
            try:
                self._do_transcribe(is_final=False)
            except Exception as e:
                if self._on_error:
                    self._on_error(str(e))
            finally:
                self._transcribing.clear()

            time.sleep(self.config.partial_interval)

    def _do_transcribe(self, is_final: bool = False) -> None:
        """Run transcription on the current buffer."""
        if not self._buffer or self._model is None:
            return

        # Build audio array from buffer
        audio = np.concatenate(list(self._buffer)).astype(np.float32)

        if len(audio) < 16000 * 0.1:  # At least 100ms
            return

        t_start = time.monotonic()
        segments, _ = self._model.transcribe(
            audio,
            language=self.config.language,
            vad_filter=self.config.vad_filter,
            beam_size=3 if is_final else 1,  # Faster for partials
            best_of=3 if is_final else 1,
        )

        text = " ".join(seg.text.strip() for seg in segments)
        latency = (time.monotonic() - t_start) * 1000

        if is_final:
            self.stats.utterances_transcribed += 1
            self.stats.total_audio_seconds += len(audio) / 16000
            self.stats.last_latency_ms = latency
            self.stats.min_latency_ms = min(self.stats.min_latency_ms, latency)
            self.stats.max_latency_ms = max(self.stats.max_latency_ms, latency)
            self._last_final = text
            if text.strip() and self._on_final:
                self._on_final(text)
        else:
            if text.strip() and text != self._last_partial:
                self._last_partial = text
                if self._on_partial:
                    self._on_partial(text)

    # ------------------------------------------------------------------
    # Final transcription (called when VAD detects end of speech)
    # ------------------------------------------------------------------
    def finalize(self) -> str:
        """
        Produce a final transcription of all buffered audio.
        Call this when VAD detects end of speech.
        """
        self._do_transcribe(is_final=True)
        self.clear_buffer()
        return self._last_final

    # ------------------------------------------------------------------
    # State queries
    # ------------------------------------------------------------------
    @property
    def last_transcript(self) -> str:
        return self._last_final or self._last_partial

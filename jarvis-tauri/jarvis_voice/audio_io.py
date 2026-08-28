"""
Full-duplex audio I/O via sounddevice (PortAudio / CoreAudio backend).

Provides simultaneous microphone capture and speaker playback through
a single callback-driven stream. Audio flows continuously — no push-to-talk.
"""

import asyncio
import threading
import queue
from dataclasses import dataclass, field
from typing import Optional, Callable
import numpy as np

try:
    import sounddevice as sd
    HAS_SOUNDDEVICE = True
except ImportError:
    HAS_SOUNDDEVICE = False


@dataclass
class AudioConfig:
    """Audio stream configuration."""
    sample_rate: int = 16000          # 16 kHz — standard for speech
    block_size: int = 480             # 30ms blocks at 16kHz for VAD alignment
    channels_in: int = 1
    channels_out: int = 1
    device_in: Optional[int] = None   # None = system default
    device_out: Optional[int] = None
    dtype: str = "float32"


@dataclass
class AudioStats:
    """Live audio stream statistics."""
    blocks_captured: int = 0
    blocks_played: int = 0
    peak_input: float = 0.0
    peak_output: float = 0.0
    underflows: int = 0
    overflows: int = 0


class DuplexAudioStream:
    """
    Full-duplex audio stream.

    Feeds microphone audio to a consumer callback while simultaneously
    pulling speaker audio from a producer queue. Runs on a dedicated
    high-priority CoreAudio callback thread for minimal latency.
    """

    def __init__(self, config: Optional[AudioConfig] = None):
        if not HAS_SOUNDDEVICE:
            raise RuntimeError("sounddevice not installed: pip install sounddevice")
        self.config = config or AudioConfig()
        self.stats = AudioStats()
        self._stream: Optional[sd.Stream] = None
        self._running = threading.Event()
        self._output_queue: queue.Queue = queue.Queue(maxsize=64)
        self._on_audio_in: Optional[Callable[[np.ndarray], None]] = None
        self._audio_event: Optional[asyncio.Event] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def start(
        self,
        on_audio_in: Callable[[np.ndarray], None],
    ) -> None:
        """
        Start duplex streaming.

        Args:
            on_audio_in: Called on the audio callback thread with each
                          captured block as float32 numpy array [-1.0, 1.0].
        """
        if self._running.is_set():
            raise RuntimeError("Stream already running")
        self._on_audio_in = on_audio_in
        self._running.set()

        def _callback(indata: np.ndarray, outdata: np.ndarray,
                      frames: int, time_info, status):
            if status:
                if status.input_overflow:
                    self.stats.overflows += 1
                if status.output_underflow:
                    self.stats.underflows += 1

            # Capture
            block = indata.copy().flatten().astype(np.float32)
            peak = float(np.abs(block).max())
            if peak > self.stats.peak_input:
                self.stats.peak_input = peak
            self.stats.blocks_captured += 1

            try:
                self._on_audio_in(block)
            except Exception:
                pass  # Don't crash the audio thread

            # Playback
            try:
                out_block = self._output_queue.get_nowait()
                out_flat = out_block.flatten().astype(np.float32)
            except queue.Empty:
                out_flat = np.zeros(frames, dtype=np.float32)
                if self.stats.underflows == 0:
                    self.stats.underflows += 1

            if len(out_flat) < frames:
                padded = np.zeros(frames, dtype=np.float32)
                padded[:len(out_flat)] = out_flat
                out_flat = padded
            elif len(out_flat) > frames:
                out_flat = out_flat[:frames]

            peak_out = float(np.abs(out_flat).max())
            if peak_out > self.stats.peak_output:
                self.stats.peak_output = peak_out
            self.stats.blocks_played += 1

            outdata[:, 0] = out_flat

        self._stream = sd.Stream(
            samplerate=self.config.sample_rate,
            blocksize=self.config.block_size,
            device=(self.config.device_in, self.config.device_out),
            channels=(self.config.channels_in, self.config.channels_out),
            dtype=self.config.dtype,
            callback=_callback,
            latency="low",
        )
        self._stream.start()

    def stop(self) -> None:
        """Stop the stream and release audio devices."""
        self._running.clear()
        if self._stream is not None:
            self._stream.stop()
            self._stream.close()
            self._stream = None
        # Drain the output queue
        while not self._output_queue.empty():
            try:
                self._output_queue.get_nowait()
            except queue.Empty:
                break

    def write(self, audio: np.ndarray) -> None:
        """
        Push audio for playback. Non-blocking — drops if queue is full.

        Args:
            audio: float32 numpy array, sample rate must match config.
        """
        try:
            self._output_queue.put_nowait(audio)
        except queue.Full:
            self.stats.underflows += 1

    def flush_output(self) -> None:
        """Immediately clear all queued output audio (for barge-in)."""
        while not self._output_queue.empty():
            try:
                self._output_queue.get_nowait()
            except queue.Empty:
                break

    def reset_stats(self) -> None:
        """Reset statistics counters."""
        self.stats = AudioStats()

    # ------------------------------------------------------------------
    # Convenience
    # ------------------------------------------------------------------
    @staticmethod
    def silence_block(duration_ms: int = 30, sample_rate: int = 16000) -> np.ndarray:
        """Generate a block of silence."""
        samples = int(sample_rate * duration_ms / 1000)
        return np.zeros(samples, dtype=np.float32)

    @staticmethod
    def list_devices() -> None:
        """Print available audio devices."""
        if not HAS_SOUNDDEVICE:
            print("sounddevice not installed")
            return
        print(sd.query_devices())

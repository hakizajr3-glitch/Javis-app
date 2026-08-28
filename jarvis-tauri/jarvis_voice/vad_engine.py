"""
Voice Activity Detection via silero-vad ONNX model.

Runs on 30ms audio chunks. Outputs speech probability [0, 1].
Includes echo-awareness: when TTS is actively playing, the VAD sensitivity
is dynamically reduced to prevent self-triggering (software AEC lite).
"""

import time
from dataclasses import dataclass
from typing import Optional
import numpy as np

try:
    import onnxruntime
    HAS_ONNX = True
except ImportError:
    HAS_ONNX = False


@dataclass
class VADConfig:
    """VAD configuration."""
    sample_rate: int = 16000
    chunk_size: int = 480              # 30ms @ 16kHz
    speech_threshold: float = 0.5      # Probability above which = speech
    silence_threshold: float = 0.35    # Below which = silence (hysteresis)
    speech_confirm_frames: int = 3     # Consecutive speech frames to confirm onset
    silence_confirm_frames: int = 10   # Consecutive silence frames to confirm end
    echo_damping: float = 0.25         # How much to raise threshold during TTS playback
    min_speech_duration_ms: int = 100  # Ignore speech shorter than this
    max_silence_duration_ms: int = 500 # End of utterance after this much silence


class VADEngine:
    """
    Voice Activity Detection engine.

    Features:
      - Speech onset detection in ~30ms
      - Hysteresis to avoid flickering
      - Echo damping when TTS is active (raises threshold)
      - Minimum speech/maximum silence durations
    """

    # silero-vad expects 512 samples at 16kHz; we pad our 480-sample chunks
    SILERO_WINDOW = 512

    def __init__(self, config: Optional[VADConfig] = None):
        if not HAS_ONNX:
            raise RuntimeError("onnxruntime not installed")
        self.config = config or VADConfig()
        self._model: Optional[onnxruntime.InferenceSession] = None
        self._state = np.zeros((2, 1, 128), dtype=np.float32)
        self._context = np.zeros(1, dtype=np.int64)
        self._sample_rate_tensor = np.array([self.config.sample_rate], dtype=np.int64)
        self._model_loaded = False

        # State tracking
        self._consecutive_speech: int = 0
        self._consecutive_silence: int = 0
        self._is_speaking: bool = False
        self._speech_start_time: Optional[float] = None
        self._silence_start_time: Optional[float] = None
        self._last_prob: float = 0.0

        # Echo damping state
        self._tts_active: bool = False
        self._effective_threshold: float = self.config.speech_threshold

    # ------------------------------------------------------------------
    # Model loading
    # ------------------------------------------------------------------
    def load_model(self) -> None:
        """Download and load the silero-vad ONNX model."""
        if self._model_loaded:
            return
        try:
            import torch
            model, _ = torch.hub.load(
                repo_or_dir='snakers4/silero-vad',
                model='silero_vad',
                onnx=True,
                force_reload=False,
            )
            # Export to ONNX in memory
            import io
            buf = io.BytesIO()
            dummy_input = torch.zeros(1, self.SILERO_WINDOW)
            dummy_state = torch.zeros(2, 1, 128)
            torch.onnx.export(
                model, (dummy_input, dummy_state),
                buf, input_names=['input', 'state'],
                output_names=['output', 'state_out'],
                dynamic_axes={'input': {0: 'batch'}},
                opset_version=12,
            )
            buf.seek(0)
            self._model = onnxruntime.InferenceSession(buf.read())
            self._model_loaded = True
        except Exception as e:
            # Fallback: try loading from silero-vad package
            try:
                import silero_vad
                self._model = silero_vad.load_silero_vad(onnx=True)
                self._model_loaded = True
            except Exception:
                raise RuntimeError(
                    f"Failed to load silero-vad model: {e}. "
                    "Ensure PyTorch and silero-vad are installed."
                )

    # ------------------------------------------------------------------
    # Core VAD
    # ------------------------------------------------------------------
    def process(self, audio_chunk: np.ndarray) -> float:
        """
        Process a 30ms audio chunk. Returns speech probability [0, 1].

        Also updates internal speech/silence tracking for turn detection.
        """
        if not self._model_loaded:
            self.load_model()

        # Pad or trim to 512 samples
        if len(audio_chunk) < self.SILERO_WINDOW:
            padded = np.zeros(self.SILERO_WINDOW, dtype=np.float32)
            padded[:len(audio_chunk)] = audio_chunk
        else:
            padded = audio_chunk[:self.SILERO_WINDOW].astype(np.float32)

        batch = padded.reshape(1, -1)

        inputs = {
            'input': batch,
            'state': self._state,
            'sr': self._sample_rate_tensor.reshape(1),
        }
        output, state_out = self._model.run(['output', 'state_out'], inputs)
        self._state = state_out
        prob = float(output[0][0])
        self._last_prob = prob

        return prob

    def update(self, audio_chunk: np.ndarray) -> bool:
        """
        Process chunk and update internal state tracking.
        Returns True if the user is currently speaking.
        """
        prob = self.process(audio_chunk)
        threshold = self._effective_threshold
        now = time.monotonic()

        if prob >= threshold:
            self._consecutive_speech += 1
            self._consecutive_silence = 0

            if self._consecutive_speech >= self.config.speech_confirm_frames:
                if not self._is_speaking:
                    self._speech_start_time = now
                    self._is_speaking = True
                self._silence_start_time = None
        else:
            self._consecutive_silence += 1
            if self._consecutive_speech > 0:
                self._consecutive_speech = max(0, self._consecutive_speech - 1)

            if self._is_speaking:
                if self._silence_start_time is None:
                    self._silence_start_time = now

                silence_duration = (now - self._silence_start_time) * 1000
                if (self._consecutive_silence >= self.config.silence_confirm_frames
                        or silence_duration > self.config.max_silence_duration_ms):
                    # End of utterance
                    self._is_speaking = False
                    self._speech_start_time = None
                    self._silence_start_time = None
                    self._consecutive_speech = 0

        return self._is_speaking

    # ------------------------------------------------------------------
    # Barge-in detection (aggressive mode for detecting user during TTS)
    # ------------------------------------------------------------------
    def detect_barge_in(self, audio_chunk: np.ndarray) -> bool:
        """
        Aggressive speech detection for barge-in during TTS playback.
        Uses a lower threshold and fewer confirm frames for faster detection.
        """
        prob = self.process(audio_chunk)
        # More sensitive during TTS for faster barge-in
        barge_threshold = max(0.3, self.config.speech_threshold - 0.15)
        return prob >= barge_threshold

    # ------------------------------------------------------------------
    # Echo damping
    # ------------------------------------------------------------------
    def set_tts_active(self, active: bool) -> None:
        """Notify VAD that TTS is currently playing."""
        self._tts_active = active
        if active:
            self._effective_threshold = self.config.speech_threshold + self.config.echo_damping
        else:
            self._effective_threshold = self.config.speech_threshold

    # ------------------------------------------------------------------
    # State queries
    # ------------------------------------------------------------------
    @property
    def is_speaking(self) -> bool:
        return self._is_speaking

    @property
    def last_probability(self) -> float:
        return self._last_prob

    @property
    def speech_duration_ms(self) -> float:
        if self._speech_start_time is None:
            return 0.0
        return (time.monotonic() - self._speech_start_time) * 1000

    def reset(self) -> None:
        """Reset all internal state."""
        self._state = np.zeros((2, 1, 128), dtype=np.float32)
        self._consecutive_speech = 0
        self._consecutive_silence = 0
        self._is_speaking = False
        self._speech_start_time = None
        self._silence_start_time = None
        self._last_prob = 0.0
        self._effective_threshold = self.config.speech_threshold

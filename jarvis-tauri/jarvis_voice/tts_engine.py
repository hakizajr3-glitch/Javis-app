"""
Text-to-Speech engine using Apple's NSSpeechSynthesizer.

Why Apple TTS:
  - Sub-50ms time-to-first-audio-byte (fastest on macOS)
  - Instant cancellation via stopSpeaking
  - Daniel voice: British RP male, natural sounding, built-in
  - Zero model downloads -- part of macOS
  - Neural quality on modern macOS versions

Alternative: Kokoro ONNX (bm_george) when Python >= 3.10 is available.
"""

import threading
import time
from dataclasses import dataclass
from typing import Optional, Callable

try:
    from AppKit import NSSpeechSynthesizer, NSRunLoop, NSDefaultRunLoopMode
    from Foundation import NSTimer, NSDate
    HAS_APPKIT = True
except ImportError:
    HAS_APPKIT = False


DANIEL_VOICE = "com.apple.voice.compact.en-GB.Daniel"


@dataclass
class TTSConfig:
    voice_id: str = DANIEL_VOICE
    rate: float = 175.0
    volume: float = 0.9


class TTSStats:
    def __init__(self):
        self.utterances_synthesized: int = 0
        self.utterances_cancelled: int = 0
        self.total_chars_spoken: int = 0
        self.last_ttfa_ms: float = 0.0
        self.min_ttfa_ms: float = float("inf")
        self.max_ttfa_ms: float = 0.0


class TTSEngine:
    """
    Apple NSSpeechSynthesizer wrapper -- non-blocking, cancel-capable.

    Uses a dedicated NSRunLoop thread. NSSpeechSynthesizer needs a running
    run loop to produce audio, so we never block that thread. Instead we
    schedule a periodic NSTimer that polls isSpeaking() for completion
    and checks a cancel flag between polls.
    """

    def __init__(self, config: Optional[TTSConfig] = None):
        if not HAS_APPKIT:
            raise RuntimeError("AppKit not available -- macOS only")
        self.config = config or TTSConfig()
        self.stats = TTSStats()
        self._synth: Optional[NSSpeechSynthesizer] = None
        self._running = threading.Event()
        self._cancel_flag = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._run_loop: Optional[NSRunLoop] = None

        # Per-utterance state (set by speak(), read by the run-loop thread)
        self._lock = threading.Lock()
        self._pending_text: str = ""
        self._on_start: Optional[Callable[[], None]] = None
        self._on_done: Optional[Callable[[], None]] = None
        self._on_cancelled: Optional[Callable[[], None]] = None
        self._ttfa_start: float = 0.0
        self._poll_timer: Optional[NSTimer] = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    def start(self) -> None:
        if self._running.is_set():
            return
        self._running.set()
        self._thread = threading.Thread(target=self._run_loop_thread, daemon=True)
        self._thread.start()
        # Wait for the run loop to be ready
        for _ in range(50):
            if self._run_loop is not None:
                break
            time.sleep(0.01)

    def stop(self) -> None:
        self.cancel()
        self._running.clear()
        if self._synth is not None:
            self._synth = None
        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=1.0)

    # ------------------------------------------------------------------
    # Run loop thread
    # ------------------------------------------------------------------
    def _run_loop_thread(self) -> None:
        self._synth = NSSpeechSynthesizer.alloc().initWithVoice_(self.config.voice_id)
        self._synth.setRate_(self.config.rate)
        self._synth.setVolume_(self.config.volume)
        self._run_loop = NSRunLoop.currentRunLoop()

        while self._running.is_set():
            self._run_loop.limitDateForMode_(NSDefaultRunLoopMode)
            self._check_pending()
            time.sleep(0.01)

    def _check_pending(self) -> None:
        """If there's pending text, start speaking it (called from run loop thread)."""
        with self._lock:
            if not self._pending_text:
                return
            text = self._pending_text
            self._pending_text = ""
            on_start = self._on_start
            self._on_start = None

        self._cancel_flag.clear()
        self.stats.utterances_synthesized += 1
        self.stats.total_chars_spoken += len(text)

        self._synth.startSpeakingString_(text)
        ttfa = (time.monotonic() - self._ttfa_start) * 1000
        self.stats.last_ttfa_ms = ttfa
        self.stats.min_ttfa_ms = min(self.stats.min_ttfa_ms, ttfa)
        self.stats.max_ttfa_ms = max(self.stats.max_ttfa_ms, ttfa)

        if on_start:
            on_start()

        # Schedule a repeating timer to poll for completion/cancellation
        self._poll_timer = NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(
            0.02, self, "_poll_speaking:", None, True
        )

    def _poll_speaking_(self, timer) -> None:
        """Called every 20ms by NSTimer -- polls isSpeaking() and cancel flag."""
        if self._cancel_flag.is_set():
            self._synth.stopSpeaking()
            self.stats.utterances_cancelled += 1
            timer.invalidate()
            with self._lock:
                cb = self._on_cancelled
                self._on_cancelled = None
                self._on_done = None
            if cb:
                cb()
            return

        if not self._synth.isSpeaking():
            timer.invalidate()
            with self._lock:
                cb = self._on_done
                self._on_done = None
            if cb:
                cb()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def speak(
        self,
        text: str,
        on_start: Optional[Callable[[], None]] = None,
        on_done: Optional[Callable[[], None]] = None,
        on_cancelled: Optional[Callable[[], None]] = None,
    ) -> None:
        if not text.strip():
            return
        self.cancel()
        with self._lock:
            self._pending_text = text
            self._on_start = on_start
            self._on_done = on_done
            self._on_cancelled = on_cancelled
        self._ttfa_start = time.monotonic()

    def cancel(self) -> None:
        self._cancel_flag.set()
        # Stop audio immediately — not just the poll timer.
        # The timer callback also calls stopSpeaking(), but if it hasn't
        # fired yet we must stop the synth directly for instant barge-in.
        if self._synth is not None:
            self._synth.stopSpeaking()
        timer = self._poll_timer
        if timer is not None:
            timer.invalidate()
            self._poll_timer = None
        with self._lock:
            self._pending_text = ""
            self._on_start = None
            self._on_done = None
            self._on_cancelled = None

    # ------------------------------------------------------------------
    # State queries
    # ------------------------------------------------------------------
    @property
    def is_speaking(self) -> bool:
        if self._synth is None:
            return False
        return bool(self._synth.isSpeaking())

    @property
    def voice_name(self) -> str:
        return self.config.voice_id.rsplit(".", 1)[-1]

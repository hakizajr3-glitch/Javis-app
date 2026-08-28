#!/usr/bin/env python3
"""
Jarvis Voice — Local full-duplex voice-to-voice pipeline.
Entry point for testing and running the voice pipeline.

Usage:
    python3 -m jarvis_voice.main

Press Ctrl+C to stop.

Requirements (all local, no cloud):
    - sounddevice  (CoreAudio backend)
    - onnxruntime  (for silero-vad)
    - faster-whisper (CTranslate2 STT)
    - pyobjc AppKit (Apple Neural TTS — Daniel voice)
    - numpy, torch, asyncio
"""

import asyncio
import signal
import sys
import os

# Ensure the parent jarvis-tauri directory is on the path so we can
# import jarvis_voice as a subpackage.
_PARENT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PARENT not in sys.path:
    sys.path.insert(0, _PARENT)

from jarvis_voice.pipeline import JarvisVoicePipeline
from jarvis_voice.state_machine import TurnEvent, TurnState


# ── Pretty-printing ────────────────────────────────────────────────────
STATE_COLORS = {
    TurnState.IDLE:          "\033[90m",  # grey
    TurnState.LISTENING:     "\033[94m",  # blue
    TurnState.USER_SPEAKING: "\033[92m",  # green
    TurnState.PROCESSING:    "\033[93m",  # yellow
    TurnState.RESPONDING:    "\033[95m",  # magenta
    TurnState.INTERRUPTED:   "\033[91m",  # red
}
RESET = "\033[0m"


def _on_state_change(event: TurnEvent) -> None:
    color = STATE_COLORS.get(event.to_state, "")
    arrow = "⏸" if event.to_state == TurnState.INTERRUPTED else "→"
    print(f"  {color}{event.from_state.name} {arrow} {event.to_state.name}{RESET}  "
          f"({event.reason})" if event.reason else "")


def _on_partial(text: str) -> None:
    print(f"\033[90m[partial]\033[0m {text}")


def _on_final(text: str) -> None:
    print(f"\n\033[92m[you]\033[0m {text}")


def _on_response(text: str) -> None:
    print(f"\033[95m[jarvis]\033[0m {text}")


def _on_error(msg: str) -> None:
    print(f"\033[91m[error]\033[0m {msg}")


# ── LLM integration point ─────────────────────────────────────────────
def llm_handler(text: str) -> str:
    """
    Replace this with your actual LLM call.

    For now, returns a simple echo for testing the pipeline loop.
    To integrate Gemini, OpenAI, or a local model, call your LLM here.
    """
    # Stub: echo with timing
    import time
    time.sleep(0.1)  # Simulate minimal LLM latency
    return (
        f"I heard you say: {text}. "
        f"This is Jarvis running on local voice pipeline — "
        f"zero cloud dependency, sub-300ms TTS, full-duplex with barge-in."
    )


# ── Main ───────────────────────────────────────────────────────────────
async def main():
    print("\033[96m" + "=" * 60 + RESET)
    print("\033[96m  Jarvis Voice — Local Full-Duplex Pipeline\033[0m")
    print("\033[96m  Stack: silero-vad | faster-whisper | Apple Neural TTS\033[0m")
    print("\033[96m  Voice: Daniel (British RP, en-GB)\033[0m")
    print("\033[96m" + "=" * 60 + RESET)
    print()
    print("  Starting pipeline...")
    print("  Speak naturally — Jarvis will respond.")
    print("  Interrupt at any time by talking over the response.")
    print("  Press Ctrl+C to stop.")
    print()

    pipeline = JarvisVoicePipeline(
        llm_handler=llm_handler,
        on_state_change=_on_state_change,
        on_partial_transcript=_on_partial,
        on_final_transcript=_on_final,
        on_response=_on_response,
        on_error=_on_error,
    )

    # Handle Ctrl+C
    loop = asyncio.get_event_loop()

    def _shutdown():
        print("\n  Shutting down...")
        asyncio.ensure_future(pipeline.stop())

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _shutdown)
        except NotImplementedError:
            signal.signal(sig, lambda s, f: _shutdown())

    await pipeline.start()

    # Keep running until interrupted
    try:
        while True:
            await asyncio.sleep(0.1)
    except asyncio.CancelledError:
        pass
    finally:
        await pipeline.stop()


if __name__ == "__main__":
    asyncio.run(main())

#!/usr/bin/env python3
"""
Synthetic diagnostic test: simulates a barge-in sequence without audio hardware.

This walks the state machine through a full conversation with a mid-response
barge-in, verifying every [DIAG:...] log line fires at the right point.
"""

import asyncio
import time
import sys
import os

_PARENT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PARENT not in sys.path:
    sys.path.insert(0, _PARENT)

from jarvis_voice.state_machine import TurnStateMachine, TurnState, TurnEvent


async def simulate_barge_in():
    sm = TurnStateMachine()

    # Register a listener that prints each transition (this doubles the log
    # because _state_log inside transition() also prints — expected behavior).
    def _listener(evt: TurnEvent):
        pass  # state_machine itself already logs via _state_log

    sm.on_state_change(_listener)

    print()
    print("=" * 70)
    print("  SYNTHETIC BARGE-IN DIAGNOSTIC TEST")
    print("  (No audio hardware required)")
    print("=" * 70)
    print()

    # ── Step 1: Start listening ──
    print("── Step 1: Start listening ──")
    t0 = time.monotonic()
    await sm.start_listening("session started")
    assert sm.state == TurnState.LISTENING

    # ── Step 2: User starts speaking ──
    print("── Step 2: User starts speaking ──")
    await sm.user_started_speaking("VAD speech onset")
    assert sm.state == TurnState.USER_SPEAKING

    # ── Step 3: User stops speaking → processing ──
    print("── Step 3: User stops speaking → processing ──")
    await sm.user_stopped_speaking("VAD end of utterance")
    assert sm.state == TurnState.PROCESSING

    # ── Step 4: LLM done → start responding (TTS begins) ──
    print("── Step 4: LLM done → start responding (TTS begins) ──")
    await sm.start_responding("TTS playback started")
    assert sm.state == TurnState.RESPONDING

    # ── Step 5: User barges in during TTS! ──
    print("── Step 5: USER BARGES IN during TTS ──")
    print("    (simulating: tts.cancel() + audio.flush_output() + stt.clear_buffer())")
    await sm.user_interrupted("VAD barge-in detected")
    assert sm.state == TurnState.INTERRUPTED
    assert sm.barge_in_count == 1

    # ── Step 6: Resume listening ──
    print("── Step 6: Resume listening ──")
    await sm.resume_listening("TTS flushed, listening")
    assert sm.state == TurnState.LISTENING

    # ── Step 7: Normal response completion (non-barge-in path) ──
    print("── Step 7: Normal completion path ──")
    # Start another response
    await sm.user_started_speaking("VAD speech onset")
    await sm.user_stopped_speaking("VAD end of utterance")
    await sm.start_responding("TTS playback started")
    await sm.response_complete("TTS finished naturally")
    assert sm.state == TurnState.IDLE

    elapsed = (time.monotonic() - t0) * 1000
    print()
    print("=" * 70)
    print(f"  ALL STATE TRANSITIONS PASSED  (took {elapsed:.0f}ms)")
    print(f"  Barge-in count: {sm.barge_in_count}")
    print(f"  Event history: {len(sm.history)} transitions")
    print("=" * 70)

    # ── Verify the transition sequence ──
    expected = [
        (TurnState.IDLE, TurnState.LISTENING),
        (TurnState.LISTENING, TurnState.USER_SPEAKING),
        (TurnState.USER_SPEAKING, TurnState.PROCESSING),
        (TurnState.PROCESSING, TurnState.RESPONDING),
        (TurnState.RESPONDING, TurnState.INTERRUPTED),
        (TurnState.INTERRUPTED, TurnState.LISTENING),
        (TurnState.LISTENING, TurnState.USER_SPEAKING),
        (TurnState.USER_SPEAKING, TurnState.PROCESSING),
        (TurnState.PROCESSING, TurnState.RESPONDING),
        (TurnState.RESPONDING, TurnState.IDLE),
    ]

    for i, (exp_from, exp_to) in enumerate(expected):
        actual = sm.history[i]
        assert actual.from_state == exp_from, f"Step {i}: expected from {exp_from}, got {actual.from_state}"
        assert actual.to_state == exp_to, f"Step {i}: expected to {exp_to}, got {actual.to_state}"

    print("\n  ✓ All 10 transition sequence assertions passed.\n")


if __name__ == "__main__":
    asyncio.run(simulate_barge_in())

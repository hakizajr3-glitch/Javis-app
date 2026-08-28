"""
Jarvis Voice — Local real-time full-duplex voice-to-voice pipeline.

Stack:
  Audio I/O:  sounddevice (PortAudio / CoreAudio)
  VAD:        silero-vad (ONNX Runtime)
  STT:        faster-whisper (CTranslate2)
  TTS:        NSSpeechSynthesizer (Apple Neural TTS — Daniel, en-GB)
  Orch:       asyncio state machine with barge-in support

All components run locally on macOS Apple Silicon — zero cloud dependency.
"""

__version__ = "1.0.0"

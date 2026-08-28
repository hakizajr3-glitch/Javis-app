# DECISIONS.md — JARVIS OS Architectural Decision Log

> Per the JARVIS OS Feature Specification Framework:
> every active feature is documented with Purpose · Capabilities ·
> User/System Benefits · Integration Points · Latency · Generation
> Process · Failure Handling · Documentation; every architectural
> decision is logged with DECISION / ALTERNATIVES / REASON.

---

# ACTIVE INITIATIVES

## Feature 1 — JARVIS AI Conversation Engine

### 1. Features & Benefits Specification

**Feature Name:** JARVIS AI Conversation Engine (text + voice unified)

**Purpose:**
- One shared AI runtime for every JARVIS interaction (text chat, voice
  transcripts, model diagnostics). Avoids the historical pattern of
  four parallel voice/text controllers racing each other and emitting
  inconsistent identity refusals.

**Core Capabilities:**
- Unified `ConversationManager` singleton handles both text chat
  (`RightPanel.handleSend`) and voice transcripts
  (`sendVoiceTranscript`) through the same `sendMessage()` path.
- `AIService` is the single Gemini caller, the only layer that knows
  about model fallback, quota recovery, and identity (JARVIS) framing.
- Streaming responses via `onStreamToken` callback.
- Cancels mid-flight requests via `AbortController`.
- Auto-recovers from transient quota errors by walking the fallback
  model chain before surfacing a user-facing error.

**User Benefits:**
- Text and voice give the exact same JARVIS identity and tone.
- Quota errors on the primary model are transparent — the user keeps
  talking, never sees a "quota exceeded" wall.
- No "I'm Gemini" leakage: every response is bound to the JARVIS
  identity regardless of which model generated it.

**System Benefits:**
- One retry policy, one set of fallbacks, one system instruction.
- Stateless UI components: message rendering, voice session, and
  diagnostics panels are pure consumers of `ConversationManager`
  callbacks.
- Future agents (VisionReasoningEngine, Memory) plug in behind
  `AIService` without touching UI code.

**Integration Points:**
- `AIService` ← `aiProviderConfig` (single source for models,
  identity, fallbacks, retry policy)
- `ConversationManager` ← `AIService` (only consumer of AI calls)
- `RightPanel.tsx` / `.jsx` ← `ConversationManager` (text UI)
- `CenterHubExact.tsx` / `.jsx` ← `ConversationManager` (voice UI,
  diagnostics, lifecycle)
- `SystemConfigModal.tsx` / `.jsx` ← `AIProviderConfig` (model pick)

### 2. Latency / Generation / Analysis Process

**Latency targets:**
| Stage | Budget | Notes |
|---|---|---|
| Mic → STT interim | < 800 ms | browser SpeechRecognition |
| STT final → Gemini first byte | < 1.5 s | streaming `onStreamToken` |
| TTS first chunk | < 250 ms | ElevenLabs stream or browser |
| State transitions | < 50 ms | in-memory state machine |

**Generation Pipeline (text):**
```
User keystrokes
   ↓
RightPanel.handleSend
   ↓
ConversationManager.sendMessage (initialize if idle)
   ↓
AIService.sendMessage → try primary model → on failure try fallback
   ↓
sendWithRetry([this.primaryModel, ...fallbacks.filter(!=primary)])
   ↓
fetch POST Gemini with { systemInstruction: JARVIS_SYSTEM_INSTRUCTION,
                          contents }
   ↓
stream tokens → onMessage({role:'assistant',content}) → setMessages
   ↓
TTS (ElevenLabs primary, browser speechSynthesis fallback)
```

**Generation Pipeline (voice):**
```
Mic → MediaStream
   ↓
SpeechRecognition.continuous + interimResults
   ↓
onresult (final) → ConversationManager.sendVoiceTranscript
   ↓
(SAME path as text from here)
   ↓
AIService → Gemini (systemInstruction + contents)
   ↓
ElevenLabs TTS → Audio.play() → barge-in pauseable
```

**Analysis Process:**
- Every Gemini call carries the JARVIS system instruction (mandatory).
- Every model reader checks `sanitizeModel()` — stale saved model
  picks (e.g. `gemini-2.0-flash-lite`) fall back to the current default
  before being sent.
- On Gemini 429: throw `code:'quota_exhausted'` (silent message) →
  `ConversationManager` tries the next fallback model → if all fail,
  auto-recovery in `setState('recovering')` for 2 s, then back to
  `'listening'`. User never sees an error string.

**Failure handling:**
| Failure | Detection | Response |
|---|---|---|
| 400/401/403 | `res.status` | `AIServiceError('invalid_key', '…')` → surfaced |
| 404 | `res.status` | `AIServiceError('model_unavailable', '…')` → next fallback |
| 429 | `res.status` | next model in fallback chain; recoverable, silent |
| 402 | `res.status` | `AIServiceError('billing_required', '…')` → surfaced |
| 5xx | `res.status` | retry with exponential backoff (up to 3) |
| Network | `fetch` throw | `AIServiceError('network_error', '…')` → surfaced |

### 3. Documentation Requirements

- **Architecture**: this file, section "Feature 1".
- **Technical**: `aiService.ts/.js` JSDoc — every method's purpose
  and contract.
- **Developer**: any new AI caller must (a) go through
  `conversationManager.sendMessage` or `aiService.sendMessage` and
  (b) include `JARVIS_SYSTEM_INSTRUCTION` in its request body.
- **User**: Settings → Configuration (in-app onboarding covers
  Gemini key + model selection).
- **Decision**: see DECISION-003 below.

---

## Feature 2 — Gemini Provider Configuration

### 1. Features & Benefits Specification

**Feature Name:** AI Provider Config (single source of truth)

**Purpose:** Centralize every AI setting — model names, fallback
chain, identity instruction, retry policy, reasoning mode — so the
next "Gemini is broken again" moment is one-file-edit, not a
cross-repo hunt.

**Core Capabilities:**
- `AIProviderConfig` const: provider, fastModel, deepModel,
  fallbackModels, retry settings, streaming, reasoningMode.
- `JARVIS_SYSTEM_INSTRUCTION` const: the identity prompt sent with
  every Gemini call (see DECISION-001).
- Helpers: `getActiveModel()`, `getAvailableModels()`,
  `sanitizeModel(saved, fallback?)`, `getReasoningMode()`.

**User Benefits:**
- Model picker dropdown in Settings reflects only LIVE-VERIFIED models.
- Switching models takes effect on next message — no app restart.

**System Benefits:**
- No more hardcoded model strings scattered through the codebase.
- One change to add or retire a model (or to fix the identity
  instruction wording) is one file.

**Integration Points:** sole source for `aiService.ts/.js`,
`aiManager.ts`, `geminiClient.ts/.js`, `SystemConfigModal.tsx/.jsx`,
`configManager.ts`.

### 2. Latency / Generation / Analysis Process

**Latency targets:** N/A — runtime configuration, not a request path.

**Generation Pipeline:** `localStorage.jarvis_config` →
`sanitizeModel()` → `AIService.primaryModel` → next fetch request
URL embedded with the verified model name.

**Analysis Process:** `sanitizeModel() == saved when saved is in
getAvailableModels()`, else fallback (deep-aware: honors
`reasoning_mode='deep'`).

**Failure handling:** if every fallback is exhausted, original
error is surfaced with model-mismatch recovered message.

### 3. Documentation Requirements

- **Architecture**: this file, section "Feature 2".
- **Technical**: every helper's signature documented inline.
- **Developer**: any model change → edit `getAvailableModels()` order;
  no other file should mention a model name.
- **Decision**: DECISION-002.

---

## Feature 3 — Voice Pipeline (mic → STT → AI → TTS → speaker)

### 1. Features & Benefits Specification

**Feature Name:** JARVIS Live Voice Mode

**Purpose:** Continuous hands-free conversation with barge-in, TTS
streaming, and zero silent-leak (TTS keeps playing after TERMINATE).

**Core Capabilities:**
- Continuous browser `SpeechRecognition` (TDZ on macOS WKWebView,
  reliable on Electron renderer).
- Streaming ElevenLabs TTS via `window.electronAPI.synthesize` over
  the preload bridge; falls back to `window.speechSynthesis` with
  persona-aware voice selection (`applyPersonaToUtterance`).
- Barge-in: inline `currentAudio.pause()` on user voice activity.
- TERMINATE = `speechSynthesis.cancel()` + `recognition.stop()` +
  abort in-flight fetch + clear messages.

**User Benefits:** Continuous, multi-turn voice conversation; user
can interrupt JARVIS mid-sentence; persona switches (Male/Female) take
effect on next utterance.

**System Benefits:** No silent TTS playback after TERMINATE; no auto-
restart of `SpeechRecognition` after terminate (closure-aware).

**Integration Points:** `CenterHubExact.tsx/.jsx` (INITIALIZE /
TERMINATE button, diagnostics panel) ↔ `ConversationManager`
↔ `AIService` ↔ `RightPanel.tsx/.jsx` (shared message stream).

### 2. Latency / Generation / Analysis Process

**Latency targets:** same as Feature 1.

**Generation Pipeline:** see Feature 1, voice pipeline diagram.

**Failure handling:**
| Failure | Detection | Response |
|---|---|---|
| Mic permission denied | `getUserMedia` throws `NotAllowedError` | show "Permission denied" in diagnostics; do not initialize |
| ElevenLabs fetch fail | non-200 response | fall back to `speechSynthesis`, log warn, continue |
| TTS audio element error | `onerror` | suppress bubble, log warn, continue |
| Recognition auto-end | `recognition.onend` | guarded by `recognitionRef.current !== null` — closes the historic restart-after-terminate leak |

### 3. Documentation Requirements

- **Architecture**: this section.
- **Developer**: any new voice component should hook into
  `ConversationManager` callbacks; do not instantiate
  `SpeechRecognition` outside the CenterHub or RightPanel.

---

## Feature 4 — Camera (independent of AI)

### 1. Features & Benefits Specification

**Feature Name:** Standalone Camera Capture

**Purpose:** Allow the user to enable the webcam from the UI without
requiring an API key, without requiring AI initialization — camera is
a separate, independent capability.

**Core Capabilities:** `navigator.mediaDevices.getUserMedia({video:true})`
on click; `<video srcObject>` live streaming in LeftSidebar.

**User & System Benefits:** Camera works in either Tauri or Electron
window without first configuring AI.

**Integration Points:** `LeftSidebar.tsx/.jsx` CameraWidget only.

### 2. Latency / Generation / Analysis Process

**Latency:** < 100 ms from button click to first video frame.

**Pipeline:** click → permission request → live stream → click again
→ stop tracks → revoke URL.

**Failure handling:**
| Failure | Detection | Response |
|---|---|---|
| Permission denied | `NotAllowedError` | render "Allow camera in System Settings" |
| No API available | lacks `mediaDevices.getUserMedia` | render "Camera not available" |
| Already in use | `NotReadableError` | render "Camera busy" |

### 3. Documentation Requirements

- **Architecture**: this section.
- **Decision**: DECISION-004.

---

## Feature 5 — Configuration Management (System Configuration Modal)

### 1. Features & Benefits Specification

**Feature Name:** System Configuration

**Purpose:** Persist config (API key, model pick, voice persona,
reasoning mode) to `localStorage.jarvis_config`; restore on startup;
sanitize stale saved picks on load.

**Core Capabilities:** save, load, validate, runtime notifications on
change. Reading-side sanitization in `sanitizeModel()` prevents stale
model 429/404s.

**User Benefits:** Survive app restart. Visible status of every
diagnostic.

### 2. / 3. Same pattern as Feature 2.

---

# ARCHITECTURAL DECISIONS

## DECISION-001 — JARVIS identity via directive + explicit-negation system instruction

**Date:** 2026-07-31

**Why chosen:**
Live API test proves Gemini responds to polite system-instruction
framing ("you never identify yourself as a Google product") with the
canonical "I am a large language model, trained by Google" answer.
Polite framing leaks because Gemini's identity refusal is load-bearing
on the training data, not on the instruction. The fix:

1. Replace polite framing with **imperative + explicit negation**:
   *"You must NEVER say 'I am Gemini,' 'I am a large language model
   trained by Google,'…"*
2. Add a **closing directive** (`you must answer ONLY:`) so the model
   doesn't add leakage sentences after the JARVIS answer.
3. Provide a **fallback** ("I do not discuss my underlying providers")
   for hard-pressed identity questions.
4. Verified live with 4 prompts (What is your name? / Who made you? /
   Are you Gemini? / What model are you running?). All four now
   produced a JARVIS-only answer with zero leakage.

**ALTERNATIVES:**
- (a) Polite framing — **proven insufficient**. Model still leaks to
  "I am a large language model from Google".
- (b) Post-process responses with a string filter (regex-replace
  "Gemini" / "Google" / "trained by" → "JARVIS") — works as a band-aid
  but breaks fluency and corrupts legitimate mentions of those words
  in unrelated contexts.
- (c) Replace the model entirely with a different provider — high
  cost, breaks user's existing API key, doesn't ship.
- (d) Stronger directive + explicit negation (chosen).

**REASON:** Cheapest, fastest, fully verified. Behavior change is
contained to the systemInstruction string. No call sites changed.

**RESULT:** JARVIS now responds consistently as JARVIS across both
Tauri and Electron, across all 4 identity-probing prompts tested.

---

## DECISION-002 — Centralized `AIProviderConfig` with `sanitizeModel()` helper

**Date:** 2026-07-31

**Why chosen:** Stale `localStorage.model_fast` was 429/404-ing on
every request because `gemini-2.0-flash-lite` was retired by Google.
Fixing it meant model-string appears in 5+ files (callers, modals,
config readers). Without a single helper, every model change is
multi-file.

**ALTERNATIVES:**
- (a) Per-caller fallback (`[gemini-3.1-flash-lite, gemini-3.5-flash, gemini-3.5-flash-lite]` repeated everywhere) — DRY violation.
- (b) Migrate-once at app startup, then forget — race conditions when
  config changes mid-session.
- (c) Centralized `AIProviderConfig` + `sanitizeModel(saved, fallback?)` (chosen).

**REASON:** Single source of truth; future model migrations are
one-file edits; `sanitizeModel()` has deep-mode-aware fallback so a
stale saved model + `reasoning_mode='deep'` resolves to deepModel,
not silently to fastModel.

**RESULT:** Stale saved picks auto-migrate on the next message.
Verified across `aiService.ts/.js readModel()`, `aiManager.ts
readGeminiModel()`, `configManager.ts load()`, `SystemConfigModal.tsx/.jsx`
restored dropdown.

---

## DECISION-003 — ConversationManager is the single entry point for voice and text

**Date:** 2026-07-31

**Why chosen:** Multiple parallel voice/text controllers (lifecycleController,
fullDuplexController, voiceAgent, voicePipeline, realtimeVoice)
created inconsistent identity, state, and error responses. Refactor
goal: every UI → `ConversationManager.sendMessage` → `AIService.sendMessage`.

**ALTERNATIVES:**
- (a) Two separate pipelines (one for text, one for voice) — caused
  the original inconsistency.
- (b) Single pipeline, but route around AIService for direct Gemini
  calls — re-introduces the duplication problem.
- (c) Single conversation with a `source: 'text' | 'voice'` flag (chosen).

**REASON:** Both modes share history, state, persona, fallback,
identity. The only thing that differs is who triggered the turn.

**RESULT:** Every JARVIS response carries the same JARVIS_SYSTEM_INSTRUCTION
and the same fallback chain. State transitions are deterministic.

---

## DECISION-004 — Camera independent of API key (no auth gate before getUserMedia)

**Date:** 2026-07-31

**Why chosen:** Historical bug: clicking the camera icon did nothing
because the camera render path was nested inside the `aiActive`
gate, which required API key + initialization first.

**ALTERNATIVES:**
- (a) Block camera behind API key setup — wrong; camera has no
  relationship with Gemini.
- (b) Camera handles its own permission independently, outside the
  conversation state machine (chosen).

**REASON:** Camera is a low-level capability; AI is a higher-level
feature. Decoupling them means each can fail independently and clearly.

**RESULT:** Camera opens/unopens freely. macOS permission dialog
appears once user clicks the camera icon; permission can be granted
or denied independently of JARVIS configuration.

---

## DECISION-005 — TTS cancel + recognition restart termination guard

**Date:** 2026-07-31

**Why chosen:** Initial TERMINATE handler did two things wrong:
(1) never called `window.speechSynthesis.cancel()`, so JARVIS kept
talking after terminate; (2) the `recognition.onend` handler depended
on a stale React `aiActive` closure, so after termination nulled
the ref, the onend still restarted the mic.

**ALTERNATIVES:**
- (a) React-state-driven termination (chosen but broken) — closure
  bug above.
- (b) Ref-driven termination: `recognitionRef.current` checked in
  onend (chosen fix).

**REASON:** Stale closures are a known React pitfall; checking the
ref guards against `null` (terminate) vs. the original instance
(restart on natural end).

**RESULT:** TERMINATE actually stops everything (mic off, STT off,
TTS off, fetch aborted, messages cleared). Restart after terminate
no longer leaks back into listening.

---

## DECISION-006 — Quota errors are recoverable, not terminal

**Date:** 2026-07-31

**Why chosen:** Free-tier Gemini quotas reset within minutes; a 429
should not block the user. Original error surface ("quota exceeded,
upgrade your plan") was raw upstream copy that hurt UX.

**ALTERNATIVES:**
- (a) Surface raw 429 → user sees scary error + upsell (rejected).
- (b) Silent quota error + auto-walk fallback model chain (chosen).
- (c) Block until quota resets (rejected — wastes user time).

**REASON:** Quota exhaustion is recoverable in seconds-to-minutes
(and across fallbacks), but a permanent-looking error damages trust.
The user's application isn't broken — their model is rate-limited.

**RESULT:** `quota_exhausted` code path tries the next fallback,
then `setState('recovering')` for 2 s before returning to
`'listening'`. Upstream upsell copy is never surfaced.

---

# FAILED / REVERTED DECISIONS

## DECISION-X1 — Polite framing systemInstruction (REVERTED)

**Date:** 2026-07-31

**What:** Initial systemInstruction read "you never identify yourself
as a Google product" — polite phrasing.

**Why failed:** Live API test showed it leaked. Gemini's training-
time identity refuses soft constraints.

**Resolution:** Replaced with DECISION-001 (directive + explicit
negation + closing-only + fallback).

---

## DECISION-X2 — Per-caller duplicate `systemInstruction` strings (REVERTED)

**Date:** 2026-07-31

**What:** Initially pasted the literal string into each of 5
`aiService.ts`, `geminiClient.ts`, `aiManager.ts`, etc.

**Why failed:** DRY violation. Any wording tweak required editing
five files in the right order. Risk of one-app / two-app drift
(claim: "JARVIS works in Tauri" — silent: "still answers as Google
in Electron").

**Resolution:** Extracted `JARVIS_SYSTEM_INSTRUCTION` to
`aiProviderConfig.ts`. All five callers import from there. TS and JS
versions are kept in sync by code review (next iteration: extract to
`packages/jarvis-ui/src/identityInstruction.ts` for true single
source).

---

# OPEN DECISIONS

These are not yet resolved and worth raising before shipping:

- **LiveKit real-time voice.** Today the app uses browser
  SpeechRecognition + ElevenLabs streaming. LiveKit path was scaffolded
  in `liveKitVoice.ts` and `livekitConnector.ts` but never finished.
  Decision needed: ship browser-only for v1, or invest in LiveKit for
  lower-latency barge-in.
- **ElevenLabs API key in source.** `voicePipelineFixed.ts` has a
  hardcoded `sk_…` key as a default. This is a security issue; should
  be moved to env or settings modal.
- **System prompt in `packages/jarvis-ui` shared package.** Currently
  the instruction lives in two `aiProviderConfig` files. Extract to
  `packages/jarvis-ui/src/identityInstruction.ts` to make drift
  impossible. Track as a refactor after v1 ships.
- **Reasoning mode UI coupling.** Settings has a "Deep Reasoning"
  toggle and a model dropdown. Precedence rules are documented in
  `readModel()` but the UX doesn't preview which model is currently
  active. Add a live "Currently using: gemini-X" indicator.
- **ConfigurationManager as backend.** The Python `jarvis-backend/`
  engine has its own conversation logic that's bypassed by direct
  Gemini calls. Decide: commit to direct Gemini for v1 (chosen now)
  OR wire ConversationManager through the WS backend for future
  VisionReasoningEngine integration.

---

# ENGINEERING RULE (recap)

No feature is considered complete until:
- ✓ Feature purpose defined
- ✓ Benefits documented
- ✓ Runtime process mapped
- ✓ Latency expectations defined
- ✓ Failure handling exists
- ✓ Documentation created
- ✓ Integration verified

A feature is not just code. A feature is:
**Capability + User Value + Runtime Process + Documentation.**

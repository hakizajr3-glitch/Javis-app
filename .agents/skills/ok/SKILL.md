---
name: ok
description: Audit the entire JARVIS codebase against the phased build plan — reports what's built, what's partially built, what's stubbed, and what hasn't been started. Use when the user asks "what's done", "audit the project", "status check", "what's left to build", "check everything", or at the start of a new work session to re-orient before picking a task.
allowed-tools: Read, Grep, Glob, Bash(find:*), Bash(git log:*), Bash(git status:*), Bash(wc:*)
---

# Project Audit Skill

Produces a status report of the entire JARVIS codebase against the phased
build plan (Phase 0-8 + cross-cutting Identity/Security/Observability). This
is a **read-only** audit — it never edits, writes, or deletes anything. It
exists to answer one question honestly: what's actually built and working,
versus what looks built but isn't wired up, versus what hasn't started.

## Why this is scalable
This skill does not hardcode the module list. It reads the checklist from
the project's own planning docs first, so it stays accurate as the plan
evolves:

1. Look for a master plan doc in the repo (common locations: `docs/`,
   `planning/`, repo root — filenames containing "master-build-plan",
   "roadmap", or "architecture").
2. If found, extract the phase/module list and their stated dependencies
   directly from that doc — this becomes the checklist.
3. If no plan doc exists in the repo, fall back to the default checklist
   below, but flag in the report that it's using the fallback and recommend
   the user add a plan doc to the repo so future audits stay accurate
   automatically.

## Default checklist (fallback only — prefer a repo doc if present)
```
Phase 0  — Platform Foundation (orchestrator, event bus, permission service)
Phase 1  — Voice Engine (VAD, STT, TTS, barge-in, turn-taking state machine)
Phase 2  — Memory System + MyAIDocs
Phase 3  — Self-Improving Skills
Phase 4  — Proactive Intelligence
Phase 5  — VisionReasoningEngine
Phase 6  — Desktop & Browser Control
Phase 6.5— Integrations Connector Layer
Phase 7  — Cowork / Mission Runtime
Phase 8  — AI Workforce / Organization Builder / Dashboard
Cross-cutting — Identity & Permissions, Security, Observability
```

## Audit procedure

### 1. Map the repo structure
Run a directory scan (`find`, respecting `.gitignore`) to build a picture of
what exists before reading any file contents. Group files by apparent
module/domain based on directory naming, not assumptions.

### 2. For each module in the checklist, gather evidence
Don't just check "does a folder with this name exist" — that's a false
positive generator. For each module, check:
- **Files present** — does code exist under a plausible path for this module?
- **Wired vs. orphaned** — is this code actually imported/called from an
  entry point (main.py, App.tsx, etc.), or does it sit unreferenced?
- **Stub detection** — search for stub markers: `TODO`, `FIXME`, `NotImplementedError`,
  `pass  # stub`, `throw new Error("not implemented")`, functions that only
  log/print and return a placeholder, empty function bodies. A file existing
  is not the same as a feature working.
- **Test coverage** — do tests exist for this module, and do they pass?
  Run existing test commands if a test runner is configured; don't assume
  passing status without running them.
- **Recent activity** — check `git log` for the relevant paths to see if
  work is actively in progress vs. abandoned mid-build.

### 3. Classify each module's status
Use exactly these five states, not a vague summary:
- **Not started** — no code found for this module.
- **Scaffolded** — files/folders exist but contain mostly stubs or empty
  implementations.
- **Partially implemented** — real logic exists but is incomplete, not
  wired to the rest of the system, or missing key sub-components listed in
  the plan doc for this phase.
- **Implemented, untested** — appears functionally complete but has no
  passing tests confirming it, or tests exist but haven't been run recently.
- **Working** — implemented, wired in, and either has passing tests or the
  agent has other concrete evidence it runs correctly (recent successful
  runs in logs, etc.). Don't mark anything "working" on code appearance
  alone — this status requires evidence, not optimism.

### 4. Flag dependency violations
Cross-check against the plan doc's stated dependencies (e.g. "Phase 7
depends on Phase 0 and Phase 2"). If a later-phase module has more real
implementation than an earlier phase it depends on, flag this explicitly —
it usually means either the dependency was worked around in a fragile way,
or the earlier phase is more done than it looks and just needs auditing too.

### 5. Produce the report
Structure as a table, most useful format for someone scanning it quickly:

```
| Module | Status | Evidence | What's missing |
|---|---|---|---|
| Phase 0: Orchestrator | Working | tests pass, wired into main.py | — |
| Phase 1: Voice/Barge-in | Partially implemented | VAD+STT+TTS present, barge-in handler exists but playback doesn't halt on interrupt | Fix buffer-flush on interrupt (see diagnostic logging) |
| Phase 6: Desktop Control | Not started | no matching files found | Everything |
```

Follow the table with:
- A short "what to build next" recommendation based on the dependency graph
  — the earliest-phase module that isn't yet "Working" is usually the right
  next target, not whatever's most exciting.
- A list of anything classified "Scaffolded" that's been sitting that way
  for a long time per `git log` — likely-abandoned work worth explicitly
  deciding to finish or discard, rather than leaving as ambiguous clutter.

## Constraints
- This skill never modifies code. If it notices something broken while
  auditing, it reports the finding — it does not fix it in the same pass.
  Fixing is a separate, explicitly-requested task.
- Don't infer "working" from file existence, comments, or variable/function
  naming alone — actually check for wiring and test evidence per module.
- Keep the report scoped to the checklist — don't editorialize about
  code style or unrelated technical debt unless it directly blocks a
  module's status classification.

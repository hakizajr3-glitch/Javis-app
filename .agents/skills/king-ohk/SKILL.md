---
name: king-ohk
description: Audits a codebase against its own architecture/roadmap/spec document to report exactly what's built and working, what's stubbed or partial, and what hasn't been started yet. Use this whenever the user asks "what's done", "what's built", "what's working", "audit the codebase", "check progress", "status check", "what's left", "how far along are we", or wants a real picture of project completion state before continuing new work. Also use proactively before starting a new feature on an existing or partially-built project, to avoid duplicate work or building on top of something that doesn't actually exist yet. This skill is domain-agnostic — it works on any codebase in any language, driven entirely by whatever plan/spec document the project already has, not by JARVIS-specific or project-specific assumptions.
allowed-tools: Bash(*), Read
---

# Project Audit

Produces an honest, evidence-based status report for a codebase: what's
actually implemented and working, what exists but is incomplete or faked,
and what's specified but not started. This is a **read-only** skill — it
never edits, creates, or deletes anything. Its only output is a report.

## Why this exists

Plans, roadmaps, and specs describe intent. Codebases drift from intent —
some things get built ahead of schedule, some get half-built and abandoned,
some get stubbed out to unblock other work and never finished. Nobody should
have to guess which is which by re-reading every file. This skill does the
grunt work of checking claims against evidence.

## Step 1: Find the source of truth

Look for a plan/spec/roadmap document in the project — common names:
`ROADMAP.md`, `ARCHITECTURE.md`, `SPEC.md`, `PLAN.md`, `README.md`, or
whatever master planning doc the project has (e.g. a master build plan, a
phased roadmap, a module specification set). If the user has already pointed
at one earlier in the conversation, use that. If none is found or it's
ambiguous which doc is authoritative, ask the user rather than guessing —
auditing against the wrong source of truth produces a misleading report.

## Step 2: Extract the claims

From the source of truth, build a checklist of every distinct
feature/module/capability it claims should exist. Keep the granularity
matched to how the spec itself is organized (phases, modules, subsystems,
whatever structure it already uses) — don't invent a different taxonomy than
the one the user is already using to think about the project.

## Step 3: Gather evidence for each claim

For each item on the checklist, search the actual codebase for evidence it
exists. Use whatever combination of these fits the project's language/stack:

- Search for the relevant function/class/module names (`grep`/`rg` across
  the source tree)
- Check for registration/wiring — is the thing actually invoked anywhere, or
  does it exist in isolation with nothing calling it?
- Check for tests covering it, and whether those tests currently pass
- Check for explicit incompleteness markers: `TODO`, `FIXME`, `XXX`,
  `NotImplementedError`, `raise NotImplemented`, `pass  # stub`, hardcoded
  return values where real logic should be, commented-out blocks, mock/fake
  implementations left in place of real ones
- Check config/dependency files to confirm claimed dependencies are actually
  installed, not just mentioned in docs

Don't take a file's existence as proof something works — a file full of
stub functions is not "built." Don't take a passing import as proof either —
code can import cleanly and still do nothing real inside.

## Step 4: Classify each item

Use exactly these four states, no others, so reports stay comparable run to
run:

- ✅ **Built & working** — implemented, wired in, and either has passing
  tests or clear evidence it executes correctly (e.g. you can point to the
  exact code path with no stubs/TODOs in it)
- 🟡 **Partial / stubbed** — exists in some form but is incomplete: missing
  error handling, hardcoded/mocked values standing in for real logic, wired
  in but untested, or only covers part of the claimed scope
- 🔴 **Not started** — claimed in the spec, no corresponding code found
- ❓ **Unclear — needs manual check** — evidence is ambiguous or the code is
  too complex/unfamiliar-stack to confidently classify automatically; flag
  it for the user to verify by hand rather than guessing

## Step 5: Check cross-dependencies

Flag cases where a module marked ✅ or 🟡 depends on something marked 🔴 —
that's usually a sign the "working" module is actually calling into a stub,
a mock, or dead code, and its real status should be downgraded. Surface this
explicitly rather than letting a false ✅ stand.

## Step 6: Produce the report

Structure:

1. **One-line summary** — overall completion picture (e.g. "X of Y planned
   modules fully built, Z partial, W not started")
2. **Status table** — one row per checklist item: name, status icon, brief
   evidence (file paths / line references, not just "looks done"), and any
   cross-dependency flags from Step 5
3. **Notable gaps** — the 🔴 and ❓ items called out separately with enough
   detail that the user can decide what to prioritize next
4. **What NOT to trust yet** — 🟡 items that might look done at a glance but
   have a stub/mock/TODO hiding inside them; this is the section most likely
   to prevent wasted work if skipped

Cite specific file paths and line numbers wherever possible — "the export
function is a stub" is far less useful than "`export.py:142` returns a
hardcoded success response without calling the actual export logic."

## Step 7 (optional but recommended): Track drift over time

If the user runs this skill repeatedly on the same project, append each
report's one-line summary and timestamp to a running audit log in the
project (e.g. `AUDIT_HISTORY.md`) rather than only ever showing the latest
snapshot — this makes regressions (something that was ✅ and is now 🟡 or 🔴)
visible across runs, not just point-in-time status.

## Hard constraints

- **Never modify code, tests, or config during an audit.** This skill reads
  and reports only. If the user wants fixes made based on the findings,
  that's a separate, explicit follow-up task — don't blend the two.
- **Don't guess when evidence is ambiguous.** Use the ❓ state rather than
  rounding an unclear case up to ✅ or down to 🔴 — false confidence in either
  direction defeats the purpose of an audit.
- **Match the project's own structure and terminology.** This skill should
  work identically well on a JARVIS-style phased plan, a simple README
  feature list, or an entirely different project with its own spec format —
  don't hardcode assumptions from any one project into how the audit runs.
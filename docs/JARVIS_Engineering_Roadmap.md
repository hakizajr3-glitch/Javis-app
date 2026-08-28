# JARVIS Engineering Roadmap

## How to Read This Document

Phases are ordered by dependency, not importance. Phases 0-3 must be completed in order. Phases 4+ can parallelize across team members once their dependencies are met.

Each phase includes:
- What it is
- Why it's positioned there
- What team specialization it maps to
- Dependencies
- Acceptance criteria

## Cross-Cutting Foundation (Build Once, Used Everywhere)

### Identity & Permissions

**Not a phase** — a shared service every other phase calls into.

**Responsibilities:**
- Users, teams, roles, organizations management
- Access control enforcement
- Tool permissions management
- Approval workflow orchestration

**Rules:**
- Read-only actions: auto-approve
- Non-read-only actions: explicit user approval before execution
- Every subsystem calls into this one system — no custom permission logic

**Team mapping:** Backend/infra engineer
**Build timing:** Phase 0 — before Phase 5 (Desktop/Browser Control) and Phase 7 (Cowork)

### Security

**Responsibilities:**
- Approval gates (built on Identity & Permissions)
- Audit logging
- Encryption
- Secrets management
- Sandboxing

**Team mapping:** Backend/infra engineer
**Build timing:** Phase 0 — before Phase 6 (Desktop/Browser Control)

### Observability

**Responsibilities:**
- Event bus (TASK_STARTED, TASK_COMPLETED, TASK_FAILED, APPROVAL_REQUIRED, etc.)
- Logs, metrics, traces
- Mission replay
- Error diagnostics

**Team mapping:** Backend/infra engineer
**Build timing:** Phase 0 — needed by Phase 6 and Phase 7

---

## Phase 0: Platform Foundation

**What it is:**
The base infrastructure that everything else sits on.

**Why it's positioned here:**
No other phase can reliably build without a stable foundation. Multi-LLM routing, permissions, security, and observability are cross-cutting concerns.

**Team mapping:** Backend/infra engineer
**Dependency:** None — this is the base

### Components

#### Multi-LLM Orchestrator
- Verify existing implementation is stable and extensible
- Support for OpenAI, Anthropic, Google, local models
- Dynamic model selection based on task type
- Cost estimation and budget tracking
- Fallback and retry logic

#### Identity & Permissions Service
- User management (create, read, update, delete)
- Organization management
- Role-based access control (RBAC)
- Permission checking API
- Approval workflow engine
- Tool permission management

#### Security Layer
- Approval gate enforcement
- Audit log implementation
- Encryption at rest and in transit
- Secrets management (integration with vault or environment variables)
- Sandboxing framework for execution

#### Observability Layer
- Event bus implementation (Redis Pub/Sub or dedicated message broker)
- Logging infrastructure (structured logging)
- Metrics collection (Prometheus-compatible)
- Distributed tracing (OpenTelemetry)
- Mission replay capability

### Acceptance Criteria

- [ ] Multi-LLM orchestrator can route requests to at least 3 providers (OpenAI, Anthropic, Google)
- [ ] Permission service can check and grant/deny permissions for users
- [ ] Approval workflow can request, grant, and deny approvals
- [ ] Event bus can publish and subscribe to events with at-least-once delivery
- [ ] Audit logs capture all write operations with user, timestamp, and resource
- [ ] Secrets are never hardcoded or exposed in logs
- [ ] Mission replay can reconstruct a mission from event history
- [ ] All services have health check endpoints
- [ ] All services have API documentation (OpenAPI/Swagger)

### Estimated Effort
2-3 weeks

---

## Phase 1: Voice Engine

**What it is:**
Real-time voice interaction with VAD, streaming STT, streaming TTS with mid-utterance cancellation, turn-taking state machine with barge-in, and Tauri sidecar integration.

**Why it's positioned here:**
Voice is a primary interface for JARVIS. It depends on Phase 0's orchestrator for real LLM responses instead of stubs.

**Team mapping:** Audio/ML engineer + frontend engineer (Tauri side)
**Dependency:** Phase 0 (orchestrator)

### Components

#### Voice Activity Detection (VAD)
- Silero-vad integration
- Echo cancellation
- Noise suppression

#### Streaming Speech-to-Text (STT)
- WhisperKit integration
- Real-time transcription
- Language detection

#### Streaming Text-to-Speech (TTS)
- Kokoro integration
- Mid-utterance cancellation
- Voice selection and customization

#### Turn-Taking State Machine
- Barge-in detection and handling
- Conversation flow management
- Interruption logic

#### Tauri Sidecar Integration
- WebSocket bridge to React frontend
- Audio pipeline management
- State synchronization

### Acceptance Criteria

- [ ] VAD accurately detects speech start/end with <200ms latency
- [ ] STT streams real-time transcription with <300ms latency
- [ ] TTS streams audio with mid-utterance cancellation working
- [ ] Turn-taking state machine handles barge-in correctly
- [ ] Tauri sidecar WebSocket bridge is stable
- [ ] Voice pipeline works with real LLM (Gemini) instead of stub
- [ ] Audio quality is clear with minimal echo/noise
- [ ] Voice interaction feels natural and responsive

### Estimated Effort
3-4 weeks

**Status:** In progress — barge-in bug being diagnosed, Tauri sidecar wiring in progress

---

## Phase 2: Memory System + MyAIDocs (Knowledge System)

**What it is:**
Three-tier memory system (Working, Organization, Personal) plus MyAIDocs artifact storage with metadata, relationships, version history, and search.

**Why it's positioned here:**
Memory is a dependency for almost everything after this — proactive intelligence, self-improving skills, and Cowork all read/write here.

**Team mapping:** Backend engineer
**Dependency:** Phase 0

### Components

#### Memory Engine
- **Working Memory:** Current mission/conversation context
- **Organization Memory:** Shared company/project knowledge, decisions, SOPs, lessons learned
- **Personal Memory:** User preferences, individual history
- Semantic search across all tiers
- Memory consolidation and archival

#### MyAIDocs (Artifact Engine)
- Artifact storage with full metadata
- Relationship graph between artifacts
- Version history tracking
- Search and retrieval
- Visual artifact rendering

#### Knowledge System
- Document indexing (PDF, Word, Markdown, code, images)
- Code search and understanding
- Research storage and retrieval
- Email and meeting transcript storage
- Decision and SOP tracking

### Acceptance Criteria

- [ ] Working memory can be set/get/cleared for a mission
- [ ] Organization memory can be shared across organization members
- [ ] Personal memory is isolated per user
- [ ] Semantic search returns relevant results across memory tiers
- [ ] MyAIDocs can store artifacts with metadata (creator, mission, timestamp)
- [ ] Artifact relationships can be queried and traversed
- [ ] Version history tracks all changes to artifacts
- [ ] Search index covers documents, code, images, research
- [ ] Memory consolidation archives old data without loss
- [ ] All memory operations are transactional

### Estimated Effort
3-4 weeks

---

## Phase 3: Self-Improving Skills

**What it is:**
System that logs tasks, detects repeated patterns, drafts generalized skills, proposes them to user with examples, and installs approved skills.

**Why it's positioned here:**
Depends on Phase 2 (memory) to log task history and store approved skills long-term.

**Team mapping:** Backend/agent engineer
**Dependency:** Phase 2

### Components

#### Task Logging
- Automatic logging of all completed tasks
- Task context and parameters
- Success/failure tracking
- Performance metrics

#### Pattern Detection
- Analyze task history for repeated patterns
- Identify candidate skills
- Generate skill proposals with examples

#### Skill Proposal System
- Present skills to user for approval
- Show examples of when skill would apply
- Allow user to edit or reject proposals
- Track proposal acceptance rate

#### Skill Execution
- Load skills into agent context
- Execute skills with appropriate parameters
- Track skill performance
- Self-improve skills during use

### Acceptance Criteria

- [ ] All completed tasks are logged with full context
- [ ] Pattern detection identifies at least 3 valid skill candidates from test data
- [ ] Skill proposals include clear examples and expected benefits
- [ ] User can approve, edit, or reject skill proposals
- [ ] Approved skills are installed and available for use
- [ ] Skills execute correctly with appropriate parameters
- [ ] Skill performance is tracked and used for routing
- [ ] No skill goes live without explicit user approval
- [ ] Skills can self-improve based on usage feedback

### Estimated Effort
2-3 weeks

---

## Phase 4: Proactive Intelligence (Communication System)

**What it is:**
Event-driven speech where JARVIS initiates conversation only when genuinely useful (build finished, meeting soon, email reply, export complete).

**Why it's positioned here:**
Depends on Phase 1 (turn-taking state machine) and Phase 2 (memory to know what's changed). Must respect barge-in logic from Phase 1.

**Team mapping:** Audio/ML engineer + backend engineer
**Dependency:** Phase 1, Phase 2

### Components

#### Event Triggers
- Build completion detection
- Meeting reminder integration
- Email arrival detection
- Export completion
- System status changes

#### Usefulness Detection
- Determine if an event is worth announcing
- Avoid spamming user with trivial notifications
- Learn user preferences over time

#### Structured Communication
- Event-based communication (not free-form chatter)
- Task Assigned → Research Finished → Approval Needed → Review Failed → Mission Complete
- Integration with Communication System

#### Turn-Taking Integration
- Proactive announcements respect barge-in logic
- User can interrupt proactive announcements
- State machine handles interruption gracefully

### Acceptance Criteria

- [ ] JARVIS can detect and announce build completions
- [ ] JARVIS can detect and announce upcoming meetings
- [ ] JARVIS can detect and announce important emails
- [ ] Usefulness detection filters out trivial events
- [ ] Proactive announcements respect barge-in logic
- [ ] User can interrupt proactive announcements
- [ ] Communication follows structured event model
- [ ] User preferences for notification frequency are learned

### Estimated Effort
2-3 weeks

---

## Phase 5: VisionReasoningEngine

**What it is:**
Live camera/video input understanding for screens, documents, whiteboards, physical objects, handwriting with real-time feedback loop.

**Why it's positioned here:**
Depends on Phase 0 (orchestrator). Ideally Phase 1 so vision and voice can be used together.

**Team mapping:** Computer vision specialist (dedicated hire/contractor)
**Dependency:** Phase 0, ideally Phase 1

### Components

#### Screen Capture
- Real-time screen capture
- Window-specific capture
- Multi-monitor support

#### Image Understanding
- Screen content analysis
- Document OCR
- Whiteboard interpretation
- Physical object detection
- Handwriting recognition

#### Real-Time Feedback Loop
- "Show me what you're doing, I'll tell you if you're doing it right"
- Continuous monitoring
- Instant feedback delivery

#### Vision Integration
- Integration with LLM for reasoning
- Integration with voice for verbal feedback
- Integration with MyAIDocs for storing visual artifacts

### Acceptance Criteria

- [ ] Screen capture works in real-time with <500ms latency
- [ ] OCR accurately extracts text from documents
- [ ] Whiteboard content is interpreted correctly
- [ ] Physical objects are detected and identified
- [ ] Handwriting is recognized with reasonable accuracy
- [ ] Real-time feedback loop provides instant guidance
- [ ] Vision integrates with LLM for reasoning
- [ ] Vision integrates with voice for verbal feedback
- [ ] Visual artifacts are stored in MyAIDocs

### Estimated Effort
4-6 weeks (most specialized phase)

---

## Phase 6: Desktop & Browser Control (Execution System)

**What it is:**
Application launch/close, navigation, click/type/drag, file management, terminal execution, multi-step workflows, built-in browser.

**Why it's positioned here:**
Highest blast-radius phase — depends on Phase 0's permission model being mandatory.

**Team mapping:** Automation engineer, security/sandboxing background ideal
**Dependency:** Phase 0's permission model is mandatory

### Components

#### Desktop Control
- Application launch and close
- Window management (focus, move, resize)
- Navigation (click, type, drag)
- File management (create, read, update, delete)

#### Browser Automation
- Built-in browser (Playwright)
- Web navigation
- Form filling
- Data extraction
- Multi-step workflows

#### Terminal Execution
- Command execution
- Output capture
- Error handling
- Interactive sessions

#### Permission Integration
- Every action routes through Permission & Approval service
- No bypassing approval logic
- Audit logging for all actions

#### Sandboxing
- Isolate desktop control from system
- Limit file system access
- Restrict network access

### Acceptance Criteria

- [ ] Applications can be launched and closed reliably
- [ ] Window management works across different OS
- [ ] Click/type/drag operations are accurate
- [ ] File operations work with proper permissions
- [ ] Browser automation can navigate and interact with web pages
- [ ] Terminal execution captures output correctly
- [ ] Every action requires approval from Permission service
- [ ] Audit logs capture all desktop/browser actions
- [ ] Sandboxing limits system exposure
- [ ] Multi-step workflows execute reliably

### Estimated Effort
4-5 weeks

---

## Phase 6.5: Integrations Connector Layer — NEW

**What it is:**
Unified connector layer so external systems plug into JARVIS the same way, rather than each integration being bespoke.

**Why it's positioned here:**
Depends on Phase 0 (Identity & Permissions for OAuth/token handling). Build a small number of high-value connectors first to prove the adapter pattern.

**Team mapping:** Backend/integrations engineer
**Dependency:** Phase 0

### Components

#### Connector Interface
- Unified connector API
- Authentication flow (OAuth typically)
- Adapter pattern for translating external APIs to JARVIS's internal interface
- Error handling and retry logic

#### Priority 1 Connectors
- GitHub (code, issues, PRs)
- Gmail (email)
- Google Calendar (scheduling)

#### Connector Registry
- Central registry of available connectors
- Connector metadata (capabilities, auth requirements)
- Dynamic connector loading

### Acceptance Criteria

- [ ] Connector interface is defined and documented
- [ ] GitHub connector can authenticate and perform basic operations
- [ ] Gmail connector can authenticate and perform basic operations
- [ ] Google Calendar connector can authenticate and perform basic operations
- [ ] OAuth flows work correctly
- [ ] Adapter pattern translates external APIs to internal interface
- [ ] Connector registry lists available connectors
- [ ] Connectors can be loaded dynamically
- [ ] Error handling and retry logic is robust

### Estimated Effort
3-4 weeks (for Priority 1 connectors)

---

## Phase 7: Cowork Runtime / Mission Runtime (Execution Engine)

**What it is:**
Mission Compiler (goal → task graph), Mission Workspace (run-scoped shared memory), Task Graph Scheduler (dependency-aware execution), four standardized agent roles (Discovery, Execution, Validation, Documentation), Mission Supervisor (monitoring, retries, approval enforcement).

**Why it's positioned here:**
Depends on Phase 0 (orchestrator + event bus), Phase 2 (memory), Phase 6.5 (external tools), Phase 6 (desktop/browser actions).

**Team mapping:** Agent/orchestration engineer(s) — largest team allocation
**Dependency:** Phase 0, Phase 2, Phase 6.5, Phase 6

### Components

#### Mission Compiler
- Natural language goal understanding
- Task graph generation (dependencies, required approvals, required tools)
- Risk detection
- Cost estimation
- Timeline prediction

#### Mission Workspace
- Run-scoped shared memory for one goal's execution
- Mission context storage
- Task graph storage
- Working notes
- Research data
- Intermediate artifacts
- Decisions
- Pending approvals
- Deliverables
- Audit log

#### Task Graph Scheduler
- Dependency-aware execution
- Parallel execution where possible
- Task assignment to agents
- Deadlock detection
- Resource management

#### Agent Roles
- **Discovery:** Research, information gathering, exploration
- **Execution:** Implementation, coding, file operations
- **Validation:** Testing, review, quality checks
- **Documentation:** Documentation, reporting, knowledge capture

#### Mission Supervisor
- Monitor execution progress
- Retry transient failures
- Enforce approval checkpoints
- Handle errors gracefully
- Does no work itself (supervision only)

#### Review & Quality
- Code review automation
- Design review
- Fact checking
- Security review
- Grammar and style checking
- Accessibility checking
- Testing automation
- Performance analysis

#### Event Integration
- Everything communicates via Phase 0 event bus
- TASK_STARTED, TASK_COMPLETED, TASK_FAILED
- APPROVAL_REQUIRED, APPROVAL_GRANTED, APPROVAL_DENIED
- MISSION_CREATED, MISSION_COMPLETED, MISSION_FAILED

#### Memory Integration
- Final mission report written into Phase 2 memory
- Working memory cleared on mission completion
- Organization memory updated with learnings

### Acceptance Criteria

- [ ] Mission Compiler can transform natural language goals into task graphs
- [ ] Task graphs include dependencies, approvals, and required tools
- [ ] Risk detection identifies potential issues
- [ ] Cost estimation is reasonably accurate
- [ ] Mission Workspace stores all mission-scoped data
- [ ] Task Graph Scheduler executes tasks with dependency awareness
- [ ] Parallel execution works where dependencies allow
- [ ] Four agent roles are implemented and functional
- [ ] Mission Supervisor monitors and retries failures
- [ ] Approval checkpoints are enforced
- [ ] Review & Quality checks run before task completion
- [ ] All events are emitted to event bus
- [ ] Mission reports are written to memory
- [ ] End-to-end mission execution works reliably

### Estimated Effort
6-8 weeks (most novel engineering)

---

## Phase 8: Cowork v2 — AI Workforce, Organization Builder, Executive Dashboard

**What it is:**
Persistent named AI coworkers with roles, expertise, availability; organizations with teams, projects, policies; live mission control dashboard; organizational memory as reusable templates; cowork intelligence scoring.

**Why it's positioned here:**
Not started until Phase 7 is proven working end to end. This is mostly UI/dashboard work plus a scoring/routing layer on top of the already-working engine.

**Team mapping:** Full team once Phase 7 is stable
**Dependency:** Phase 7 must be working and stable first

### Components

#### AI Workforce
- Persistent named coworkers (role, skills, memory, permissions, availability, workload, performance history)
- Departments (Software, Research, Marketing, Sales, Design, Operations, Finance, Legal, Personal, Trading, Automation, Executive)
- Coworker profiles with expertise and capabilities
- Availability and workload management
- Performance tracking per coworker

#### Organization Builder
- Users can create organizations (personal company, startup, agency, enterprise)
- Each organization has teams, coworkers, projects, policies, shared knowledge
- Team management (add/remove members, assign roles)
- Project management within organizations
- Policy definition and enforcement

#### Executive Dashboard (Mission Control)
- Active missions display
- Running coworkers with live status (working/thinking/waiting/collaborating/needs approval/offline)
- Organization health metrics
- Resource usage tracking
- Pending approvals queue
- Risk dashboard
- Deadlines and timeline
- Notifications center
- Analytics and performance charts

#### Cowork Intelligence Score
- Per-coworker performance metrics (accuracy, speed, completion rate, cost efficiency, reliability)
- Scoring algorithm for routing work
- Performance history tracking
- Learning and improvement tracking

#### Organizational Memory as Templates
- Completed projects become reusable templates
- Architecture extraction
- Lessons learned capture
- Reusable component identification
- Template creation and application
- Feeding back into Phase 2 Knowledge System

### Acceptance Criteria

- [ ] AI coworkers can be created with profiles and roles
- [ ] Coworkers are organized into departments
- [ ] Coworker availability and workload are tracked
- [ ] Users can create organizations with teams
- [ ] Organizations have projects and policies
- [ ] Executive dashboard displays active missions
- [ ] Executive dashboard displays running coworkers with live status
- [ ] Executive dashboard displays resource usage and pending approvals
- [ ] Coworker intelligence scores are calculated and displayed
- [ ] Work is routed based on coworker performance
- [ ] Completed projects can be converted to templates
- [ ] Templates can be applied to new projects
- [ ] Organizational memory is searchable and reusable

### Estimated Effort
4-6 weeks (mostly UI/dashboard work)

---

## Suggested Team Allocation Summary

| Workstream | Role needed | Can start when |
|---|---|---|
| Phase 0 (foundation, permissions, security, observability) | Backend/infra | Immediately |
| Phase 1 (voice) | Audio/ML + frontend | Immediately (in progress) |
| Phase 2 (memory + knowledge + MyAIDocs) | Backend | After Phase 0 |
| Phase 3 (self-improving skills) | Backend/agent | After Phase 2 |
| Phase 4 (proactive intelligence) | Audio/ML + backend | After Phase 1 + 2 |
| Phase 5 (vision engine) | Computer vision specialist | After Phase 0, ideally Phase 1 |
| Phase 6 (desktop/browser control) | Automation + security-minded | After Phase 0's permission model |
| Phase 6.5 (integrations) | Backend/integrations | After Phase 0 |
| Phase 7 (Cowork/Mission runtime) | Agent/orchestration | After Phase 0, 2, 6.5; integrates Phase 6 |
| Phase 8 (AI workforce, org builder, dashboard) | Full team | After Phase 7 proven |

## Sequencing Rule of Thumb

Nothing in Phase 4+ should start with a hard dependency on a Phase 1-3 component that hasn't been demoed working yet.

If two workstreams both touch the Permission & Approval model, that model gets built and frozen (interface locked) before either workstream starts, so they're not building against a moving target.

Phase 8 is explicitly gated on Phase 7 being proven — the "AI company" experience is a UI/scoring layer on a working engine, not a parallel build.

## Total Estimated Timeline

- **Phase 0:** 2-3 weeks
- **Phase 1:** 3-4 weeks (in progress)
- **Phase 2:** 3-4 weeks
- **Phase 3:** 2-3 weeks
- **Phase 4:** 2-3 weeks
- **Phase 5:** 4-6 weeks
- **Phase 6:** 4-5 weeks
- **Phase 6.5:** 3-4 weeks
- **Phase 7:** 6-8 weeks
- **Phase 8:** 4-6 weeks

**Total:** 33-46 weeks (approximately 8-12 months) with parallelization where possible.

## Critical Path

The critical path for a minimal viable JARVIS Cowork system:

1. **Phase 0** (foundation) — 2-3 weeks
2. **Phase 2** (memory) — 3-4 weeks (after Phase 0)
3. **Phase 7** (mission runtime) — 6-8 weeks (after Phase 0, 2)

**Minimal viable timeline:** 11-15 weeks for core mission execution capability.

Full system with all phases: 33-46 weeks.

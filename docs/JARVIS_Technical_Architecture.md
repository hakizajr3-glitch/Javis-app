# JARVIS Technical Architecture

## Layered Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        JARVIS OS                                │
│  Voice • Vision • Chat • Desktop • Mobile • Web                 │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      JARVIS COWORK                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Mission      │  │ AI Workforce │  │ Projects     │          │
│  │ System       │  │              │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Workspace    │  │ Task Engine  │  │ Knowledge    │          │
│  │              │  │              │  │ System       │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Memory       │  │ Communication│  │ Review &     │          │
│  │ System       │  │ System       │  │ Quality      │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Executive    │  │ Organization│  │ Integration  │          │
│  │ Dashboard    │  │ Builder      │  │ Layer        │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      JARVIS CORE                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ VisionReasoningEngine                                    │   │
│  │ - Screen capture & analysis                            │   │
│  │ - Object detection & OCR                                │   │
│  │ - Visual feedback loops                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Mission Runtime                                         │   │
│  │ - Mission Compiler (goal → task graph)                  │   │
│  │ - Task Graph Scheduler (dependency-aware execution)      │   │
│  │ - Mission Supervisor (monitoring, retries, approvals)   │   │
│  │ - Mission Workspace (run-scoped shared memory)           │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Execution Layer                                         │   │
│  │ - Browser automation (Playwright)                      │   │
│  │ - Desktop control (app launch, navigation, input)       │   │
│  │ - Terminal execution                                    │   │
│  │ - API calls                                             │   │
│  │ - File operations                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Event Bus                                               │   │
│  │ - TASK_STARTED, TASK_COMPLETED, TASK_FAILED            │   │
│  │ - APPROVAL_REQUIRED, APPROVAL_GRANTED, APPROVAL_DENIED   │   │
│  │ - MISSION_CREATED, MISSION_COMPLETED, MISSION_FAILED    │   │
│  │ - ARTIFACT_CREATED, ARTIFACT_UPDATED                    │   │
│  │ - COWORKER_ASSIGNED, COWORKER_STATUS_CHANGED            │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Memory Engine                                           │   │
│  │ - Working Memory (current mission)                      │   │
│  │ - Organization Memory (shared knowledge)                 │   │
│  │ - Personal Memory (user preferences)                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Artifact Engine (MyAIDocs)                              │   │
│  │ - Artifact storage with metadata                        │   │
│  │ - Relationship graph                                    │   │
│  │ - Version history                                       │   │
│  │ - Search index                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    Cross-Cutting Services                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Identity &   │  │ Security     │  │ Observability│          │
│  │ Permissions  │  │              │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ LLM Router   │  │ Database     │  │ Storage      │          │
│  │              │  │              │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Auth         │  │ Connectors   │  │ Message Queue│          │
│  │              │  │              │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## Module Boundaries

### Mission Runtime

**Responsibilities:**
- Transform natural language goals into structured task graphs
- Schedule task execution based on dependencies
- Monitor mission progress and handle failures
- Enforce approval checkpoints
- Manage mission-scoped workspace

**Boundaries:**
- Does NOT execute tasks directly (delegates to Execution Layer)
- Does NOT make permission decisions (delegates to Identity & Permissions)
- Does NOT store long-term artifacts (delegates to MyAIDocs)
- DOES emit events for all state changes

**API Surface:**
```typescript
interface MissionRuntime {
  createMission(goal: string, context: MissionContext): Promise<MissionId>
  compileMission(missionId: MissionId): Promise<TaskGraph>
  executeMission(missionId: MissionId): Promise<MissionResult>
  pauseMission(missionId: MissionId): Promise<void>
  resumeMission(missionId: MissionId): Promise<void>
  cancelMission(missionId: MissionId): Promise<void>
  getMissionStatus(missionId: MissionId): Promise<MissionStatus>
  getMissionWorkspace(missionId: MissionId): Promise<MissionWorkspace>
}
```

### Memory Engine

**Responsibilities:**
- Store and retrieve working memory (current mission)
- Store and retrieve organization memory (shared knowledge)
- Store and retrieve personal memory (user preferences)
- Provide semantic search across memory tiers
- Handle memory consolidation and archival

**Boundaries:**
- Does NOT execute business logic (pure storage/retrieval)
- Does NOT make permission decisions (caller must verify access)
- Does NOT emit business events (caller handles events)
- DOES provide atomic operations with transaction support

**API Surface:**
```typescript
interface MemoryEngine {
  // Working Memory
  setWorkingMemory(missionId: string, key: string, value: any): Promise<void>
  getWorkingMemory(missionId: string, key: string): Promise<any>
  clearWorkingMemory(missionId: string): Promise<void>

  // Organization Memory
  setOrganizationMemory(orgId: string, key: string, value: any): Promise<void>
  getOrganizationMemory(orgId: string, key: string): Promise<any>
  searchOrganizationMemory(orgId: string, query: string): Promise<MemoryResult[]>

  // Personal Memory
  setPersonalMemory(userId: string, key: string, value: any): Promise<void>
  getPersonalMemory(userId: string, key: string): Promise<any>
  searchPersonalMemory(userId: string, query: string): Promise<MemoryResult[]>
}
```

### MyAIDocs (Artifact Engine)

**Responsibilities:**
- Store artifacts with full metadata
- Maintain relationship graph between artifacts
- Track version history
- Provide search and retrieval
- Render visual artifacts

**Boundaries:**
- Does NOT execute business logic (pure storage/retrieval)
- Does NOT make permission decisions (caller must verify access)
- Does NOT generate artifacts (caller provides content)
- DOES maintain referential integrity

**API Surface:**
```typescript
interface MyAIDocs {
  createArtifact(artifact: Artifact): Promise<ArtifactId>
  getArtifact(artifactId: ArtifactId): Promise<Artifact>
  updateArtifact(artifactId: ArtifactId, updates: Partial<Artifact>): Promise<void>
  deleteArtifact(artifactId: ArtifactId): Promise<void>
  searchArtifacts(query: SearchQuery): Promise<Artifact[]>
  getArtifactRelations(artifactId: ArtifactId): Promise<Relation[]>
  getArtifactVersions(artifactId: ArtifactId): Promise<Version[]>
  renderVisualArtifact(artifactId: ArtifactId): Promise<RenderResult>
}
```

### Event Bus

**Responsibilities:**
- Provide publish/subscribe interface for events
- Ensure event delivery guarantees
- Maintain event history for replay
- Support event filtering and routing

**Boundaries:**
- Does NOT execute business logic based on events
- Does NOT make permission decisions (caller must verify)
- Does NOT store event payloads long-term (event history only)
- DOES guarantee at-least-once delivery

**Event Types:**
```typescript
enum EventType {
  // Task events
  TASK_STARTED = 'TASK_STARTED',
  TASK_COMPLETED = 'TASK_COMPLETED',
  TASK_FAILED = 'TASK_FAILED',
  TASK_RETRYING = 'TASK_RETRYING',

  // Approval events
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
  APPROVAL_GRANTED = 'APPROVAL_GRANTED',
  APPROVAL_DENIED = 'APPROVAL_DENIED',

  // Mission events
  MISSION_CREATED = 'MISSION_CREATED',
  MISSION_STARTED = 'MISSION_STARTED',
  MISSION_COMPLETED = 'MISSION_COMPLETED',
  MISSION_FAILED = 'MISSION_FAILED',
  MISSION_PAUSED = 'MISSION_PAUSED',
  MISSION_RESUMED = 'MISSION_RESUMED',

  // Artifact events
  ARTIFACT_CREATED = 'ARTIFACT_CREATED',
  ARTIFACT_UPDATED = 'ARTIFACT_UPDATED',
  ARTIFACT_DELETED = 'ARTIFACT_DELETED',

  // Coworker events
  COWORKER_ASSIGNED = 'COWORKER_ASSIGNED',
  COWORKER_STATUS_CHANGED = 'COWORKER_STATUS_CHANGED',
  COWORKER_PERFORMANCE_UPDATED = 'COWORKER_PERFORMANCE_UPDATED',
}

interface Event {
  id: string
  type: EventType
  payload: any
  timestamp: Date
  source: string
  correlationId?: string
}
```

**API Surface:**
```typescript
interface EventBus {
  publish(event: Event): Promise<void>
  subscribe(eventType: EventType, handler: EventHandler): Subscription
  unsubscribe(subscription: Subscription): void
  getEventHistory(filter: EventFilter): Promise<Event[]>
  replayEvents(from: Date, to: Date): Promise<void>
}
```

### Identity & Permissions

**Responsibilities:**
- Manage users, teams, roles, organizations
- Enforce access control
- Handle approval workflows
- Manage tool permissions

**Boundaries:**
- Does NOT execute approved actions (caller executes)
- Does NOT store business data (only identity/permissions)
- Does NOT make authorization decisions for other systems
- DOES provide centralized permission checks

**API Surface:**
```typescript
interface IdentityPermissions {
  // Identity
  createUser(user: User): Promise<UserId>
  getUser(userId: UserId): Promise<User>
  createOrganization(org: Organization): Promise<OrgId>
  addUserToOrganization(userId: UserId, orgId: OrgId, role: Role): Promise<void>

  // Permissions
  checkPermission(userId: UserId, resource: Resource, action: Action): Promise<boolean>
  grantPermission(userId: UserId, permission: Permission): Promise<void>
  revokePermission(userId: UserId, permission: Permission): Promise<void>

  // Approvals
  requestApproval(request: ApprovalRequest): Promise<ApprovalId>
  approveRequest(approvalId: ApprovalId, userId: UserId): Promise<void>
  denyRequest(approvalId: ApprovalId, userId: UserId, reason: string): Promise<void>
  getApprovalStatus(approvalId: ApprovalId): Promise<ApprovalStatus>

  // Tool Permissions
  grantToolPermission(userId: UserId, tool: Tool): Promise<void>
  revokeToolPermission(userId: UserId, tool: Tool): Promise<void>
  checkToolPermission(userId: UserId, tool: Tool): Promise<boolean>
}
```

### Execution Layer

**Responsibilities:**
- Execute browser automation
- Execute desktop control
- Execute terminal commands
- Execute API calls
- Execute file operations

**Boundaries:**
- Does NOT make execution decisions (caller decides what to execute)
- Does NOT handle approvals (caller must get approval first)
- Does NOT store results (caller stores in MyAIDocs)
- DOES execute safely with sandboxing where possible

**API Surface:**
```typescript
interface ExecutionLayer {
  // Browser
  navigateTo(url: string): Promise<void>
  click(selector: string): Promise<void>
  type(selector: string, text: string): Promise<void>
  screenshot(): Promise<Buffer>
  executeScript(script: string): Promise<any>

  // Desktop
  launchApp(appId: string): Promise<void>
  closeApp(appId: string): Promise<void>
  focusWindow(windowId: string): Promise<void>

  // Terminal
  executeCommand(command: string): Promise<CommandResult>

  // Files
  readFile(path: string): Promise<Buffer>
  writeFile(path: string, content: Buffer): Promise<void>
  deleteFile(path: string): Promise<void>
}
```

## Communication Contracts

### Synchronous vs Asynchronous

**Synchronous (blocking):**
- Permission checks (must resolve before action)
- Memory reads (current mission context)
- Artifact retrieval

**Asynchronous (non-blocking):**
- Task execution
- Mission compilation
- Event publishing
- Long-running operations

### Request/Response Pattern

```typescript
// Standard request/response
interface Request<T> {
  id: string
  type: string
  payload: T
  timestamp: Date
}

interface Response<T> {
  requestId: string
  success: boolean
  data?: T
  error?: Error
  timestamp: Date
}
```

### Event-Driven Pattern

```typescript
// Publish event
await eventBus.publish({
  id: generateId(),
  type: EventType.TASK_STARTED,
  payload: { taskId, missionId, task },
  timestamp: new Date(),
  source: 'TaskEngine',
  correlationId: missionId
})

// Subscribe to events
const subscription = await eventBus.subscribe(
  EventType.TASK_COMPLETED,
  async (event) => {
    // Handle task completion
  }
)
```

### Error Handling Contract

All modules must:
1. Return typed errors with error codes
2. Include sufficient context for debugging
3. Never expose sensitive information in errors
4. Log errors to Observability layer

```typescript
interface JARVISError {
  code: string
  message: string
  context: Record<string, any>
  timestamp: Date
  stack?: string
}

enum ErrorCode {
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',
}
```

## State Ownership

### Working Memory (Mission-Scoped)

**Owner:** Mission Runtime
**Lifetime:** Mission duration
**Access:** Mission participants (human + assigned AI coworkers)
**Cleanup:** Automatic on mission completion

### Organization Memory

**Owner:** Organization
**Lifetime:** Permanent
**Access:** Organization members based on roles
**Cleanup:** Manual archival only

### Personal Memory

**Owner:** Individual user
**Lifetime:** Permanent
**Access:** User only
**Cleanup:** User-controlled

### MyAIDocs Artifacts

**Owner:** Creator (human or AI coworker)
**Lifetime:** Permanent (with version history)
**Access:** Based on project/organization permissions
**Cleanup:** Manual deletion or archival policies

### Event History

**Owner:** System
**Lifetime:** Configurable retention period
**Access:** System administrators
**Cleanup:** Automatic based on retention policy

## Communication Contracts Between Modules

### Mission Runtime → Execution Layer

**Contract:** Mission Runtime validates approvals, then delegates execution

```typescript
// Mission Runtime
async function executeTask(task: Task) {
  // Check permissions
  const hasPermission = await identityPermissions.checkPermission(
    task.userId,
    task.resource,
    task.action
  )
  if (!hasPermission) {
    throw new JARVISError(ErrorCode.PERMISSION_DENIED, '...')
  }

  // Request approval if needed
  if (task.requiresApproval) {
    const approvalId = await identityPermissions.requestApproval({
      task: task.id,
      userId: task.userId,
      description: task.description
    })
    // Wait for approval...
  }

  // Execute
  const result = await executionLayer.execute(task)
  
  // Store artifact
  if (result.artifact) {
    await myAIDocs.createArtifact(result.artifact)
  }

  // Emit event
  await eventBus.publish({
    type: EventType.TASK_COMPLETED,
    payload: { taskId: task.id, result }
  })

  return result
}
```

### Mission Runtime → Memory Engine

**Contract:** Mission Runtime owns working memory, delegates persistence

```typescript
// Mission Runtime
async function updateMissionContext(missionId: string, context: any) {
  await memoryEngine.setWorkingMemory(missionId, 'context', context)
  await eventBus.publish({
    type: EventType.MISSION_CONTEXT_UPDATED,
    payload: { missionId, context }
  })
}
```

### AI Workforce → Mission Runtime

**Contract:** AI coworkers request missions through Mission Runtime

```typescript
// AI Coworker
async function proposeMission(goal: string) {
  const missionId = await missionRuntime.createMission(goal, {
    proposedBy: this.id,
    organization: this.organization
  })
  
  // Subscribe to mission events
  const subscription = await eventBus.subscribe(
    EventType.MISSION_COMPLETED,
    (event) => {
      if (event.payload.missionId === missionId) {
        this.handleMissionCompletion(event.payload)
      }
    }
  )

  return missionId
}
```

## Event Bus Specification

### Event Schema

```typescript
interface Event {
  id: string                    // UUID
  type: EventType              // Enum of event types
  payload: any                 // Event-specific data
  timestamp: Date              // ISO 8601
  source: string               // Module that emitted the event
  correlationId?: string       // For tracing related events
  metadata?: Record<string, any> // Additional context
}
```

### Delivery Guarantees

- **At-least-once:** Events are delivered at least once
- **Ordering:** Events from the same source are delivered in order
- **Persistence:** Events are persisted for replay capability
- **Filtering:** Subscribers can filter by event type, source, or payload

### Subscription Model

```typescript
interface Subscription {
  id: string
  eventType: EventType
  handler: EventHandler
  filter?: EventFilter
  createdAt: Date
}

interface EventFilter {
  source?: string
  correlationId?: string
  payloadFilter?: Record<string, any>
}

type EventHandler = (event: Event) => Promise<void> | void
```

### Event History

Events are retained for configurable period (default: 30 days). History supports:
- Time-range queries
- Correlation ID queries
- Event type filtering
- Source filtering
- Replay for debugging

## Security Architecture

### Permission Model

**Hierarchical:**
1. **System-level permissions** (admin, system operations)
2. **Organization-level permissions** (org admin, member)
3. **Project-level permissions** (project owner, contributor)
4. **Resource-level permissions** (specific artifacts, tasks)

**Permission Types:**
- Read
- Write
- Execute
- Delete
- Approve
- Admin

### Approval Gates

**Auto-approve:**
- Read operations
- Operations within safe sandbox
- Operations with pre-approved templates

**Manual approval required:**
- Write operations outside sandbox
- System-level changes
- External API calls
- File deletions
- Cost-incurring operations

### Audit Trail

Every action logs:
- Who initiated (user or AI coworker)
- What action was taken
- When it was taken
- What resources were affected
- Approval chain (if applicable)
- Result (success/failure)

## Observability Architecture

### Logging Levels

- **ERROR:** System failures, security incidents
- **WARN:** Degraded performance, near-miss security issues
- **INFO:** Normal operations, state changes
- **DEBUG:** Detailed execution flow

### Metrics

- **Counter:** Incrementing values (tasks completed, errors)
- **Gauge:** Current values (active missions, memory usage)
- **Histogram:** Distributions (task duration, response times)
- **Summary:** Count + sum + quantiles

### Tracing

Distributed tracing for:
- Mission execution (spans for each task)
- API calls (spans for external services)
- AI model calls (spans for LLM requests)

### Mission Replay

Ability to replay a mission from event history for:
- Debugging failures
- Understanding execution flow
- Training and testing

## Data Storage Architecture

### Databases

**Primary Database (PostgreSQL):**
- Users, organizations, permissions
- Mission metadata
- Task graphs
- Coworker profiles
- Approval requests

**Document Store (MongoDB or PostgreSQL JSONB):**
- Organization memory
- Personal memory
- Artifact metadata
- Relationship graphs

**Object Storage (S3-compatible):**
- Artifact files (documents, images, code)
- Version history
- Large binary data

**Time-Series Database (optional):**
- Metrics and observability data
- Performance analytics

### Caching Layer

**Redis:**
- Session data
- Working memory (hot paths)
- Permission cache
- Event bus (if needed for scale)

### Search Index

**Elasticsearch or PostgreSQL Full-Text Search:**
- Organization memory search
- Personal memory search
- Artifact search
- Knowledge base search

## Scaling Architecture

### Horizontal Scaling

- **Stateless services:** Mission Runtime, Execution Layer, Event Bus consumers
- **Stateful services:** Memory Engine, MyAIDocs (with sharding)
- **Load balancing:** API gateway with round-robin or least-connections

### Vertical Scaling

- **Compute-intensive:** VisionReasoningEngine, AI model inference
- **I/O-intensive:** File operations, database queries
- **Memory-intensive:** Large mission workspaces, artifact rendering

### Queue-Based Processing

- **Task queue:** For async task execution
- **Event queue:** For event bus delivery
- **Approval queue:** For approval workflow processing

## Integration Architecture

### Connector Pattern

All external integrations follow a unified connector pattern:

```typescript
interface Connector {
  name: string
  version: string
  authenticate(credentials: Credentials): Promise<AuthResult>
  executeAction(action: Action): Promise<ActionResult>
  pollForChanges(since: Date): Promise<Change[]>
  webhookHandler(event: ExternalEvent): Promise<void>
}
```

### Supported Integrations

**Priority 1 (High-Value):**
- GitHub (code, issues, PRs)
- Gmail (email)
- Google Calendar (scheduling)
- Slack (communication)

**Priority 2 (Medium-Value):**
- Notion (documentation)
- Jira (project management)
- Linear (project management)
- Discord (communication)

**Priority 3 (Future):**
- Microsoft 365
- Stripe (payments)
- Shopify (e-commerce)
- HubSpot (CRM)

## Deployment Architecture

### Development

- Local development with Docker Compose
- Hot reloading for frontend
- Mock services for external integrations

### Staging

- Cloud deployment (AWS/GCP/Azure)
- Production-like configuration
- Staging environment for testing

### Production

- Multi-region deployment for high availability
- Database replication
- CDN for static assets
- Auto-scaling for compute resources
- Monitoring and alerting

## Technology Stack

### Frontend

- **Framework:** React + TypeScript
- **Desktop:** Tauri (Rust backend)
- **Styling:** Tailwind CSS
- **State Management:** React Context + Redux Toolkit
- **Real-time:** WebSocket + LiveKit (voice)

### Backend

- **Runtime:** Node.js + TypeScript
- **API:** REST + GraphQL
- **Real-time:** WebSocket + LiveKit
- **Task Queue:** BullMQ (Redis-backed)
- **Event Bus:** Redis Pub/Sub or dedicated message broker

### AI/ML

- **LLM Routing:** Custom orchestrator
- **Vision:** OpenAI Vision API or local models
- **Voice:** Deepgram (STT), ElevenLabs (TTS), LiveKit (WebRTC)

### Infrastructure

- **Database:** PostgreSQL
- **Cache:** Redis
- **Storage:** S3-compatible object storage
- **Search:** Elasticsearch or PostgreSQL full-text
- **Monitoring:** Prometheus + Grafana
- **Logging:** ELK Stack or cloud-native equivalent

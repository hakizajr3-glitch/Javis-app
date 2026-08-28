/**
 * Harness API route — exposes the 12-pillar harness state through REST.
 *
 * Both the Tauri desktop app and browser clients call these endpoints to read
 * and write harness state. The API server is the single source of truth; each
 * app polls /api/harness/state every few seconds and writes changes through
 * PUT /api/harness/state or the granular PATCH endpoints.
 *
 * The state endpoint pulls real data from the harness runtime (missions,
 * agents, memory stats, knowledge graph, learning runtime) so the dashboard
 * shows live data instead of mock values.
 */
import { Router, Request, Response } from 'express';

const router = Router();

// ─── In-memory harness state (toggle/autonomy/loopPhase/audit) ──────────────

interface HarnessState {
  toggles: Record<string, boolean>;
  autonomyLevel: number;
  missions: any[];
  agents: any[];
  memoryStats: any[];
  audit: any[];
  loopPhase: number;
  knowledgeGraph?: { entities: number; relationships: number; byType: Record<string, number> };
  learning?: { proposals: number; reflections: number; selfModel?: any };
  workspaces?: { total: number; active: number; cleanedUp: number };
  deviceFabric?: any;
  securityFabric?: any;
  updatedAt: string;
}

const defaultToggles: Record<string, boolean> = {
  // AUTONOMY
  'auto-missions': true, 'bg-exec': true, 'proactive': true,
  'self-eval': true, 'self-improve': false,
  // COMPUTER
  'desktop': false, 'browser': false, 'terminal': true,
  'vision': false, 'filesystem': true, 'mobile': false, 'remote': false,
  // AGENTS
  'multi-agent': true, 'spawn': true, 'delegate': true,
  'parallel': true, 'reviews': false,
  // INTELLIGENCE
  'model-router': true, 'prog-tools': true, 'deep-prog': true,
  'knowledge-graph': true, 'dna-memory': true,
  // EXECUTION
  'task-graphs': true, 'sandbox': true, 'verification': true,
  'recovery': true, 'lifecycle': true, 'events': true,
  // DEVELOPER
  'sdk': true, 'mcp': false, 'api': true, 'cli': true,
};

let state: HarnessState = {
  toggles: { ...defaultToggles },
  autonomyLevel: 2,
  missions: [],
  agents: [],
  memoryStats: [],
  audit: [],
  loopPhase: 8,
  updatedAt: new Date().toISOString(),
};

// ─── Real data fetcher ──────────────────────────────────────────────────────
/**
 * Pull live data from the harness runtime modules.
 * Each module is imported lazily so the API server doesn't crash if a
 * module isn't initialized yet.
 */
async function fetchRealData(): Promise<Partial<HarnessState>> {
  const data: Partial<HarnessState> = {};

  try {
    // Missions from missionRuntime
    const { missionRuntime } = await import('../../harness/missionRuntime.js');
    const missions = missionRuntime.listMissions();
    data.missions = missions.map(m => ({
      id: m.id,
      name: m.name?.slice(0, 60) || m.id,
      status: m.status,
      progress: m.compiledPlan?.tasks?.length
        ? m.compiledPlan.tasks.filter((t: any) => t.status === 'completed').length / m.compiledPlan.tasks.length
        : 0,
      tasks: m.compiledPlan?.tasks?.length ?? 0,
      completed: m.compiledPlan?.tasks?.filter((t: any) => t.status === 'completed').length ?? 0,
    }));
  } catch (_) { /* module not ready */ }

  try {
    // Agents from agentRuntime
    const { agentRuntime } = await import('../../harness/agentRuntime.js');
    const agents = agentRuntime.listAgents();
    data.agents = agents.map(a => ({
      id: a.agentId,
      name: a.name,
      role: a.role,
      state: a.state,
      model: 'auto',
    }));
  } catch (_) { /* module not ready */ }

  try {
    // Memory stats from the harness facade's memory runtime
    const { getHarness } = await import('../../harness/index.js');
    const harness = getHarness();
    const mem = harness.getMemoryRuntime();
    const stats = mem.getStats();
    data.memoryStats = [
      { label: 'Episodic', value: String(stats.byKind['episodic'] ?? 0), sub: 'records' },
      { label: 'Semantic', value: String(stats.byKind['semantic'] ?? 0), sub: 'records' },
      { label: 'Procedural', value: String(stats.byKind['procedural'] ?? 0), sub: 'skills' },
      { label: 'Working', value: String(stats.workingScopes ?? 0), sub: 'active' },
      { label: 'Reflective', value: String(stats.byKind['reflective'] ?? 0), sub: 'lessons' },
      { label: 'DNA Agents', value: String(stats.dnaCount ?? 0), sub: 'profiles' },
    ];
  } catch (_) { /* harness not initialized */ }

  try {
    // Knowledge graph stats
    const { knowledgeGraph } = await import('../../harness/knowledgeGraph.js');
    data.knowledgeGraph = knowledgeGraph.getStats();
  } catch (_) { /* module not ready */ }

  try {
    // Learning runtime stats
    const { getHarness } = await import('../../harness/index.js');
    const harness = getHarness();
    const learning = harness.getLearningRuntime();
    data.learning = {
      proposals: learning.listProposals().length,
      reflections: learning.listReflections().length,
      selfModel: learning.getSelfModel(),
    };
  } catch (_) { /* module not ready */ }

  try {
    // Workspace stats
    const { workspaceManager } = await import('../../harness/workspaceManager.js');
    data.workspaces = workspaceManager.getStats();
  } catch (_) { /* module not ready */ }

  try {
    // Device fabric stats
    const { deviceFabric } = await import('../../harness/deviceFabric.js');
    data.deviceFabric = deviceFabric.getStats();
  } catch (_) { /* module not ready */ }

  try {
    // Security fabric stats
    const { securityFabric } = await import('../../harness/securityFabric.js');
    data.securityFabric = securityFabric.getStats();
  } catch (_) { /* module not ready */ }

  return data;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /api/harness/state — return the full harness state with real runtime data
router.get('/state', async (_req: Request, res: Response) => {
  // Merge real runtime data into the cached state
  const realData = await fetchRealData();
  const merged: HarnessState = {
    ...state,
    ...realData,
    updatedAt: new Date().toISOString(),
  };
  res.json(merged);
});

// PUT /api/harness/state — replace the full harness state
router.put('/state', (req: Request, res: Response) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object') {
    res.status(400).json({ error: 'Body must be a harness state object' });
    return;
  }
  // Only update toggle/autonomy/loopPhase — runtime data is read-only via PUT
  state = {
    ...state,
    toggles: incoming.toggles ?? state.toggles,
    autonomyLevel: incoming.autonomyLevel ?? state.autonomyLevel,
    loopPhase: incoming.loopPhase ?? state.loopPhase,
    updatedAt: new Date().toISOString(),
  };
  res.json(state);
});

// PATCH /api/harness/toggles/:id — toggle a single pillar switch
router.patch('/toggles/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { on } = req.body;
  if (typeof on !== 'boolean') {
    res.status(400).json({ error: 'Body must include { on: boolean }' });
    return;
  }
  state.toggles[id] = on;
  state.updatedAt = new Date().toISOString();
  res.json({ id, on, updatedAt: state.updatedAt });
});

// PATCH /api/harness/autonomy — set the autonomy level
router.patch('/autonomy', (req: Request, res: Response) => {
  const { level } = req.body;
  if (typeof level !== 'number' || level < 0 || level > 5) {
    res.status(400).json({ error: 'Level must be a number 0-5' });
    return;
  }
  state.autonomyLevel = level;
  state.updatedAt = new Date().toISOString();
  res.json({ level, updatedAt: state.updatedAt });
});

// POST /api/harness/audit — append an audit entry
router.post('/audit', (req: Request, res: Response) => {
  const { event, level } = req.body;
  if (!event) {
    res.status(400).json({ error: 'Body must include { event: string }' });
    return;
  }
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const entry = { time, event, level: level || 'info' };
  state.audit = [...state.audit.slice(-50), entry];
  state.updatedAt = new Date().toISOString();
  res.json(entry);
});

// PATCH /api/harness/loop-phase — set the current Elite Loop phase
router.patch('/loop-phase', (req: Request, res: Response) => {
  const { phase } = req.body;
  if (typeof phase !== 'number') {
    res.status(400).json({ error: 'Body must include { phase: number }' });
    return;
  }
  state.loopPhase = phase;
  state.updatedAt = new Date().toISOString();
  res.json({ phase, updatedAt: state.updatedAt });
});

export default router;

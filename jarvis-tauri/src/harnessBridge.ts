/**
 * harnessBridge — shared state layer for the Harness Control Center.
 *
 * Both the Tauri and Electron desktop apps import this module to read
 * and write harness state. The jarvis-core API server (http://localhost:3001)
 * is the single source of truth when available — when you toggle a switch,
 * it writes to the API server.
 *
 * If the API server isn't running (common when users download and run the
 * app locally without starting the separate Node API server), the bridge:
 *   1. Falls back to localStorage for toggles/autonomy/loopPhase/audit
 *   2. Pulls in-process data from browser-safe jarvis-core modules
 *      (knowledgeGraph, workspaceManager, agentFactory) and coreBridge
 *      (agents/teams) so the dashboard still shows real data
 */

const API_BASE = 'http://localhost:3001/api/harness';
const STORAGE_KEY = 'jarvis_harness_state';
const POLL_INTERVAL_MS = 3000;

export interface HarnessState {
  toggles: Record<string, boolean>;
  autonomyLevel: number;
  missions: any[];
  agents: any[];
  memoryStats: any[];
  audit: any[];
  loopPhase: number;
  knowledgeGraph?: { entities: number; relationships: number; byType: Record<string, number> };
  learning?: { proposals: number; reflections: number };
  workspaces?: { total: number; active: number; cleanedUp: number };
  updatedAt: string;
}

// ─── Default state (matches the API server defaults) ────────────────────────

const defaultToggles: Record<string, boolean> = {
  'auto-missions': true, 'bg-exec': true, 'proactive': true,
  'self-eval': true, 'self-improve': false,
  'desktop': false, 'browser': false, 'terminal': true,
  'vision': false, 'filesystem': true, 'mobile': false, 'remote': false,
  'multi-agent': true, 'spawn': true, 'delegate': true,
  'parallel': true, 'reviews': false,
  'model-router': true, 'prog-tools': true, 'deep-prog': true,
  'knowledge-graph': true, 'dna-memory': true,
  'task-graphs': true, 'sandbox': true, 'verification': true,
  'recovery': true, 'lifecycle': true, 'events': true,
  'sdk': true, 'mcp': false, 'api': true, 'cli': true,
};

const defaultState: HarnessState = {
  toggles: { ...defaultToggles },
  autonomyLevel: 2,
  missions: [],
  agents: [],
  memoryStats: [],
  audit: [],
  loopPhase: 8,
  updatedAt: new Date().toISOString(),
};

// ─── Internal state ──────────────────────────────────────────────────────────

let cachedState: HarnessState = loadFromStorage() || { ...defaultState };
let listeners: Set<(state: HarnessState) => void> = new Set();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let apiAvailable = false;

// ─── Storage helpers ─────────────────────────────────────────────────────────

function loadFromStorage(): HarnessState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) { /* ignore */ }
  return null;
}

function saveToStorage(state: HarnessState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) { /* ignore */ }
}

// ─── In-process data fetcher (browser-safe jarvis-core modules) ─────────────
/**
 * When the API server isn't running (the common case for local downloads),
 * pull real data from the in-process jarvis-core modules that are browser-safe.
 * This ensures the dashboard shows real data even without the separate server.
 */

// Import browser-safe singletons at module load time. These are tree-shaken
// by Vite and only the actually-used code ends up in the bundle.
import { knowledgeGraph as kgSingleton } from '@jarvis-core/browser.js';
import { workspaceManager as wsSingleton } from '@jarvis-core/browser.js';
import { coreBridge } from './coreBridge';

function fetchInProcessData(): Partial<HarnessState> {
  const data: Partial<HarnessState> = {};

  try {
    if (kgSingleton?.getStats) {
      data.knowledgeGraph = kgSingleton.getStats();
    }
  } catch (_) { /* module not available */ }

  try {
    if (wsSingleton?.getStats) {
      data.workspaces = wsSingleton.getStats();
    }
  } catch (_) { /* module not available */ }

  try {
    // Agent entities from the knowledge graph
    if (kgSingleton?.query) {
      const agents = kgSingleton.query({ type: 'agent' });
      if (agents.length > 0) {
        data.agents = agents.map((a: any) => ({
          id: a.id,
          name: a.name,
          role: a.description || 'agent',
          state: 'idle',
          model: 'auto',
        }));
      }
    }
  } catch (_) { /* module not available */ }

  try {
    // coreBridge agents — in-process workforce data
    if (coreBridge?.getAgents) {
      const agents = coreBridge.getAgents();
      if (agents.length > 0) {
        data.agents = agents.map((a: any) => ({
          id: a.id,
          name: a.name,
          role: a.role,
          state: a.status === 'active' || a.status === 'busy' ? 'running' : 'idle',
          model: 'auto',
        }));
      }
    }
  } catch (_) { /* module not available */ }

  return data;
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function fetchState(): Promise<HarnessState | null> {
  try {
    const res = await fetch(`${API_BASE}/state`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const data = await res.json();
    apiAvailable = true;
    return data;
  } catch (_) {
    apiAvailable = false;
    // API server not running — merge in-process data into cached state
    // so the dashboard shows real data from the browser-safe modules
    const inProcess = fetchInProcessData();
    const merged: HarnessState = {
      ...cachedState,
      ...inProcess,
      updatedAt: new Date().toISOString(),
    };
    updateState(merged);
    return null;
  }
}

async function patchToggle(id: string, on: boolean): Promise<void> {
  try {
    await fetch(`${API_BASE}/toggles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ on }),
      signal: AbortSignal.timeout(2000),
    });
  } catch (_) { /* fallback to localStorage */ }
}

async function patchAutonomy(level: number): Promise<void> {
  try {
    await fetch(`${API_BASE}/autonomy`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level }),
      signal: AbortSignal.timeout(2000),
    });
  } catch (_) { /* fallback to localStorage */ }
}

async function patchLoopPhase(phase: number): Promise<void> {
  try {
    await fetch(`${API_BASE}/loop-phase`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase }),
      signal: AbortSignal.timeout(2000),
    });
  } catch (_) { /* fallback to localStorage */ }
}

async function postAudit(event: string, level: string = 'info'): Promise<void> {
  try {
    await fetch(`${API_BASE}/audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, level }),
      signal: AbortSignal.timeout(2000),
    });
  } catch (_) { /* fallback to localStorage */ }
}

// ─── Notification ────────────────────────────────────────────────────────────

function notifyListeners(): void {
  for (const cb of listeners) {
    try { cb(cachedState); } catch (_) { /* ignore */ }
  }
}

function updateState(next: HarnessState): void {
  cachedState = next;
  saveToStorage(next);
  notifyListeners();
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const harnessBridge = {
  /** Get the current cached state (synchronous — for initial render). */
  getState(): HarnessState {
    return cachedState;
  },

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(cb: (state: HarnessState) => void): () => void {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  },

  /** Start polling the API server for state changes. */
  startPolling(): void {
    if (pollTimer) return;
    // Immediately fetch
    (async () => {
      const remote = await fetchState();
      if (remote) updateState(remote);
    })();
    pollTimer = setInterval(async () => {
      const remote = await fetchState();
      if (remote) updateState(remote);
    }, POLL_INTERVAL_MS);
  },

  /** Stop polling. */
  stopPolling(): void {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  },

  /** Toggle a pillar switch. Writes to API server + localStorage. */
  async toggle(id: string, on: boolean): Promise<void> {
    const next = {
      ...cachedState,
      toggles: { ...cachedState.toggles, [id]: on },
      updatedAt: new Date().toISOString(),
    };
    updateState(next);
    await patchToggle(id, on);
  },

  /** Set the autonomy level. Writes to API server + localStorage. */
  async setAutonomy(level: number): Promise<void> {
    const next = {
      ...cachedState,
      autonomyLevel: level,
      updatedAt: new Date().toISOString(),
    };
    updateState(next);
    await patchAutonomy(level);
  },

  /** Set the Elite Loop phase. Writes to API server + localStorage. */
  async setLoopPhase(phase: number): Promise<void> {
    const next = {
      ...cachedState,
      loopPhase: phase,
      updatedAt: new Date().toISOString(),
    };
    updateState(next);
    await patchLoopPhase(phase);
  },

  /** Append an audit entry. Writes to API server + localStorage. */
  async addAudit(event: string, level: string = 'info'): Promise<void> {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const entry = { time, event, level };
    const next = {
      ...cachedState,
      audit: [...cachedState.audit.slice(-50), entry],
      updatedAt: new Date().toISOString(),
    };
    updateState(next);
    await postAudit(event, level);
  },

  /** Check if the API server is available. */
  isApiAvailable(): boolean {
    return apiAvailable;
  },
};

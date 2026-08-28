const API_BASE = "http://localhost:3001/api/harness";
const STORAGE_KEY = "jarvis_harness_state";
const POLL_INTERVAL_MS = 3e3;
const defaultToggles = {
  "auto-missions": true,
  "bg-exec": true,
  "proactive": true,
  "self-eval": true,
  "self-improve": false,
  "desktop": false,
  "browser": false,
  "terminal": true,
  "vision": false,
  "filesystem": true,
  "mobile": false,
  "remote": false,
  "multi-agent": true,
  "spawn": true,
  "delegate": true,
  "parallel": true,
  "reviews": false,
  "model-router": true,
  "prog-tools": true,
  "deep-prog": true,
  "knowledge-graph": true,
  "dna-memory": true,
  "task-graphs": true,
  "sandbox": true,
  "verification": true,
  "recovery": true,
  "lifecycle": true,
  "events": true,
  "sdk": true,
  "mcp": false,
  "api": true,
  "cli": true
};
const defaultState = {
  toggles: { ...defaultToggles },
  autonomyLevel: 2,
  missions: [
    { id: "m1", name: "Deploy marketing site", status: "running", progress: 0.4, tasks: 5, completed: 2 },
    { id: "m2", name: "Research Claude release", status: "queued", progress: 0, tasks: 3, completed: 0 },
    { id: "m3", name: "Fix auth bug #142", status: "completed", progress: 1, tasks: 4, completed: 4 }
  ],
  agents: [
    { id: "a1", name: "Browser Executor", role: "executor", state: "running", model: "claude-sonnet-4.5" },
    { id: "a2", name: "File Executor", role: "executor", state: "idle", model: "gpt-4o" },
    { id: "a3", name: "Shell Sandbox", role: "executor", state: "idle", model: "gemini-2.5-flash" },
    { id: "a4", name: "Planner", role: "planner", state: "running", model: "claude-sonnet-4.5" }
  ],
  memoryStats: [
    { label: "Episodic", value: "1,247", sub: "records" },
    { label: "Semantic", value: "893", sub: "records" },
    { label: "Procedural", value: "156", sub: "skills" },
    { label: "Working", value: "12", sub: "active" },
    { label: "Reflective", value: "84", sub: "lessons" },
    { label: "DNA Agents", value: "4", sub: "profiles" }
  ],
  audit: [
    { time: "10:42:01", event: "Mission started: deploy-marketing-site", level: "info" },
    { time: "10:42:03", event: "Task 2 completed: parse goal & entities", level: "success" },
    { time: "10:42:05", event: "Approval requested: vercel --prod", level: "warn" },
    { time: "10:42:07", event: "Browser agent navigating to vercel.com", level: "info" },
    { time: "10:42:09", event: "Verification passed: dashboard loaded", level: "success" },
    { time: "10:42:12", event: "Recovery triggered: token expired, refreshing", level: "warn" },
    { time: "10:42:15", event: "Task 3 running: deploy production build", level: "info" }
  ],
  loopPhase: 8,
  updatedAt: (/* @__PURE__ */ new Date()).toISOString()
};
let cachedState = loadFromStorage() || { ...defaultState };
let listeners = /* @__PURE__ */ new Set();
let pollTimer = null;
let apiAvailable = false;
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {
  }
  return null;
}
function saveToStorage(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) {
  }
}
async function fetchState() {
  try {
    const res = await fetch(`${API_BASE}/state`, { signal: AbortSignal.timeout(2e3) });
    if (!res.ok) return null;
    const data = await res.json();
    apiAvailable = true;
    return data;
  } catch (_) {
    apiAvailable = false;
    return null;
  }
}
async function putState(state) {
  try {
    await fetch(`${API_BASE}/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
      signal: AbortSignal.timeout(2e3)
    });
    apiAvailable = true;
  } catch (_) {
    apiAvailable = false;
  }
}
async function patchToggle(id, on) {
  try {
    await fetch(`${API_BASE}/toggles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on }),
      signal: AbortSignal.timeout(2e3)
    });
  } catch (_) {
  }
}
async function patchAutonomy(level) {
  try {
    await fetch(`${API_BASE}/autonomy`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level }),
      signal: AbortSignal.timeout(2e3)
    });
  } catch (_) {
  }
}
async function patchLoopPhase(phase) {
  try {
    await fetch(`${API_BASE}/loop-phase`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase }),
      signal: AbortSignal.timeout(2e3)
    });
  } catch (_) {
  }
}
async function postAudit(event, level = "info") {
  try {
    await fetch(`${API_BASE}/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, level }),
      signal: AbortSignal.timeout(2e3)
    });
  } catch (_) {
  }
}
function notifyListeners() {
  for (const cb of listeners) {
    try {
      cb(cachedState);
    } catch (_) {
    }
  }
}
function updateState(next) {
  cachedState = next;
  saveToStorage(next);
  notifyListeners();
}
const harnessBridge = {
  /** Get the current cached state (synchronous — for initial render). */
  getState() {
    return cachedState;
  },
  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(cb) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
  /** Start polling the API server for state changes. */
  startPolling() {
    if (pollTimer) return;
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
  stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  },
  /** Toggle a pillar switch. Writes to API server + localStorage. */
  async toggle(id, on) {
    const next = {
      ...cachedState,
      toggles: { ...cachedState.toggles, [id]: on },
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    updateState(next);
    await patchToggle(id, on);
  },
  /** Set the autonomy level. Writes to API server + localStorage. */
  async setAutonomy(level) {
    const next = {
      ...cachedState,
      autonomyLevel: level,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    updateState(next);
    await patchAutonomy(level);
  },
  /** Set the Elite Loop phase. Writes to API server + localStorage. */
  async setLoopPhase(phase) {
    const next = {
      ...cachedState,
      loopPhase: phase,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    updateState(next);
    await patchLoopPhase(phase);
  },
  /** Append an audit entry. Writes to API server + localStorage. */
  async addAudit(event, level = "info") {
    const now = /* @__PURE__ */ new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    const entry = { time, event, level };
    const next = {
      ...cachedState,
      audit: [...cachedState.audit.slice(-50), entry],
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    updateState(next);
    await postAudit(event, level);
  },
  /** Check if the API server is available. */
  isApiAvailable() {
    return apiAvailable;
  }
};
export {
  harnessBridge
};

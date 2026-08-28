import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity, Cpu, Users, Brain, Zap, Terminal, Shield, Radio,
  Power, AlertCircle, CheckCircle2,
  Layers, GitBranch, Database, Sparkles, Gauge,
  CircleDot,
} from 'lucide-react';
import { harnessBridge } from '../../harnessBridge';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PillarToggle {
  id: string;
  label: string;
  on: boolean;
  pillar: string;
}

interface MissionRow {
  id: string;
  name: string;
  status: 'running' | 'queued' | 'paused' | 'completed' | 'failed';
  progress: number;
  tasks: number;
  completed: number;
}

interface AgentRow {
  id: string;
  name: string;
  role: string;
  state: 'running' | 'idle' | 'paused' | 'completed';
  model: string;
}

interface MemoryStat {
  label: string;
  value: string;
  sub?: string;
}

interface AuditEntry {
  time: string;
  event: string;
  level: 'info' | 'warn' | 'error' | 'success';
}

// ─── Initial state (synced from harnessBridge on mount) ─────────────────────

const initialToggles: PillarToggle[] = [
  // AUTONOMY
  { id: 'auto-missions', label: 'Autonomous Missions', on: true, pillar: 'AUTONOMY' },
  { id: 'bg-exec', label: 'Background Execution', on: true, pillar: 'AUTONOMY' },
  { id: 'proactive', label: 'Proactive Intelligence', on: true, pillar: 'AUTONOMY' },
  { id: 'self-eval', label: 'Self Evaluation', on: true, pillar: 'AUTONOMY' },
  { id: 'self-improve', label: 'Self Improvement', on: false, pillar: 'AUTONOMY' },
  // COMPUTER
  { id: 'desktop', label: 'Desktop Control', on: false, pillar: 'COMPUTER' },
  { id: 'browser', label: 'Browser Control', on: false, pillar: 'COMPUTER' },
  { id: 'terminal', label: 'Terminal', on: true, pillar: 'COMPUTER' },
  { id: 'vision', label: 'Vision', on: false, pillar: 'COMPUTER' },
  { id: 'filesystem', label: 'Filesystem', on: true, pillar: 'COMPUTER' },
  { id: 'mobile', label: 'Mobile Devices', on: false, pillar: 'COMPUTER' },
  { id: 'remote', label: 'Remote Devices', on: false, pillar: 'COMPUTER' },
  // AGENTS
  { id: 'multi-agent', label: 'Multi-Agent Coordination', on: true, pillar: 'AGENTS' },
  { id: 'spawn', label: 'Agent Spawning', on: true, pillar: 'AGENTS' },
  { id: 'delegate', label: 'Agent Delegation', on: true, pillar: 'AGENTS' },
  { id: 'parallel', label: 'Parallel Execution', on: true, pillar: 'AGENTS' },
  { id: 'reviews', label: 'Agent Reviews', on: false, pillar: 'AGENTS' },
  // INTELLIGENCE
  { id: 'model-router', label: 'Model Router', on: true, pillar: 'INTELLIGENCE' },
  { id: 'prog-tools', label: 'Progressive Tools', on: true, pillar: 'INTELLIGENCE' },
  { id: 'deep-prog', label: 'Deep Programmability', on: true, pillar: 'INTELLIGENCE' },
  { id: 'knowledge-graph', label: 'Knowledge Graph', on: true, pillar: 'INTELLIGENCE' },
  { id: 'dna-memory', label: 'DNA Memory', on: true, pillar: 'INTELLIGENCE' },
  // EXECUTION
  { id: 'task-graphs', label: 'Task Graphs', on: true, pillar: 'EXECUTION' },
  { id: 'sandbox', label: 'Sandboxing', on: true, pillar: 'EXECUTION' },
  { id: 'verification', label: 'Verification', on: true, pillar: 'EXECUTION' },
  { id: 'recovery', label: 'Recovery', on: true, pillar: 'EXECUTION' },
  { id: 'lifecycle', label: 'Lifecycle Hooks', on: true, pillar: 'EXECUTION' },
  { id: 'events', label: 'Event System', on: true, pillar: 'EXECUTION' },
  // DEVELOPER
  { id: 'sdk', label: 'SDK', on: true, pillar: 'DEVELOPER' },
  { id: 'mcp', label: 'MCP Gateway', on: false, pillar: 'DEVELOPER' },
  { id: 'api', label: 'API', on: true, pillar: 'DEVELOPER' },
  { id: 'cli', label: 'CLI', on: true, pillar: 'DEVELOPER' },
];

const pillarSections = [
  { name: 'AUTONOMY', icon: Shield, color: 'text-stonic-primary' },
  { name: 'COMPUTER', icon: Cpu, color: 'text-stonic-accent' },
  { name: 'AGENTS', icon: Users, color: 'text-stonic-accent2' },
  { name: 'INTELLIGENCE', icon: Brain, color: 'text-stonic-primary' },
  { name: 'EXECUTION', icon: Zap, color: 'text-stonic-warning' },
  { name: 'DEVELOPER', icon: Terminal, color: 'text-stonic-textMuted' },
] as const;

const autonomyLevels = [
  { level: 0, label: 'Observe', desc: 'Inspect and analyze only' },
  { level: 1, label: 'Recommend', desc: 'Propose actions' },
  { level: 2, label: 'Execute Safe', desc: 'Routine reversible work' },
  { level: 3, label: 'Autonomous', desc: 'Plan and execute missions' },
  { level: 4, label: 'Self-Improve', desc: 'Develop & test improvements' },
  { level: 5, label: 'High-Impact', desc: 'Requires explicit authorization' },
];

const eliteLoop = [
  'Perceive', 'Context', 'Reason', 'Plan', 'Policy',
  'Allocate', 'Select Agent', 'Select Tool', 'Execute',
  'Observe', 'Verify', 'Detect Error', 'Recover', 'Validate',
  'Remember', 'Reflect', 'Update', 'Next',
];

// ─── Empty defaults (real data comes from harnessBridge polling) ────────────

// ─── Sub-components ──────────────────────────────────────────────────────────

const Toggle: React.FC<{ toggle: PillarToggle; onToggle: (id: string) => void }> = ({ toggle, onToggle }) => (
  <button
    onClick={() => onToggle(toggle.id)}
    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all group
      ${toggle.on
        ? 'bg-stonic-primary/10 border-stonic-primary/20 hover:bg-stonic-primary/15'
        : 'bg-stonic-surface/40 border-stonic-b1/50 hover:bg-stonic-hover/30'
      }`}
  >
    <span className={`text-[10px] font-medium tracking-wide ${toggle.on ? 'text-stonic-text' : 'text-stonic-textMuted'}`}>
      {toggle.label}
    </span>
    <div className={`w-7 h-3.5 rounded-full transition-all relative ${toggle.on ? 'bg-stonic-primary/30' : 'bg-stonic-surface'}`}>
      <div
        className={`absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all ${
          toggle.on ? 'left-3.5 bg-stonic-primary shadow-[0_0_6px_rgba(0,216,238,0.6)]' : 'left-0.5 bg-stonic-textDim'
        }`}
      />
    </div>
  </button>
);

const StatusDot: React.FC<{ status: string }> = ({ status }) => {
  const colors: Record<string, string> = {
    running: 'bg-stonic-primary animate-pulse',
    queued: 'bg-stonic-textDim',
    paused: 'bg-stonic-warning',
    completed: 'bg-stonic-success',
    failed: 'bg-stonic-error',
    idle: 'bg-stonic-textDim',
  };
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors[status] || colors.idle}`} />;
};

const MissionStatusBadge: React.FC<{ status: MissionRow['status'] }> = ({ status }) => {
  const styles: Record<string, string> = {
    running: 'bg-stonic-primary/10 text-stonic-primary border-stonic-primary/20',
    queued: 'bg-stonic-surface text-stonic-textDim border-stonic-b1',
    paused: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase ${styles[status]}`}>
      {status}
    </span>
  );
};

const AuditIcon: React.FC<{ level: AuditEntry['level'] }> = ({ level }) => {
  switch (level) {
    case 'success': return <CheckCircle2 size={10} className="text-emerald-400" />;
    case 'warn': return <AlertCircle size={10} className="text-amber-400" />;
    case 'error': return <AlertCircle size={10} className="text-red-400" />;
    default: return <CircleDot size={10} className="text-stonic-textDim" />;
  }
};

// ─── Elite Loop Visualization ────────────────────────────────────────────────

const EliteLoopViz: React.FC<{ activePhase: number }> = ({ activePhase }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const phaseRef = useRef(activePhase);
  phaseRef.current = activePhase;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      ctx.scale(2, 2);
    };
    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.35;

      // Draw circular track
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 216, 238, 0.08)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw phase dots
      const phases = eliteLoop.length;
      for (let i = 0; i < phases; i++) {
        const angle = (i / phases) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        const isActive = i === phaseRef.current;

        ctx.beginPath();
        ctx.arc(x, y, isActive ? 4 : 2, 0, Math.PI * 2);
        if (isActive) {
          ctx.fillStyle = '#00d8ee';
          ctx.shadowColor = 'rgba(0, 216, 238, 0.8)';
          ctx.shadowBlur = 12;
        } else {
          ctx.fillStyle = 'rgba(0, 216, 238, 0.3)';
          ctx.shadowBlur = 0;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Draw active phase connector
      const activeAngle = (phaseRef.current / phases) * Math.PI * 2 - Math.PI / 2;
      const activeX = cx + Math.cos(activeAngle) * radius;
      const activeY = cy + Math.sin(activeAngle) * radius;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(activeX, activeY);
      ctx.strokeStyle = 'rgba(0, 216, 238, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Center pulse
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 400);
      ctx.beginPath();
      ctx.arc(cx, cy, 6 + pulse * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 216, 238, ${0.3 + pulse * 0.3})`;
      ctx.shadowColor = 'rgba(0, 216, 238, 0.6)';
      ctx.shadowBlur = 15;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Orbiting particle
      const orbitAngle = (Date.now() / 2000) * Math.PI * 2;
      const ox = cx + Math.cos(orbitAngle) * radius;
      const oy = cy + Math.sin(orbitAngle) * radius;
      ctx.beginPath();
      ctx.arc(ox, oy, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#00f5d4';
      ctx.shadowColor = 'rgba(0, 245, 212, 0.8)';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;

      animRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <div className="text-[10px] text-stonic-primary font-mono-tech font-bold tracking-wider">
            {eliteLoop[activePhase].toUpperCase()}
          </div>
          <div className="text-[8px] text-stonic-textDim font-mono-tech mt-0.5">
            Phase {activePhase + 1}/{eliteLoop.length}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

export const HarnessControlCenter: React.FC = () => {
  // ── Synced state via harnessBridge ──────────────────────────────────────
  const bridgeState = harnessBridge.getState();
  const [toggles, setToggles] = useState<PillarToggle[]>(
    initialToggles.map(t => ({ ...t, on: bridgeState.toggles[t.id] ?? t.on }))
  );
  const [autonomyLevel, setAutonomyLevelState] = useState(bridgeState.autonomyLevel);
  const [missions, setMissions] = useState<MissionRow[]>(bridgeState.missions as MissionRow[]);
  const [agents, setAgents] = useState<AgentRow[]>(bridgeState.agents as AgentRow[]);
  const [memoryStats, setMemoryStats] = useState<MemoryStat[]>(bridgeState.memoryStats as MemoryStat[]);
  const [audit, setAudit] = useState<AuditEntry[]>(bridgeState.audit as AuditEntry[]);
  const [loopPhase, setLoopPhaseState] = useState(bridgeState.loopPhase);
  const [rightTab, setRightTab] = useState<'missions' | 'agents' | 'memory' | 'audit'>('missions');
  // Real runtime stats from the bridge
  const [kgStats, setKgStats] = useState<{ entities: number; relationships: number; byType: Record<string, number> } | null>(null);
  const [learningStats, setLearningStats] = useState<{ proposals: number; reflections: number } | null>(null);
  const [workspaceStats, setWorkspaceStats] = useState<{ total: number; active: number; cleanedUp: number } | null>(null);

  // ── Subscribe to bridge state changes ───────────────────────────────────
  useEffect(() => {
    harnessBridge.startPolling();
    const unsub = harnessBridge.subscribe((state) => {
      setToggles(prev => prev.map(t => ({ ...t, on: state.toggles[t.id] ?? t.on })));
      setAutonomyLevelState(state.autonomyLevel);
      setLoopPhaseState(state.loopPhase);
      // Update all reactive data from the real runtime
      if (state.missions) setMissions(state.missions as MissionRow[]);
      if (state.agents) setAgents(state.agents as AgentRow[]);
      if (state.memoryStats) setMemoryStats(state.memoryStats as MemoryStat[]);
      if (state.audit) setAudit(state.audit as AuditEntry[]);
      // Update extended stats from the API
      if ((state as any).knowledgeGraph) setKgStats((state as any).knowledgeGraph);
      if ((state as any).learning) setLearningStats((state as any).learning);
      if ((state as any).workspaces) setWorkspaceStats((state as any).workspaces);
    });
    return () => {
      unsub();
      harnessBridge.stopPolling();
    };
  }, []);

  // ── Elite Loop cycling ──────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setLoopPhaseState(p => {
        const next = (p + 1) % eliteLoop.length;
        harnessBridge.setLoopPhase(next);
        return next;
      });
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // ── Live audit feed from real runtime events ────────────────────────────
  // The audit feed is populated by the harnessBridge polling cycle, which
  // fetches real events from the API server's /state endpoint. No synthetic
  // events are generated — only real runtime activity appears here.

  const handleToggle = useCallback((id: string) => {
    setToggles(prev => {
      const t = prev.find(x => x.id === id);
      if (t) harnessBridge.toggle(id, !t.on);
      return prev.map(x => x.id === id ? { ...x, on: !x.on } : x);
    });
  }, []);

  const handleAutonomyChange = useCallback((level: number) => {
    setAutonomyLevelState(level);
    harnessBridge.setAutonomy(level);
  }, []);

  const activeMissions = missions.filter(m => m.status === 'running').length;
  const queuedMissions = missions.filter(m => m.status === 'queued').length;
  const activeAgents = agents.filter(a => a.state === 'running').length;
  const enabledPillars = toggles.filter(t => t.on).length;
  const totalPillars = toggles.length;
  const totalTasksDone = missions.reduce((s, m) => s + m.completed, 0);
  const totalTasks = missions.reduce((s, m) => s + m.tasks, 0);
  const verifyPassRate = totalTasks > 0 ? Math.round((totalTasksDone / totalTasks) * 100) : 0;

  return (
    <div className="flex-1 flex gap-4 min-w-0 overflow-hidden">
      {/* Left rail — Pillar Control Center */}
      <aside className="w-72 shrink-0 bg-stonic-card border border-stonic-b1 rounded-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-stonic-b1">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-stonic-primary to-stonic-accent shadow-[0_0_12px_rgba(0,216,238,0.35)] flex items-center justify-center">
              <Power size={14} className="text-stonic-dark" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-wide text-stonic-text">Harness Control</div>
              <div className="text-[9px] text-stonic-textDim font-mono-tech">12-Pillar Runtime</div>
            </div>
          </div>

          {/* Pillar status summary */}
          <div className="flex items-center gap-2 text-[9px] font-mono-tech">
            <span className="text-stonic-textDim">Pillars</span>
            <div className="flex-1 h-1 bg-stonic-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-stonic-primary rounded-full transition-all"
                style={{ width: `${(enabledPillars / totalPillars) * 100}%` }}
              />
            </div>
            <span className="text-stonic-primary">{enabledPillars}/{totalPillars}</span>
          </div>
        </div>

        {/* Scrollable toggle sections */}
        <div className="flex-1 overflow-y-auto p-3 scrollbar-thin space-y-4">
          {pillarSections.map(section => {
            const sectionToggles = toggles.filter(t => t.pillar === section.name);
            const Icon = section.icon;
            const activeCount = sectionToggles.filter(t => t.on).length;
            return (
              <div key={section.name}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <Icon size={12} className={section.color} />
                  <span className="text-[10px] font-bold text-stonic-textDim uppercase tracking-wider">
                    {section.name}
                  </span>
                  <span className="text-[9px] text-stonic-textDim font-mono-tech ml-auto">
                    {activeCount}/{sectionToggles.length}
                  </span>
                </div>
                <div className="space-y-1">
                  {sectionToggles.map(t => (
                    <Toggle key={t.id} toggle={t} onToggle={handleToggle} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer status */}
        <div className="mt-auto p-3 border-t border-stonic-b1 space-y-1.5">
          <div className="text-[9px] text-stonic-textDim font-mono-tech flex justify-between">
            <span>Gateway</span>
            <span className={harnessBridge.isApiAvailable() ? 'text-emerald-400' : 'text-stonic-textDim'}>● {harnessBridge.isApiAvailable() ? 'online' : 'offline'}</span>
          </div>
          <div className="text-[9px] text-stonic-textDim font-mono-tech flex justify-between">
            <span>Missions</span>
            <span className="text-stonic-text">{activeMissions} active · {queuedMissions} queued</span>
          </div>
          <div className="text-[9px] text-stonic-textDim font-mono-tech flex justify-between">
            <span>Agents</span>
            <span className="text-stonic-text">{activeAgents} running</span>
          </div>
        </div>
      </aside>

      {/* Center — Elite Loop + Autonomy */}
      <main className="flex-1 flex flex-col min-w-0 gap-4 overflow-hidden">
        {/* Top row: Elite Loop + Autonomy */}
        <div className="flex gap-4 shrink-0 h-64">
          {/* Elite Loop visualization */}
          <div className="flex-1 bg-stonic-card border border-stonic-b1 rounded-xl flex flex-col overflow-hidden">
            <div className="h-10 px-4 border-b border-stonic-b1 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-stonic-primary" />
                <span className="text-sm font-semibold text-stonic-text">Elite Loop</span>
              </div>
              <span className="text-[10px] text-stonic-textDim font-mono-tech">Canonical execution flow</span>
            </div>
            <div className="flex-1 relative">
              <EliteLoopViz activePhase={loopPhase} />
            </div>
            {/* Loop phases strip */}
            <div className="h-8 px-3 border-t border-stonic-b1 flex items-center gap-1 overflow-x-auto scrollbar-thin">
              {eliteLoop.map((phase, i) => (
                <span
                  key={phase}
                  className={`text-[8px] font-mono-tech whitespace-nowrap px-1.5 py-0.5 rounded transition-all ${
                    i === loopPhase
                      ? 'bg-stonic-primary/20 text-stonic-primary'
                      : 'text-stonic-textDim'
                  }`}
                >
                  {phase}
                </span>
              ))}
            </div>
          </div>

          {/* Autonomy level selector */}
          <div className="w-72 bg-stonic-card border border-stonic-b1 rounded-xl flex flex-col overflow-hidden">
            <div className="h-10 px-4 border-b border-stonic-b1 flex items-center gap-2 shrink-0">
              <Gauge size={14} className="text-stonic-primary" />
              <span className="text-sm font-semibold text-stonic-text">Autonomy</span>
            </div>
            <div className="flex-1 p-3 space-y-1.5 overflow-y-auto scrollbar-thin">
              {autonomyLevels.map(l => (
                <button
                  key={l.level}
                  onClick={() => handleAutonomyChange(l.level)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                    autonomyLevel === l.level
                      ? 'bg-stonic-primary/10 border-stonic-primary/30'
                      : 'bg-stonic-surface/30 border-stonic-b1/50 hover:bg-stonic-hover/30'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold font-mono-tech w-4 ${
                      autonomyLevel === l.level ? 'text-stonic-primary' : 'text-stonic-textDim'
                    }`}>
                      L{l.level}
                    </span>
                    <span className={`text-[11px] font-medium ${
                      autonomyLevel === l.level ? 'text-stonic-text' : 'text-stonic-textMuted'
                    }`}>
                      {l.label}
                    </span>
                  </div>
                  <div className="text-[9px] text-stonic-textDim mt-0.5 pl-6">{l.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom row: System stats grid */}
        <div className="flex-1 grid grid-cols-4 gap-3 min-h-0 overflow-hidden">
          {/* Verification stats — from real mission task data */}
          <div className="bg-stonic-card border border-stonic-b1 rounded-xl p-3 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 size={12} className="text-emerald-400" />
              <span className="text-[10px] font-bold text-stonic-textDim uppercase tracking-wider">Verify</span>
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-stonic-textMuted">Tasks Done</span>
                <span className="text-emerald-400 font-mono-tech">{missions.reduce((s, m) => s + m.completed, 0)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-stonic-textMuted">Tasks Total</span>
                <span className="text-stonic-primary font-mono-tech">{missions.reduce((s, m) => s + m.tasks, 0)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-stonic-textMuted">Missions</span>
                <span className="text-stonic-primary font-mono-tech">{missions.length}</span>
              </div>
              <div className="h-1 bg-stonic-surface rounded-full mt-2">
                <div className="h-full bg-emerald-400/60 rounded-full transition-all"
                  style={{ width: `${verifyPassRate}%` }} />
              </div>
            </div>
          </div>

          {/* Recovery stats — from real agent data */}
          <div className="bg-stonic-card border border-stonic-b1 rounded-xl p-3 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <GitBranch size={12} className="text-amber-400" />
              <span className="text-[10px] font-bold text-stonic-textDim uppercase tracking-wider">Agents</span>
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-stonic-textMuted">Running</span>
                <span className="text-emerald-400 font-mono-tech">{agents.filter(a => a.state === 'running').length}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-stonic-textMuted">Idle</span>
                <span className="text-stonic-primary font-mono-tech">{agents.filter(a => a.state === 'idle').length}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-stonic-textMuted">Total</span>
                <span className="text-stonic-primary font-mono-tech">{agents.length}</span>
              </div>
              <div className="text-[9px] text-stonic-textDim mt-2">
                {workspaceStats ? `${workspaceStats.active} active workspaces` : 'No workspaces'}
              </div>
            </div>
          </div>

          {/* Learning stats — from real learning runtime */}
          <div className="bg-stonic-card border border-stonic-b1 rounded-xl p-3 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={12} className="text-stonic-accent" />
              <span className="text-[10px] font-bold text-stonic-textDim uppercase tracking-wider">Learn</span>
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-stonic-textMuted">Reflections</span>
                <span className="text-stonic-accent font-mono-tech">{learningStats?.reflections ?? 0}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-stonic-textMuted">Proposals</span>
                <span className="text-stonic-primary font-mono-tech">{learningStats?.proposals ?? 0}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-stonic-textMuted">KG Entities</span>
                <span className="text-emerald-400 font-mono-tech">{kgStats?.entities ?? 0}</span>
              </div>
              <div className="text-[9px] text-stonic-textDim mt-2">
                {kgStats ? `${kgStats.relationships} relationships` : 'Knowledge graph idle'}
              </div>
            </div>
          </div>

          {/* Event stats — from real audit feed */}
          <div className="bg-stonic-card border border-stonic-b1 rounded-xl p-3 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Radio size={12} className="text-stonic-primary" />
              <span className="text-[10px] font-bold text-stonic-textDim uppercase tracking-wider">Events</span>
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-stonic-textMuted">Audit Log</span>
                <span className="text-stonic-primary font-mono-tech">{audit.length}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-stonic-textMuted">Info</span>
                <span className="text-stonic-textMuted font-mono-tech">{audit.filter(a => a.level === 'info').length}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-stonic-textMuted">Warnings</span>
                <span className="text-amber-400 font-mono-tech">{audit.filter(a => a.level === 'warn').length}</span>
              </div>
              <div className="text-[9px] text-stonic-textDim mt-2">
                {audit.length > 0 ? `Last: ${audit[audit.length - 1]?.event?.slice(0, 40) ?? ''}` : 'No events yet'}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Right rail — Missions / Agents / Memory / Audit */}
      <aside className="w-80 shrink-0 bg-stonic-card border border-stonic-b1 rounded-xl flex flex-col overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-stonic-b1">
          {(['missions', 'agents', 'memory', 'audit'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setRightTab(tab)}
              className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
                rightTab === tab
                  ? 'text-stonic-primary border-b-2 border-stonic-primary bg-stonic-primary/5'
                  : 'text-stonic-textDim hover:text-stonic-text hover:bg-stonic-hover/30'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
          {/* Missions tab */}
          {rightTab === 'missions' && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-stonic-textDim uppercase tracking-wider mb-2">Active Missions</div>
              {missions.map(m => (
                <div key={m.id} className="p-2.5 rounded-lg bg-stonic-surface/40 border border-stonic-b1/50">
                  <div className="flex items-center gap-2 mb-1.5">
                    <StatusDot status={m.status} />
                    <span className="text-[10px] text-stonic-text font-medium truncate flex-1">{m.name}</span>
                    <MissionStatusBadge status={m.status} />
                  </div>
                  <div className="h-1 bg-stonic-surface rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        m.status === 'completed' ? 'bg-emerald-400' :
                        m.status === 'failed' ? 'bg-red-400' :
                        m.status === 'paused' ? 'bg-amber-400' :
                        'bg-stonic-primary'
                      }`}
                      style={{ width: `${m.progress * 100}%` }}
                    />
                  </div>
                  <div className="text-[9px] text-stonic-textDim font-mono-tech mt-1">
                    {m.completed}/{m.tasks} tasks · {Math.round(m.progress * 100)}%
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Agents tab */}
          {rightTab === 'agents' && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-stonic-textDim uppercase tracking-wider mb-2">Agent Roster</div>
              {agents.map(a => (
                <div key={a.id} className="p-2.5 rounded-lg bg-stonic-surface/40 border border-stonic-b1/50">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusDot status={a.state} />
                    <span className="text-[10px] text-stonic-text font-medium truncate flex-1">{a.name}</span>
                    <span className="text-[9px] text-stonic-textDim font-mono-tech uppercase">{a.role}</span>
                  </div>
                  <div className="text-[9px] text-stonic-textDim font-mono-tech pl-3.5">{a.model}</div>
                </div>
              ))}
              <div className="mt-3 p-2.5 rounded-lg bg-stonic-primary/5 border border-stonic-primary/10">
                <div className="text-[9px] text-stonic-textDim font-mono-tech flex justify-between">
                  <span>Coordination</span>
                  <span className="text-stonic-primary">Multi-agent ON</span>
                </div>
              </div>
            </div>
          )}

          {/* Memory tab */}
          {rightTab === 'memory' && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-stonic-textDim uppercase tracking-wider mb-2">DNA Memory</div>
              {memoryStats.map(s => (
                <div key={s.label} className="flex items-center justify-between p-2 rounded-lg bg-stonic-surface/40 border border-stonic-b1/50">
                  <div className="flex items-center gap-2">
                    <Database size={10} className="text-stonic-textDim" />
                    <span className="text-[10px] text-stonic-text">{s.label}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-stonic-primary font-mono-tech font-bold">{s.value}</div>
                    {s.sub && <div className="text-[8px] text-stonic-textDim">{s.sub}</div>}
                  </div>
                </div>
              ))}
              <div className="mt-3 p-2.5 rounded-lg bg-stonic-accent/5 border border-stonic-accent/10">
                <div className="flex items-center gap-2 mb-1">
                  <Layers size={10} className="text-stonic-accent" />
                  <span className="text-[10px] text-stonic-text font-medium">Knowledge Graph</span>
                </div>
                <div className="text-[9px] text-stonic-textDim font-mono-tech">{kgStats ? `${kgStats.entities} nodes · ${kgStats.relationships} edges` : '0 nodes · 0 edges'}</div>
              </div>
            </div>
          )}

          {/* Audit tab */}
          {rightTab === 'audit' && (
            <div className="space-y-1.5 font-mono-tech">
              <div className="text-[10px] font-bold text-stonic-textDim uppercase tracking-wider mb-2">Live Audit Feed</div>
              {audit.slice().reverse().map((entry, i) => (
                <div key={i} className="flex items-start gap-2 p-1.5 rounded hover:bg-stonic-surface/30 transition-colors">
                  <AuditIcon level={entry.level} />
                  <span className="text-[9px] text-stonic-textMuted whitespace-nowrap">{entry.time}</span>
                  <span className={`text-[9px] ${
                    entry.level === 'success' ? 'text-emerald-400' :
                    entry.level === 'warn' ? 'text-amber-400' :
                    entry.level === 'error' ? 'text-red-400' :
                    'text-stonic-textDim'
                  }`}>
                    {entry.event}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

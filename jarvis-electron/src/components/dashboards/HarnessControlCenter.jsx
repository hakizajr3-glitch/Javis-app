import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Activity,
  Cpu,
  Users,
  Brain,
  Zap,
  Terminal,
  Shield,
  Radio,
  Power,
  AlertCircle,
  CheckCircle2,
  Layers,
  GitBranch,
  Database,
  Sparkles,
  Gauge,
  CircleDot
} from "lucide-react";
import { harnessBridge } from "../../harnessBridge";
const initialToggles = [
  // AUTONOMY
  { id: "auto-missions", label: "Autonomous Missions", on: true, pillar: "AUTONOMY" },
  { id: "bg-exec", label: "Background Execution", on: true, pillar: "AUTONOMY" },
  { id: "proactive", label: "Proactive Intelligence", on: true, pillar: "AUTONOMY" },
  { id: "self-eval", label: "Self Evaluation", on: true, pillar: "AUTONOMY" },
  { id: "self-improve", label: "Self Improvement", on: false, pillar: "AUTONOMY" },
  // COMPUTER
  { id: "desktop", label: "Desktop Control", on: false, pillar: "COMPUTER" },
  { id: "browser", label: "Browser Control", on: false, pillar: "COMPUTER" },
  { id: "terminal", label: "Terminal", on: true, pillar: "COMPUTER" },
  { id: "vision", label: "Vision", on: false, pillar: "COMPUTER" },
  { id: "filesystem", label: "Filesystem", on: true, pillar: "COMPUTER" },
  { id: "mobile", label: "Mobile Devices", on: false, pillar: "COMPUTER" },
  { id: "remote", label: "Remote Devices", on: false, pillar: "COMPUTER" },
  // AGENTS
  { id: "multi-agent", label: "Multi-Agent Coordination", on: true, pillar: "AGENTS" },
  { id: "spawn", label: "Agent Spawning", on: true, pillar: "AGENTS" },
  { id: "delegate", label: "Agent Delegation", on: true, pillar: "AGENTS" },
  { id: "parallel", label: "Parallel Execution", on: true, pillar: "AGENTS" },
  { id: "reviews", label: "Agent Reviews", on: false, pillar: "AGENTS" },
  // INTELLIGENCE
  { id: "model-router", label: "Model Router", on: true, pillar: "INTELLIGENCE" },
  { id: "prog-tools", label: "Progressive Tools", on: true, pillar: "INTELLIGENCE" },
  { id: "deep-prog", label: "Deep Programmability", on: true, pillar: "INTELLIGENCE" },
  { id: "knowledge-graph", label: "Knowledge Graph", on: true, pillar: "INTELLIGENCE" },
  { id: "dna-memory", label: "DNA Memory", on: true, pillar: "INTELLIGENCE" },
  // EXECUTION
  { id: "task-graphs", label: "Task Graphs", on: true, pillar: "EXECUTION" },
  { id: "sandbox", label: "Sandboxing", on: true, pillar: "EXECUTION" },
  { id: "verification", label: "Verification", on: true, pillar: "EXECUTION" },
  { id: "recovery", label: "Recovery", on: true, pillar: "EXECUTION" },
  { id: "lifecycle", label: "Lifecycle Hooks", on: true, pillar: "EXECUTION" },
  { id: "events", label: "Event System", on: true, pillar: "EXECUTION" },
  // DEVELOPER
  { id: "sdk", label: "SDK", on: true, pillar: "DEVELOPER" },
  { id: "mcp", label: "MCP Gateway", on: false, pillar: "DEVELOPER" },
  { id: "api", label: "API", on: true, pillar: "DEVELOPER" },
  { id: "cli", label: "CLI", on: true, pillar: "DEVELOPER" }
];
const pillarSections = [
  { name: "AUTONOMY", icon: Shield, color: "text-stonic-primary" },
  { name: "COMPUTER", icon: Cpu, color: "text-stonic-accent" },
  { name: "AGENTS", icon: Users, color: "text-stonic-accent2" },
  { name: "INTELLIGENCE", icon: Brain, color: "text-stonic-primary" },
  { name: "EXECUTION", icon: Zap, color: "text-stonic-warning" },
  { name: "DEVELOPER", icon: Terminal, color: "text-stonic-textMuted" }
];
const autonomyLevels = [
  { level: 0, label: "Observe", desc: "Inspect and analyze only" },
  { level: 1, label: "Recommend", desc: "Propose actions" },
  { level: 2, label: "Execute Safe", desc: "Routine reversible work" },
  { level: 3, label: "Autonomous", desc: "Plan and execute missions" },
  { level: 4, label: "Self-Improve", desc: "Develop & test improvements" },
  { level: 5, label: "High-Impact", desc: "Requires explicit authorization" }
];
const eliteLoop = [
  "Perceive",
  "Context",
  "Reason",
  "Plan",
  "Policy",
  "Allocate",
  "Select Agent",
  "Select Tool",
  "Execute",
  "Observe",
  "Verify",
  "Detect Error",
  "Recover",
  "Validate",
  "Remember",
  "Reflect",
  "Update",
  "Next"
];
const initialMissions = [
  { id: "m1", name: "Deploy marketing site", status: "running", progress: 0.4, tasks: 5, completed: 2 },
  { id: "m2", name: "Research Claude release", status: "queued", progress: 0, tasks: 3, completed: 0 },
  { id: "m3", name: "Fix auth bug #142", status: "completed", progress: 1, tasks: 4, completed: 4 }
];
const initialAgents = [
  { id: "a1", name: "Browser Executor", role: "executor", state: "running", model: "claude-sonnet-4.5" },
  { id: "a2", name: "File Executor", role: "executor", state: "idle", model: "gpt-4o" },
  { id: "a3", name: "Shell Sandbox", role: "executor", state: "idle", model: "gemini-2.5-flash" },
  { id: "a4", name: "Planner", role: "planner", state: "running", model: "claude-sonnet-4.5" }
];
const initialMemoryStats = [
  { label: "Episodic", value: "1,247", sub: "records" },
  { label: "Semantic", value: "893", sub: "records" },
  { label: "Procedural", value: "156", sub: "skills" },
  { label: "Working", value: "12", sub: "active" },
  { label: "Reflective", value: "84", sub: "lessons" },
  { label: "DNA Agents", value: "4", sub: "profiles" }
];
const initialAudit = [
  { time: "10:42:01", event: "Mission started: deploy-marketing-site", level: "info" },
  { time: "10:42:03", event: "Task 2 completed: parse goal & entities", level: "success" },
  { time: "10:42:05", event: "Approval requested: vercel --prod", level: "warn" },
  { time: "10:42:07", event: "Browser agent navigating to vercel.com", level: "info" },
  { time: "10:42:09", event: "Verification passed: dashboard loaded", level: "success" },
  { time: "10:42:12", event: "Recovery triggered: token expired, refreshing", level: "warn" },
  { time: "10:42:15", event: "Task 3 running: deploy production build", level: "info" }
];
const Toggle = ({ toggle, onToggle }) => /* @__PURE__ */ React.createElement(
  "button",
  {
    onClick: () => onToggle(toggle.id),
    className: `w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all group
      ${toggle.on ? "bg-stonic-primary/10 border-stonic-primary/20 hover:bg-stonic-primary/15" : "bg-stonic-surface/40 border-stonic-b1/50 hover:bg-stonic-hover/30"}`
  },
  /* @__PURE__ */ React.createElement("span", { className: `text-[10px] font-medium tracking-wide ${toggle.on ? "text-stonic-text" : "text-stonic-textMuted"}` }, toggle.label),
  /* @__PURE__ */ React.createElement("div", { className: `w-7 h-3.5 rounded-full transition-all relative ${toggle.on ? "bg-stonic-primary/30" : "bg-stonic-surface"}` }, /* @__PURE__ */ React.createElement(
    "div",
    {
      className: `absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all ${toggle.on ? "left-3.5 bg-stonic-primary shadow-[0_0_6px_rgba(0,216,238,0.6)]" : "left-0.5 bg-stonic-textDim"}`
    }
  ))
);
const StatusDot = ({ status }) => {
  const colors = {
    running: "bg-stonic-primary animate-pulse",
    queued: "bg-stonic-textDim",
    paused: "bg-stonic-warning",
    completed: "bg-stonic-success",
    failed: "bg-stonic-error",
    idle: "bg-stonic-textDim"
  };
  return /* @__PURE__ */ React.createElement("span", { className: `inline-block w-1.5 h-1.5 rounded-full ${colors[status] || colors.idle}` });
};
const MissionStatusBadge = ({ status }) => {
  const styles = {
    running: "bg-stonic-primary/10 text-stonic-primary border-stonic-primary/20",
    queued: "bg-stonic-surface text-stonic-textDim border-stonic-b1",
    paused: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20"
  };
  return /* @__PURE__ */ React.createElement("span", { className: `px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase ${styles[status]}` }, status);
};
const AuditIcon = ({ level }) => {
  switch (level) {
    case "success":
      return /* @__PURE__ */ React.createElement(CheckCircle2, { size: 10, className: "text-emerald-400" });
    case "warn":
      return /* @__PURE__ */ React.createElement(AlertCircle, { size: 10, className: "text-amber-400" });
    case "error":
      return /* @__PURE__ */ React.createElement(AlertCircle, { size: 10, className: "text-red-400" });
    default:
      return /* @__PURE__ */ React.createElement(CircleDot, { size: 10, className: "text-stonic-textDim" });
  }
};
const EliteLoopViz = ({ activePhase }) => {
  const canvasRef = useRef(null);
  const animRef = useRef(0);
  const phaseRef = useRef(activePhase);
  phaseRef.current = activePhase;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      ctx.scale(2, 2);
    };
    resize();
    window.addEventListener("resize", resize);
    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.35;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0, 216, 238, 0.08)";
      ctx.lineWidth = 2;
      ctx.stroke();
      const phases = eliteLoop.length;
      for (let i = 0; i < phases; i++) {
        const angle = i / phases * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        const isActive = i === phaseRef.current;
        ctx.beginPath();
        ctx.arc(x, y, isActive ? 4 : 2, 0, Math.PI * 2);
        if (isActive) {
          ctx.fillStyle = "#00d8ee";
          ctx.shadowColor = "rgba(0, 216, 238, 0.8)";
          ctx.shadowBlur = 12;
        } else {
          ctx.fillStyle = "rgba(0, 216, 238, 0.3)";
          ctx.shadowBlur = 0;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      const activeAngle = phaseRef.current / phases * Math.PI * 2 - Math.PI / 2;
      const activeX = cx + Math.cos(activeAngle) * radius;
      const activeY = cy + Math.sin(activeAngle) * radius;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(activeX, activeY);
      ctx.strokeStyle = "rgba(0, 216, 238, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 400);
      ctx.beginPath();
      ctx.arc(cx, cy, 6 + pulse * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 216, 238, ${0.3 + pulse * 0.3})`;
      ctx.shadowColor = "rgba(0, 216, 238, 0.6)";
      ctx.shadowBlur = 15;
      ctx.fill();
      ctx.shadowBlur = 0;
      const orbitAngle = Date.now() / 2e3 * Math.PI * 2;
      const ox = cx + Math.cos(orbitAngle) * radius;
      const oy = cy + Math.sin(orbitAngle) * radius;
      ctx.beginPath();
      ctx.arc(ox, oy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#00f5d4";
      ctx.shadowColor = "rgba(0, 245, 212, 0.8)";
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
      animRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animRef.current);
    };
  }, []);
  return /* @__PURE__ */ React.createElement("div", { className: "relative w-full h-full" }, /* @__PURE__ */ React.createElement("canvas", { ref: canvasRef, className: "absolute inset-0 w-full h-full" }), /* @__PURE__ */ React.createElement("div", { className: "absolute inset-0 flex items-center justify-center pointer-events-none" }, /* @__PURE__ */ React.createElement("div", { className: "text-center" }, /* @__PURE__ */ React.createElement("div", { className: "text-[10px] text-stonic-primary font-mono-tech font-bold tracking-wider" }, eliteLoop[activePhase].toUpperCase()), /* @__PURE__ */ React.createElement("div", { className: "text-[8px] text-stonic-textDim font-mono-tech mt-0.5" }, "Phase ", activePhase + 1, "/", eliteLoop.length))));
};
const HarnessControlCenter = () => {
  const bridgeState = harnessBridge.getState();
  const [toggles, setToggles] = useState(
    initialToggles.map((t) => ({ ...t, on: bridgeState.toggles[t.id] ?? t.on }))
  );
  const [autonomyLevel, setAutonomyLevelState] = useState(bridgeState.autonomyLevel);
  const [missions] = useState(bridgeState.missions);
  const [agents] = useState(bridgeState.agents);
  const [memoryStats] = useState(bridgeState.memoryStats);
  const [audit, setAudit] = useState(bridgeState.audit);
  const [loopPhase, setLoopPhaseState] = useState(bridgeState.loopPhase);
  const [rightTab, setRightTab] = useState("missions");
  useEffect(() => {
    harnessBridge.startPolling();
    const unsub = harnessBridge.subscribe((state) => {
      setToggles((prev) => prev.map((t) => ({ ...t, on: state.toggles[t.id] ?? t.on })));
      setAutonomyLevelState(state.autonomyLevel);
      setLoopPhaseState(state.loopPhase);
      if (state.audit !== bridgeState.audit) {
        setAudit(state.audit);
      }
    });
    return () => {
      unsub();
      harnessBridge.stopPolling();
    };
  }, []);
  useEffect(() => {
    const interval = setInterval(() => {
      setLoopPhaseState((p) => {
        const next = (p + 1) % eliteLoop.length;
        harnessBridge.setLoopPhase(next);
        return next;
      });
    }, 2500);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const events = [
      { event: "Heartbeat: all systems nominal", level: "info" },
      { event: "Memory consolidation: 3 episodes merged", level: "success" },
      { event: "Verification passed: file written correctly", level: "success" },
      { event: "Pattern detected: repeated deploy workflow", level: "info" },
      { event: "Recovery: retrying with backoff (attempt 2)", level: "warn" }
    ];
    const interval = setInterval(() => {
      const e = events[Math.floor(Math.random() * events.length)];
      harnessBridge.addAudit(e.event, e.level);
    }, 5e3);
    return () => clearInterval(interval);
  }, []);
  const handleToggle = useCallback((id) => {
    setToggles((prev) => {
      const t = prev.find((x) => x.id === id);
      if (t) harnessBridge.toggle(id, !t.on);
      return prev.map((x) => x.id === id ? { ...x, on: !x.on } : x);
    });
  }, []);
  const handleAutonomyChange = useCallback((level) => {
    setAutonomyLevelState(level);
    harnessBridge.setAutonomy(level);
  }, []);
  const activeMissions = missions.filter((m) => m.status === "running").length;
  const queuedMissions = missions.filter((m) => m.status === "queued").length;
  const activeAgents = agents.filter((a) => a.state === "running").length;
  const enabledPillars = toggles.filter((t) => t.on).length;
  const totalPillars = toggles.length;
  return /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex gap-4 min-w-0 overflow-hidden" }, /* @__PURE__ */ React.createElement("aside", { className: "w-72 shrink-0 bg-stonic-card border border-stonic-b1 rounded-xl flex flex-col overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "p-4 border-b border-stonic-b1" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-3" }, /* @__PURE__ */ React.createElement("div", { className: "w-7 h-7 rounded-full bg-gradient-to-br from-stonic-primary to-stonic-accent shadow-[0_0_12px_rgba(0,216,238,0.35)] flex items-center justify-center" }, /* @__PURE__ */ React.createElement(Power, { size: 14, className: "text-stonic-dark" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "text-sm font-bold tracking-wide text-stonic-text" }, "Harness Control"), /* @__PURE__ */ React.createElement("div", { className: "text-[9px] text-stonic-textDim font-mono-tech" }, "12-Pillar Runtime"))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 text-[9px] font-mono-tech" }, /* @__PURE__ */ React.createElement("span", { className: "text-stonic-textDim" }, "Pillars"), /* @__PURE__ */ React.createElement("div", { className: "flex-1 h-1 bg-stonic-surface rounded-full overflow-hidden" }, /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "h-full bg-stonic-primary rounded-full transition-all",
      style: { width: `${enabledPillars / totalPillars * 100}%` }
    }
  )), /* @__PURE__ */ React.createElement("span", { className: "text-stonic-primary" }, enabledPillars, "/", totalPillars))), /* @__PURE__ */ React.createElement("div", { className: "flex-1 overflow-y-auto p-3 scrollbar-thin space-y-4" }, pillarSections.map((section) => {
    const sectionToggles = toggles.filter((t) => t.pillar === section.name);
    const Icon = section.icon;
    const activeCount = sectionToggles.filter((t) => t.on).length;
    return /* @__PURE__ */ React.createElement("div", { key: section.name }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-2 px-1" }, /* @__PURE__ */ React.createElement(Icon, { size: 12, className: section.color }), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-stonic-textDim uppercase tracking-wider" }, section.name), /* @__PURE__ */ React.createElement("span", { className: "text-[9px] text-stonic-textDim font-mono-tech ml-auto" }, activeCount, "/", sectionToggles.length)), /* @__PURE__ */ React.createElement("div", { className: "space-y-1" }, sectionToggles.map((t) => /* @__PURE__ */ React.createElement(Toggle, { key: t.id, toggle: t, onToggle: handleToggle }))));
  })), /* @__PURE__ */ React.createElement("div", { className: "mt-auto p-3 border-t border-stonic-b1 space-y-1.5" }, /* @__PURE__ */ React.createElement("div", { className: "text-[9px] text-stonic-textDim font-mono-tech flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, "Gateway"), /* @__PURE__ */ React.createElement("span", { className: "text-emerald-400" }, "\u25CF online")), /* @__PURE__ */ React.createElement("div", { className: "text-[9px] text-stonic-textDim font-mono-tech flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, "Missions"), /* @__PURE__ */ React.createElement("span", { className: "text-stonic-text" }, activeMissions, " active \xB7 ", queuedMissions, " queued")), /* @__PURE__ */ React.createElement("div", { className: "text-[9px] text-stonic-textDim font-mono-tech flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, "Agents"), /* @__PURE__ */ React.createElement("span", { className: "text-stonic-text" }, activeAgents, " running")))), /* @__PURE__ */ React.createElement("main", { className: "flex-1 flex flex-col min-w-0 gap-4 overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "flex gap-4 shrink-0 h-64" }, /* @__PURE__ */ React.createElement("div", { className: "flex-1 bg-stonic-card border border-stonic-b1 rounded-xl flex flex-col overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "h-10 px-4 border-b border-stonic-b1 flex items-center justify-between shrink-0" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement(Activity, { size: 14, className: "text-stonic-primary" }), /* @__PURE__ */ React.createElement("span", { className: "text-sm font-semibold text-stonic-text" }, "Elite Loop")), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-stonic-textDim font-mono-tech" }, "Canonical execution flow")), /* @__PURE__ */ React.createElement("div", { className: "flex-1 relative" }, /* @__PURE__ */ React.createElement(EliteLoopViz, { activePhase: loopPhase })), /* @__PURE__ */ React.createElement("div", { className: "h-8 px-3 border-t border-stonic-b1 flex items-center gap-1 overflow-x-auto scrollbar-thin" }, eliteLoop.map((phase, i) => /* @__PURE__ */ React.createElement(
    "span",
    {
      key: phase,
      className: `text-[8px] font-mono-tech whitespace-nowrap px-1.5 py-0.5 rounded transition-all ${i === loopPhase ? "bg-stonic-primary/20 text-stonic-primary" : "text-stonic-textDim"}`
    },
    phase
  )))), /* @__PURE__ */ React.createElement("div", { className: "w-72 bg-stonic-card border border-stonic-b1 rounded-xl flex flex-col overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "h-10 px-4 border-b border-stonic-b1 flex items-center gap-2 shrink-0" }, /* @__PURE__ */ React.createElement(Gauge, { size: 14, className: "text-stonic-primary" }), /* @__PURE__ */ React.createElement("span", { className: "text-sm font-semibold text-stonic-text" }, "Autonomy")), /* @__PURE__ */ React.createElement("div", { className: "flex-1 p-3 space-y-1.5 overflow-y-auto scrollbar-thin" }, autonomyLevels.map((l) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: l.level,
      onClick: () => handleAutonomyChange(l.level),
      className: `w-full text-left p-2.5 rounded-lg border transition-all ${autonomyLevel === l.level ? "bg-stonic-primary/10 border-stonic-primary/30" : "bg-stonic-surface/30 border-stonic-b1/50 hover:bg-stonic-hover/30"}`
    },
    /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", { className: `text-[10px] font-bold font-mono-tech w-4 ${autonomyLevel === l.level ? "text-stonic-primary" : "text-stonic-textDim"}` }, "L", l.level), /* @__PURE__ */ React.createElement("span", { className: `text-[11px] font-medium ${autonomyLevel === l.level ? "text-stonic-text" : "text-stonic-textMuted"}` }, l.label)),
    /* @__PURE__ */ React.createElement("div", { className: "text-[9px] text-stonic-textDim mt-0.5 pl-6" }, l.desc)
  ))))), /* @__PURE__ */ React.createElement("div", { className: "flex-1 grid grid-cols-4 gap-3 min-h-0 overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "bg-stonic-card border border-stonic-b1 rounded-xl p-3 flex flex-col" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-2" }, /* @__PURE__ */ React.createElement(CheckCircle2, { size: 12, className: "text-emerald-400" }), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-stonic-textDim uppercase tracking-wider" }, "Verify")), /* @__PURE__ */ React.createElement("div", { className: "space-y-1.5 flex-1" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between text-[10px]" }, /* @__PURE__ */ React.createElement("span", { className: "text-stonic-textMuted" }, "Passed"), /* @__PURE__ */ React.createElement("span", { className: "text-emerald-400 font-mono-tech" }, "847")), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between text-[10px]" }, /* @__PURE__ */ React.createElement("span", { className: "text-stonic-textMuted" }, "Failed"), /* @__PURE__ */ React.createElement("span", { className: "text-red-400 font-mono-tech" }, "23")), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between text-[10px]" }, /* @__PURE__ */ React.createElement("span", { className: "text-stonic-textMuted" }, "Pass Rate"), /* @__PURE__ */ React.createElement("span", { className: "text-stonic-primary font-mono-tech" }, "97.4%")), /* @__PURE__ */ React.createElement("div", { className: "h-1 bg-stonic-surface rounded-full mt-2" }, /* @__PURE__ */ React.createElement("div", { className: "h-full w-[97%] bg-emerald-400/60 rounded-full" })))), /* @__PURE__ */ React.createElement("div", { className: "bg-stonic-card border border-stonic-b1 rounded-xl p-3 flex flex-col" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-2" }, /* @__PURE__ */ React.createElement(GitBranch, { size: 12, className: "text-amber-400" }), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-stonic-textDim uppercase tracking-wider" }, "Recover")), /* @__PURE__ */ React.createElement("div", { className: "space-y-1.5 flex-1" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between text-[10px]" }, /* @__PURE__ */ React.createElement("span", { className: "text-stonic-textMuted" }, "Retries"), /* @__PURE__ */ React.createElement("span", { className: "text-amber-400 font-mono-tech" }, "31")), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between text-[10px]" }, /* @__PURE__ */ React.createElement("span", { className: "text-stonic-textMuted" }, "Replans"), /* @__PURE__ */ React.createElement("span", { className: "text-stonic-primary font-mono-tech" }, "7")), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between text-[10px]" }, /* @__PURE__ */ React.createElement("span", { className: "text-stonic-textMuted" }, "Escalations"), /* @__PURE__ */ React.createElement("span", { className: "text-red-400 font-mono-tech" }, "2")), /* @__PURE__ */ React.createElement("div", { className: "text-[9px] text-stonic-textDim mt-2" }, "Last: retry \u2192 success (2m ago)"))), /* @__PURE__ */ React.createElement("div", { className: "bg-stonic-card border border-stonic-b1 rounded-xl p-3 flex flex-col" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-2" }, /* @__PURE__ */ React.createElement(Sparkles, { size: 12, className: "text-stonic-accent" }), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-stonic-textDim uppercase tracking-wider" }, "Learn")), /* @__PURE__ */ React.createElement("div", { className: "space-y-1.5 flex-1" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between text-[10px]" }, /* @__PURE__ */ React.createElement("span", { className: "text-stonic-textMuted" }, "Reflections"), /* @__PURE__ */ React.createElement("span", { className: "text-stonic-accent font-mono-tech" }, "84")), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between text-[10px]" }, /* @__PURE__ */ React.createElement("span", { className: "text-stonic-textMuted" }, "Proposals"), /* @__PURE__ */ React.createElement("span", { className: "text-stonic-primary font-mono-tech" }, "12")), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between text-[10px]" }, /* @__PURE__ */ React.createElement("span", { className: "text-stonic-textMuted" }, "Deployed"), /* @__PURE__ */ React.createElement("span", { className: "text-emerald-400 font-mono-tech" }, "5")), /* @__PURE__ */ React.createElement("div", { className: "text-[9px] text-stonic-textDim mt-2" }, "Last lesson: prefer fast model for parsing"))), /* @__PURE__ */ React.createElement("div", { className: "bg-stonic-card border border-stonic-b1 rounded-xl p-3 flex flex-col" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-2" }, /* @__PURE__ */ React.createElement(Radio, { size: 12, className: "text-stonic-primary" }), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-stonic-textDim uppercase tracking-wider" }, "Events")), /* @__PURE__ */ React.createElement("div", { className: "space-y-1.5 flex-1" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between text-[10px]" }, /* @__PURE__ */ React.createElement("span", { className: "text-stonic-textMuted" }, "Triggers"), /* @__PURE__ */ React.createElement("span", { className: "text-stonic-primary font-mono-tech" }, "6")), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between text-[10px]" }, /* @__PURE__ */ React.createElement("span", { className: "text-stonic-textMuted" }, "Heartbeat"), /* @__PURE__ */ React.createElement("span", { className: "text-emerald-400 font-mono-tech" }, "\u25CF 2s")), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between text-[10px]" }, /* @__PURE__ */ React.createElement("span", { className: "text-stonic-textMuted" }, "Webhooks"), /* @__PURE__ */ React.createElement("span", { className: "text-stonic-textMuted font-mono-tech" }, "2")), /* @__PURE__ */ React.createElement("div", { className: "text-[9px] text-stonic-textDim mt-2" }, "Cron: daily report at 09:00"))))), /* @__PURE__ */ React.createElement("aside", { className: "w-80 shrink-0 bg-stonic-card border border-stonic-b1 rounded-xl flex flex-col overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "flex border-b border-stonic-b1" }, ["missions", "agents", "memory", "audit"].map((tab) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: tab,
      onClick: () => setRightTab(tab),
      className: `flex-1 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-all ${rightTab === tab ? "text-stonic-primary border-b-2 border-stonic-primary bg-stonic-primary/5" : "text-stonic-textDim hover:text-stonic-text hover:bg-stonic-hover/30"}`
    },
    tab
  ))), /* @__PURE__ */ React.createElement("div", { className: "flex-1 overflow-y-auto p-3 scrollbar-thin" }, rightTab === "missions" && /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, /* @__PURE__ */ React.createElement("div", { className: "text-[10px] font-bold text-stonic-textDim uppercase tracking-wider mb-2" }, "Active Missions"), missions.map((m) => /* @__PURE__ */ React.createElement("div", { key: m.id, className: "p-2.5 rounded-lg bg-stonic-surface/40 border border-stonic-b1/50" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-1.5" }, /* @__PURE__ */ React.createElement(StatusDot, { status: m.status }), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-stonic-text font-medium truncate flex-1" }, m.name), /* @__PURE__ */ React.createElement(MissionStatusBadge, { status: m.status })), /* @__PURE__ */ React.createElement("div", { className: "h-1 bg-stonic-surface rounded-full overflow-hidden" }, /* @__PURE__ */ React.createElement(
    "div",
    {
      className: `h-full rounded-full transition-all ${m.status === "completed" ? "bg-emerald-400" : m.status === "failed" ? "bg-red-400" : m.status === "paused" ? "bg-amber-400" : "bg-stonic-primary"}`,
      style: { width: `${m.progress * 100}%` }
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "text-[9px] text-stonic-textDim font-mono-tech mt-1" }, m.completed, "/", m.tasks, " tasks \xB7 ", Math.round(m.progress * 100), "%")))), rightTab === "agents" && /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, /* @__PURE__ */ React.createElement("div", { className: "text-[10px] font-bold text-stonic-textDim uppercase tracking-wider mb-2" }, "Agent Roster"), agents.map((a) => /* @__PURE__ */ React.createElement("div", { key: a.id, className: "p-2.5 rounded-lg bg-stonic-surface/40 border border-stonic-b1/50" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-1" }, /* @__PURE__ */ React.createElement(StatusDot, { status: a.state }), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-stonic-text font-medium truncate flex-1" }, a.name), /* @__PURE__ */ React.createElement("span", { className: "text-[9px] text-stonic-textDim font-mono-tech uppercase" }, a.role)), /* @__PURE__ */ React.createElement("div", { className: "text-[9px] text-stonic-textDim font-mono-tech pl-3.5" }, a.model))), /* @__PURE__ */ React.createElement("div", { className: "mt-3 p-2.5 rounded-lg bg-stonic-primary/5 border border-stonic-primary/10" }, /* @__PURE__ */ React.createElement("div", { className: "text-[9px] text-stonic-textDim font-mono-tech flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, "Coordination"), /* @__PURE__ */ React.createElement("span", { className: "text-stonic-primary" }, "Multi-agent ON")))), rightTab === "memory" && /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, /* @__PURE__ */ React.createElement("div", { className: "text-[10px] font-bold text-stonic-textDim uppercase tracking-wider mb-2" }, "DNA Memory"), memoryStats.map((s) => /* @__PURE__ */ React.createElement("div", { key: s.label, className: "flex items-center justify-between p-2 rounded-lg bg-stonic-surface/40 border border-stonic-b1/50" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement(Database, { size: 10, className: "text-stonic-textDim" }), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-stonic-text" }, s.label)), /* @__PURE__ */ React.createElement("div", { className: "text-right" }, /* @__PURE__ */ React.createElement("div", { className: "text-[11px] text-stonic-primary font-mono-tech font-bold" }, s.value), s.sub && /* @__PURE__ */ React.createElement("div", { className: "text-[8px] text-stonic-textDim" }, s.sub)))), /* @__PURE__ */ React.createElement("div", { className: "mt-3 p-2.5 rounded-lg bg-stonic-accent/5 border border-stonic-accent/10" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-1" }, /* @__PURE__ */ React.createElement(Layers, { size: 10, className: "text-stonic-accent" }), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-stonic-text font-medium" }, "Knowledge Graph")), /* @__PURE__ */ React.createElement("div", { className: "text-[9px] text-stonic-textDim font-mono-tech" }, "2,394 nodes \xB7 8,127 edges"))), rightTab === "audit" && /* @__PURE__ */ React.createElement("div", { className: "space-y-1.5 font-mono-tech" }, /* @__PURE__ */ React.createElement("div", { className: "text-[10px] font-bold text-stonic-textDim uppercase tracking-wider mb-2" }, "Live Audit Feed"), audit.slice().reverse().map((entry, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "flex items-start gap-2 p-1.5 rounded hover:bg-stonic-surface/30 transition-colors" }, /* @__PURE__ */ React.createElement(AuditIcon, { level: entry.level }), /* @__PURE__ */ React.createElement("span", { className: "text-[9px] text-stonic-textMuted whitespace-nowrap" }, entry.time), /* @__PURE__ */ React.createElement("span", { className: `text-[9px] ${entry.level === "success" ? "text-emerald-400" : entry.level === "warn" ? "text-amber-400" : entry.level === "error" ? "text-red-400" : "text-stonic-textDim"}` }, entry.event)))))));
};
export {
  HarnessControlCenter
};

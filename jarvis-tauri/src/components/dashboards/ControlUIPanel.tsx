import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Terminal, Send, Mic, MicOff, Video, Paperclip, Image, Gauge, MessageSquare,
} from 'lucide-react';
import { HarnessControlCenter } from './HarnessControlCenter';
import { conversationManager, Message as ConvMessage } from '../../conversationManager';
import { harnessBridge } from '../../harnessBridge';
import { jarvisRuntime, JarvisEvent } from '../../jarvisConversationRuntime';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  html?: boolean;
}

interface Task {
  id: string;
  title: string;
  status: 'done' | 'running' | 'blocked' | 'idle';
  agent?: string;
}

const statusBadge = (status: Task['status']) => {
  switch (status) {
    case 'done':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'running':
      return 'bg-stonic-primary/10 text-stonic-primary border-stonic-primary/20';
    case 'blocked':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    default:
      return 'bg-stonic-surface text-stonic-textDim border-stonic-b1';
  }
};

const sessions = [
  { id: 'deploy', name: '#deploy-site', model: 'GPT-4o' },
  { id: 'research', name: 'Research agent', model: 'Claude 3.7' },
  { id: 'codex', name: 'Codex harness', model: 'Gemini 1.5' },
];

const initialMessages: Message[] = [
  {
    id: '1',
    role: 'system',
    content: 'JARVIS Control UI online. Type or speak to command the harness.',
  },
];

// ─── Harness command parser ──────────────────────────────────────────────────
// Parses natural-language commands from the chat and translates them into
// harnessBridge calls (toggle pillars, set autonomy, etc.).

const PILLAR_KEYWORDS: Record<string, string> = {
  'auto missions': 'auto-missions', 'autonomous missions': 'auto-missions',
  'background exec': 'bg-exec', 'background execution': 'bg-exec',
  'proactive': 'proactive', 'proactive intelligence': 'proactive',
  'self eval': 'self-eval', 'self evaluation': 'self-eval',
  'self improve': 'self-improve', 'self improvement': 'self-improve',
  'desktop': 'desktop', 'desktop control': 'desktop',
  'browser': 'browser', 'browser control': 'browser',
  'terminal': 'terminal',
  'vision': 'vision',
  'filesystem': 'filesystem', 'file system': 'filesystem',
  'mobile': 'mobile', 'mobile devices': 'mobile',
  'remote': 'remote', 'remote devices': 'remote',
  'multi-agent': 'multi-agent', 'multi agent': 'multi-agent',
  'spawning': 'spawn', 'agent spawning': 'spawn',
  'delegation': 'delegate', 'agent delegation': 'delegate',
  'parallel': 'parallel', 'parallel execution': 'parallel',
  'agent reviews': 'reviews', 'reviews': 'reviews',
  'model router': 'model-router',
  'progressive tools': 'prog-tools',
  'deep prog': 'deep-prog', 'deep programmability': 'deep-prog',
  'knowledge graph': 'knowledge-graph',
  'dna memory': 'dna-memory',
  'task graphs': 'task-graphs', 'task graph': 'task-graphs',
  'sandboxing': 'sandbox', 'sandbox': 'sandbox',
  'verification': 'verification',
  'recovery': 'recovery',
  'lifecycle': 'lifecycle', 'lifecycle hooks': 'lifecycle',
  'event system': 'events', 'events': 'events',
  'sdk': 'sdk',
  'mcp': 'mcp', 'mcp gateway': 'mcp',
  'api': 'api',
  'cli': 'cli',
};

const AUTONOMY_KEYWORDS: Record<string, number> = {
  'l0': 0, 'level 0': 0, 'observe': 0,
  'l1': 1, 'level 1': 1, 'recommend': 1,
  'l2': 2, 'level 2': 2, 'execute safe': 2,
  'l3': 3, 'level 3': 3, 'autonomous': 3,
  'l4': 4, 'level 4': 4, 'self-improve': 4, 'self improve': 4,
  'l5': 5, 'level 5': 5, 'high-impact': 5,
};

function parseHarnessCommand(text: string): { action: string; pillar?: string; level?: number } | null {
  const lower = text.toLowerCase();

  // Toggle commands: "turn on browser", "enable terminal", "disable vision", "turn off sandbox"
  const toggleMatch = lower.match(/(?:turn on|enable|activate|start)\s+(.+)/);
  const offMatch = lower.match(/(?:turn off|disable|deactivate|stop)\s+(.+)/);

  if (toggleMatch || offMatch) {
    const keyword = (toggleMatch?.[1] || offMatch?.[1] || '').trim();
    const pillarId = PILLAR_KEYWORDS[keyword];
    if (pillarId) {
      return { action: 'toggle', pillar: pillarId };
    }
    // Try partial match
    for (const [k, v] of Object.entries(PILLAR_KEYWORDS)) {
      if (keyword.includes(k)) {
        return { action: 'toggle', pillar: v };
      }
    }
  }

  // Autonomy commands: "set autonomy to level 3", "autonomy l4", "set level 2"
  const autoMatch = lower.match(/(?:set\s+)?autonomy\s+(?:to\s+)?(?:level\s+)?(.+)/);
  const levelMatch = lower.match(/(?:set\s+)?level\s+(\d)/);
  if (autoMatch) {
    const kw = autoMatch[1].trim();
    if (AUTONOMY_KEYWORDS[kw] !== undefined) {
      return { action: 'autonomy', level: AUTONOMY_KEYWORDS[kw] };
    }
  }
  if (levelMatch) {
    const lvl = parseInt(levelMatch[1]);
    if (lvl >= 0 && lvl <= 5) {
      return { action: 'autonomy', level: lvl };
    }
  }

  // Show harness / open harness control
  if (lower.match(/(?:show|open|view|switch to)\s+(?:the\s+)?harness/)) {
    return { action: 'show-harness' };
  }

  return null;
}

export const ControlUIPanel: React.FC = () => {
  const [viewMode, setViewMode] = useState<'chat' | 'harness'>('chat');
  const [activeTab, setActiveTab] = useState('tasks');
  const [activeSession, setActiveSession] = useState('deploy');
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [harnessState, setHarnessState] = useState(harnessBridge.getState());
  const [runtimeEvents, setRuntimeEvents] = useState<JarvisEvent[]>([]);
  const [eventCounts, setEventCounts] = useState({ user: 0, jarvis: 0, tool: 0, error: 0, mission: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const streamingRef = useRef<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // ─── Sync messages from conversationManager ────────────────────────────────
  useEffect(() => {
    conversationManager.setCallbacks({
      onMessage: (msg: ConvMessage) => {
        setMessages(prev => {
          // Avoid duplicates
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, {
            id: msg.id,
            role: msg.role,
            content: msg.content,
          }];
        });
        setIsProcessing(false);
      },
      onStreamToken: (token: string) => {
        // Accumulate streaming tokens into the last assistant message
        streamingRef.current += token;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.id === 'streaming') {
            return [...prev.slice(0, -1), { ...last, content: streamingRef.current }];
          }
          return [...prev, { id: 'streaming', role: 'assistant', content: streamingRef.current }];
        });
      },
      onStateChange: (state: string) => {
        setIsProcessing(state === 'thinking' || state === 'executing' || state === 'speaking');
      },
      onError: (error: string) => {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'system',
          content: `Error: ${error}`,
        }]);
        setIsProcessing(false);
      },
      onTranscript: (text: string, isFinal: boolean) => {
        if (isFinal) {
          setInput('');
        } else {
          setInput(text);
        }
      },
    });

    // Start harness bridge polling for live state
    harnessBridge.startPolling();
    const unsub = harnessBridge.subscribe((state) => setHarnessState(state));

    // Subscribe to JARVIS runtime events for live telemetry + chat display
    const unsubRuntime = jarvisRuntime.subscribe((evt: JarvisEvent) => {
      setRuntimeEvents(prev => [...prev.slice(-100), evt]);
      setEventCounts(prev => ({
        ...prev,
        [evt.source]: (prev as any)[evt.source] + 1,
      }));
      // Show JARVIS/tool/error responses in the chat
      if (evt.source === 'jarvis' || evt.source === 'tool' || evt.source === 'error') {
        if (evt.event && evt.event !== 'Thinking...') {
          setMessages(prev => [...prev, {
            id: evt.id,
            role: 'assistant' as const,
            content: evt.event,
          }]);
        }
      }
    });

    return () => {
      unsub();
      unsubRuntime();
      harnessBridge.stopPolling();
      // Stop voice recognition if active
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
        recognitionRef.current = null;
      }
    };
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ─── Handle sending a message ──────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isProcessing) return;

    // Add user message immediately
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    streamingRef.current = '';
    setIsProcessing(true);

    // Check if this is a harness command
    const cmd = parseHarnessCommand(text);
    if (cmd) {
      if (cmd.action === 'toggle' && cmd.pillar) {
        const current = harnessBridge.getState().toggles[cmd.pillar];
        const newState = !current;
        await harnessBridge.toggle(cmd.pillar, newState);
        const pillarName = cmd.pillar.replace(/-/g, ' ');
        const reply: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `${newState ? 'Enabled' : 'Disabled'} ${pillarName}. The harness pillar is now ${newState ? 'active' : 'off'}.`,
        };
        setMessages(prev => [...prev, reply]);
        await harnessBridge.addAudit(`Pillar "${cmd.pillar}" ${newState ? 'enabled' : 'disabled'} via chat`, 'info');
        setIsProcessing(false);
        return;
      }
      if (cmd.action === 'autonomy' && cmd.level !== undefined) {
        await harnessBridge.setAutonomy(cmd.level);
        const labels = ['Observe', 'Recommend', 'Execute Safe', 'Autonomous', 'Self-Improve', 'High-Impact'];
        const reply: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Autonomy level set to L${cmd.level} (${labels[cmd.level]}). The harness will now operate at this level.`,
        };
        setMessages(prev => [...prev, reply]);
        await harnessBridge.addAudit(`Autonomy set to L${cmd.level} via chat`, 'info');
        setIsProcessing(false);
        return;
      }
      if (cmd.action === 'show-harness') {
        setViewMode('harness');
        const reply: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Switching to Harness Control view. You can see all 12 pillars and their status.',
        };
        setMessages(prev => [...prev, reply]);
        setIsProcessing(false);
        return;
      }
    }

    // Not a harness command — route through JARVIS Conversation Runtime
    // (parses intent, executes real commands via Tauri, falls through to AI)
    try {
      const response = await jarvisRuntime.processInput(text, false);
      if (response === 'SWITCH_TO_HARNESS') {
        setViewMode('harness');
      }
      // If the runtime returned a non-empty response (command result), show it
      if (response && response !== 'SWITCH_TO_HARNESS') {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response,
        }]);
      }
      // If response is empty, it was sent to AI — conversationManager callback handles it
      setIsProcessing(false);
    } catch (e: any) {
      const reply: Message = {
        id: (Date.now() + 1).toString(),
        role: 'system',
        content: `Failed to reach JARVIS: ${e?.message || 'Unknown error'}`,
      };
      setMessages(prev => [...prev, reply]);
      setIsProcessing(false);
    }
  }, [input, isProcessing]);

  // ─── Voice input (speech recognition) ──────────────────────────────────────
  const toggleVoice = useCallback(() => {
    if (isListening) {
      // Stop listening
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
        recognitionRef.current = null;
      }
      setIsListening(false);
      // If we have accumulated text, send it
      if (input.trim()) {
        handleSend();
      }
      return;
    }

    // Start listening
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: 'Speech recognition not available in this browser. Use text input instead.',
      }]);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);

      // If final result, auto-send
      if (event.results[event.results.length - 1].isFinal) {
        const finalText = transcript.trim();
        if (finalText) {
          // Small delay so the user sees the final text before it sends
          setTimeout(() => {
            setInput(finalText);
            // Trigger send directly
            const userMsg: Message = { id: Date.now().toString(), role: 'user', content: finalText };
            setMessages(prev => [...prev, userMsg]);
            setInput('');
            streamingRef.current = '';
            setIsProcessing(true);

            const cmd = parseHarnessCommand(finalText);
            if (cmd) {
              // Handle harness command from voice
              (async () => {
                if (cmd.action === 'toggle' && cmd.pillar) {
                  const current = harnessBridge.getState().toggles[cmd.pillar];
                  const newState = !current;
                  await harnessBridge.toggle(cmd.pillar, newState);
                  const pillarName = cmd.pillar.replace(/-/g, ' ');
                  setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: `${newState ? 'Enabled' : 'Disabled'} ${pillarName}.`,
                  }]);
                  await harnessBridge.addAudit(`Pillar "${cmd.pillar}" ${newState ? 'enabled' : 'disabled'} via voice`, 'info');
                } else if (cmd.action === 'autonomy' && cmd.level !== undefined) {
                  await harnessBridge.setAutonomy(cmd.level);
                  const labels = ['Observe', 'Recommend', 'Execute Safe', 'Autonomous', 'Self-Improve', 'High-Impact'];
                  setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: `Autonomy set to L${cmd.level!} (${labels[cmd.level!] || 'Unknown'}).`,
                  }]);
                  await harnessBridge.addAudit(`Autonomy set to L${cmd.level} via voice`, 'info');
                } else if (cmd.action === 'show-harness') {
                  setViewMode('harness');
                }
                setIsProcessing(false);
              })();
            } else {
              // Send to AI
              conversationManager.sendMessage(finalText).catch((e: any) => {
                setMessages(prev => [...prev, {
                  id: (Date.now() + 1).toString(),
                  role: 'system',
                  content: `Failed to reach JARVIS: ${e?.message || 'Unknown error'}`,
                }]);
                setIsProcessing(false);
              });
            }
          }, 300);
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.error('[ControlUI] Speech recognition error:', event.error);
      setIsListening(false);
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'system',
          content: `Voice input error: ${event.error}`,
        }]);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  }, [isListening, input, handleSend]);

  const session = sessions.find(s => s.id === activeSession) || sessions[0];

  // ─── Live tasks/agents/audit from harness state ────────────────────────────
  const liveTasks: Task[] = harnessState.missions.map((m: any) => ({
    id: m.id,
    title: m.name,
    status: m.status === 'completed' ? 'done' : m.status === 'running' ? 'running' : m.status === 'queued' ? 'idle' : 'blocked',
  }));

  const liveAgents = harnessState.agents.map((a: any) => ({
    name: a.name,
    state: a.state,
  }));

  const liveAudit = harnessState.audit.slice(-10).reverse();

  // Harness Control Center view — the 12-pillar runtime dashboard
  if (viewMode === 'harness') {
    return (
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* View toggle bar */}
        <div className="flex items-center gap-1 mb-3 shrink-0">
          <ViewToggleButton
            active={false}
            onClick={() => setViewMode('chat')}
            icon={<MessageSquare size={12} />}
            label="Chat"
          />
          <ViewToggleButton
            active={true}
            onClick={() => setViewMode('harness')}
            icon={<Gauge size={12} />}
            label="Harness Control"
          />
        </div>
        <HarnessControlCenter />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* View toggle bar */}
      <div className="flex items-center gap-1 mb-3 shrink-0">
        <ViewToggleButton
          active={true}
          onClick={() => setViewMode('chat')}
          icon={<MessageSquare size={12} />}
          label="Chat"
        />
        <ViewToggleButton
          active={false}
          onClick={() => setViewMode('harness')}
          icon={<Gauge size={12} />}
          label="Harness Control"
        />
      </div>
      <div className="flex-1 flex gap-4 min-w-0 overflow-hidden">
      {/* Live telemetry strip */}
      <div className="absolute top-16 left-64 right-72 h-7 flex items-center gap-4 px-3 text-[9px] font-mono-tech text-stonic-textDim bg-stonic-surface/60 border-b border-stonic-b1/50 backdrop-blur-sm rounded-b-lg z-10">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-400">RUNTIME LIVE</span>
        </span>
        <span>│</span>
        <span>USER: <span className="text-stonic-primary">{eventCounts.user}</span></span>
        <span>JARVIS: <span className="text-stonic-primary">{eventCounts.jarvis}</span></span>
        <span>TOOLS: <span className="text-stonic-primary">{eventCounts.tool}</span></span>
        <span>ERRORS: <span className={eventCounts.error > 0 ? 'text-red-400' : 'text-stonic-textDim'}>{eventCounts.error}</span></span>
        <span>│</span>
        <span>MISSIONS: <span className="text-stonic-primary">{harnessState.missions.filter((m: any) => m.status === 'running').length}</span> running</span>
        <span>AGENTS: <span className="text-stonic-primary">{harnessState.agents.filter((a: any) => a.state === 'running').length}</span> active</span>
        <span>│</span>
        <span>AUTONOMY: <span className="text-stonic-primary">L{harnessState.autonomyLevel}</span></span>
        <span>PILLARS: <span className="text-stonic-primary">{Object.values(harnessState.toggles).filter(Boolean).length}</span>/{Object.keys(harnessState.toggles).length}</span>
        <div className="flex-1" />
        <span className="text-stonic-textMuted">{runtimeEvents.length} events</span>
      </div>
      {/* Left rail */}
      <aside className="w-64 shrink-0 bg-stonic-card border border-stonic-b1 rounded-xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-stonic-b1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-stonic-primary to-stonic-accent shadow-[0_0_12px_rgba(34,211,238,0.35)]" />
            <span className="text-sm font-bold tracking-wide text-stonic-text">Control UI</span>
          </div>
        </div>

        <div className="p-3">
          <div className="text-[10px] font-bold text-stonic-textDim uppercase tracking-wider mb-2 px-2">Work / Agents</div>
          <div className="space-y-1">
            {sessions.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSession(s.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all text-left
                  ${activeSession === s.id
                    ? 'bg-stonic-primary/10 text-stonic-primary border border-stonic-primary/20'
                    : 'text-stonic-textMuted hover:bg-stonic-hover/50 hover:text-stonic-text'
                  }`}
              >
                <Terminal size={14} />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{s.name}</div>
                  <div className="text-[9px] text-stonic-textDim truncate">{s.model}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto p-3 border-t border-stonic-b1 space-y-2">
          <div className="text-[9px] text-stonic-textDim font-mono-tech flex justify-between">
            <span>Gateway</span><span className="text-emerald-400">● online</span>
          </div>
          <div className="text-[9px] text-stonic-textDim font-mono-tech flex justify-between">
            <span>Agents</span><span>{liveAgents.filter(a => a.state === 'running').length} active</span>
          </div>
        </div>
      </aside>

      {/* Center chat */}
      <main className="flex-1 flex flex-col min-w-0 bg-stonic-card border border-stonic-b1 rounded-xl overflow-hidden">
        <div className="h-12 px-4 border-b border-stonic-b1 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-stonic-text">{session.name}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-stonic-surface text-stonic-textDim border border-stonic-b1">
              {session.model}
            </span>
            {isProcessing && (
              <span className="flex items-center gap-1.5 text-[10px] text-stonic-primary font-mono-tech">
                <span className="w-1.5 h-1.5 rounded-full bg-stonic-primary animate-pulse" />
                {isListening ? 'LISTENING' : 'THINKING'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-stonic-textDim font-mono-tech">Context {Math.min(messages.length * 5, 100)}%</span>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className="text-[9px] text-stonic-textDim uppercase tracking-wider font-mono-tech">
                {msg.role === 'user' ? 'You' : msg.role === 'system' ? 'System' : 'JARVIS'} · now
              </div>
              <div
                className={`max-w-[90%] p-3 rounded-lg text-[11px] leading-relaxed font-mono-tech border whitespace-pre-line
                  ${msg.role === 'user'
                    ? 'bg-stonic-primary/10 border-stonic-primary/20 text-stonic-text rounded-br-sm'
                    : msg.role === 'system'
                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-200 rounded-bl-sm'
                      : 'bg-stonic-surface border-stonic-b1 text-stonic-text rounded-bl-sm'
                  }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-stonic-b1 bg-stonic-surface/30 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={async (e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                  const names = Array.from(files).map(f => f.name);
                  const msg = `I've attached ${files.length} file${files.length > 1 ? 's' : ''}: ${names.join(', ')}. Please analyze ${files.length > 1 ? 'them' : 'it'}.`;
                  setInput(msg);
                  setTimeout(() => handleSend(), 50);
                }
                e.target.value = '';
              }}
            />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                  const names = Array.from(files).map(f => f.name);
                  const msg = `I've attached an image: ${names.join(', ')}. Please analyze it.`;
                  setInput(msg);
                  setTimeout(() => handleSend(), 50);
                }
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-md text-stonic-textDim hover:text-stonic-text hover:bg-stonic-hover transition-colors cursor-pointer"
              title="Attach files"
            >
              <Paperclip size={14} />
            </button>
            <button
              onClick={() => imageInputRef.current?.click()}
              className="p-1.5 rounded-md text-stonic-textDim hover:text-stonic-text hover:bg-stonic-hover transition-colors cursor-pointer"
              title="Attach image"
            >
              <Image size={14} />
            </button>
            <div className="flex-1" />
            <button
              onClick={toggleVoice}
              className={`p-1.5 rounded-md transition-colors ${isListening
                ? 'text-red-400 bg-red-500/10 animate-pulse'
                : 'text-stonic-textDim hover:text-stonic-primary hover:bg-stonic-primary/10'
              }`}
            >
              {isListening ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
            <button
              onClick={async () => {
                try {
                  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                  // Stop the stream immediately — this is a capability check
                  stream.getTracks().forEach(t => t.stop());
                  setInput('Activate vision mode — analyze what you can see on screen.');
                  setTimeout(() => handleSend(), 50);
                } catch {
                  setInput('Vision mode requires camera access. Please grant camera permissions.');
                  setTimeout(() => handleSend(), 50);
                }
              }}
              className="p-1.5 rounded-md text-stonic-textDim hover:text-stonic-primary hover:bg-stonic-primary/10 transition-colors cursor-pointer"
              title="Activate vision mode"
            >
              <Video size={14} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder={isListening ? 'Listening...' : 'Type a command or ask JARVIS...'}
              disabled={isProcessing && !isListening}
              className="flex-1 bg-stonic-surface/50 border border-stonic-b1 rounded-lg px-3 py-2 text-xs text-stonic-text font-mono-tech
                         placeholder:text-stonic-textDim focus:outline-none focus:border-stonic-primary/50 transition-all
                         disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isProcessing}
              className="p-2 rounded-lg bg-stonic-primary/10 border border-stonic-primary/30 text-stonic-primary hover:bg-stonic-primary/20
                         disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </main>

      {/* Right rail */}
      <aside className="w-72 shrink-0 bg-stonic-card border border-stonic-b1 rounded-xl flex flex-col overflow-hidden">
        <div className="flex border-b border-stonic-b1">
          {['tasks', 'agents', 'audit'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-all
                ${activeTab === tab
                  ? 'text-stonic-primary border-b-2 border-stonic-primary bg-stonic-primary/5'
                  : 'text-stonic-textDim hover:text-stonic-text hover:bg-stonic-hover/30'
                }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
          {activeTab === 'tasks' && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-stonic-textDim uppercase tracking-wider mb-2">Current Run</div>
              {liveTasks.length > 0 ? liveTasks.map(task => (
                <div key={task.id} className="flex items-center gap-2 p-2 rounded-lg bg-stonic-surface/40 border border-stonic-b1/50">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${statusBadge(task.status)}`}>
                    {task.status}
                  </span>
                  <span className="text-[10px] text-stonic-text truncate flex-1">{task.title}</span>
                </div>
              )) : (
                <div className="text-[10px] text-stonic-textDim font-mono-tech">No active missions</div>
              )}
              <div className="mt-4 text-[10px] font-bold text-stonic-textDim uppercase tracking-wider">Progress</div>
              <div className="h-1.5 bg-stonic-surface rounded-full overflow-hidden mt-2">
                <div className="h-full bg-stonic-primary rounded-full transition-all" style={{
                  width: `${liveTasks.length > 0 ? (liveTasks.filter(t => t.status === 'done').length / liveTasks.length * 100) : 0}%`
                }} />
              </div>
              <div className="text-[9px] text-stonic-textDim font-mono-tech mt-1">
                {liveTasks.filter(t => t.status === 'done').length} of {liveTasks.length} missions complete
              </div>
            </div>
          )}

          {activeTab === 'agents' && (
            <div className="space-y-2">
              {liveAgents.map((a, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-stonic-surface/40 border border-stonic-b1/50">
                  <span className="text-[10px] text-stonic-text">{a.name}</span>
                  <span className={`text-[9px] font-mono-tech ${a.state === 'running' ? 'text-stonic-primary' : 'text-stonic-textDim'}`}>
                    ● {a.state}
                  </span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-1.5 font-mono-tech">
              {/* Live runtime events from conversation/execution */}
              {runtimeEvents.slice(-15).reverse().map((evt) => (
                <div key={evt.id} className="text-[9px] flex gap-2 items-start">
                  <span className="text-stonic-textMuted shrink-0">{evt.time}</span>
                  <span className={`shrink-0 uppercase font-bold ${
                    evt.source === 'user' ? 'text-stonic-primary' :
                    evt.source === 'jarvis' ? 'text-cyan-400' :
                    evt.source === 'tool' ? 'text-blue-400' :
                    evt.source === 'error' ? 'text-red-400' :
                    evt.source === 'mission' ? 'text-purple-400' :
                    'text-stonic-textDim'
                  }`}>[{evt.source}]</span>
                  <span className={
                    evt.level === 'success' ? 'text-emerald-400' :
                    evt.level === 'warn' ? 'text-amber-400' :
                    evt.level === 'error' ? 'text-red-400' :
                    'text-stonic-text'
                  }>
                    {evt.event}
                  </span>
                </div>
              ))}
              {/* Divider */}
              {runtimeEvents.length > 0 && liveAudit.length > 0 && (
                <div className="text-[8px] text-stonic-textMuted text-center my-1">─ harness audit ─</div>
              )}
              {/* Harness audit log */}
              {liveAudit.map((entry, i) => (
                <div key={`h${i}`} className="text-[9px] text-stonic-textDim flex gap-2">
                  <span className="text-stonic-textMuted">{entry.time}</span>
                  <span className={
                    entry.level === 'success' ? 'text-emerald-400' :
                    entry.level === 'warn' ? 'text-amber-400' :
                    entry.level === 'error' ? 'text-red-400' :
                    'text-stonic-primary'
                  }>
                    {entry.event}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
      </div>
    </div>
  );
};

// ─── View Toggle Button ──────────────────────────────────────────────────────

const ViewToggleButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium tracking-wide transition-all border ${
      active
        ? 'bg-stonic-primary/10 text-stonic-primary border-stonic-primary/20'
        : 'bg-stonic-card text-stonic-textMuted border-stonic-b1 hover:text-stonic-text hover:bg-stonic-hover/30'
    }`}
  >
    {icon}
    {label}
  </button>
);

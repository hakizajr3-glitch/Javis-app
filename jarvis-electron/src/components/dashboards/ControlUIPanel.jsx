import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, Gauge, Terminal, Send, Mic, MicOff, Video, Paperclip, Image as ImageIcon } from 'lucide-react';
import { HarnessControlCenter } from './HarnessControlCenter';
import { conversationManager } from '../../conversationManager';
import { harnessBridge } from '../../harnessBridge';

// ─── Sessions ────────────────────────────────────────────────────────────────

const sessions = [
  { id: 'deploy', name: '#deploy-site', model: 'GPT-4o' },
  { id: 'research', name: 'Research agent', model: 'Claude 3.7' },
  { id: 'codex', name: 'Codex harness', model: 'Gemini 1.5' },
];

const initialMessages = [
  { id: '1', role: 'system', content: 'JARVIS Control UI online. Type or speak to command the harness.' },
];

const statusBadge = (status) => {
  switch (status) {
    case 'done': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'running': return 'bg-stonic-primary/10 text-stonic-primary border-stonic-primary/20';
    case 'blocked': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    default: return 'bg-stonic-surface text-stonic-textDim border-stonic-b1';
  }
};

// ─── Harness command parser ──────────────────────────────────────────────────

const PILLAR_KEYWORDS = {
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

const AUTONOMY_KEYWORDS = {
  'l0': 0, 'level 0': 0, 'observe': 0,
  'l1': 1, 'level 1': 1, 'recommend': 1,
  'l2': 2, 'level 2': 2, 'execute safe': 2,
  'l3': 3, 'level 3': 3, 'autonomous': 3,
  'l4': 4, 'level 4': 4, 'self-improve': 4, 'self improve': 4,
  'l5': 5, 'level 5': 5, 'high-impact': 5,
};

function parseHarnessCommand(text) {
  const lower = text.toLowerCase();

  const toggleMatch = lower.match(/(?:turn on|enable|activate|start)\s+(.+)/);
  const offMatch = lower.match(/(?:turn off|disable|deactivate|stop)\s+(.+)/);

  if (toggleMatch || offMatch) {
    const keyword = (toggleMatch?.[1] || offMatch?.[1] || '').trim();
    const pillarId = PILLAR_KEYWORDS[keyword];
    if (pillarId) return { action: 'toggle', pillar: pillarId };
    for (const [k, v] of Object.entries(PILLAR_KEYWORDS)) {
      if (keyword.includes(k)) return { action: 'toggle', pillar: v };
    }
  }

  const autoMatch = lower.match(/(?:set\s+)?autonomy\s+(?:to\s+)?(?:level\s+)?(.+)/);
  const levelMatch = lower.match(/(?:set\s+)?level\s+(\d)/);
  if (autoMatch) {
    const kw = autoMatch[1].trim();
    if (AUTONOMY_KEYWORDS[kw] !== undefined) return { action: 'autonomy', level: AUTONOMY_KEYWORDS[kw] };
  }
  if (levelMatch) {
    const lvl = parseInt(levelMatch[1]);
    if (lvl >= 0 && lvl <= 5) return { action: 'autonomy', level: lvl };
  }

  if (lower.match(/(?:show|open|view|switch to)\s+(?:the\s+)?harness/)) {
    return { action: 'show-harness' };
  }

  return null;
}

// ─── Chat View ────────────────────────────────────────────────────────────────

const ChatView = ({ onSwitchToHarness }) => {
  const [activeTab, setActiveTab] = useState('tasks');
  const [activeSession, setActiveSession] = useState('deploy');
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [harnessState, setHarnessState] = useState(harnessBridge.getState());
  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);
  const streamingRef = useRef('');

  useEffect(() => {
    conversationManager.setCallbacks({
      onMessage: (msg) => {
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, { id: msg.id, role: msg.role, content: msg.content }];
        });
        setIsProcessing(false);
      },
      onStreamToken: (token) => {
        streamingRef.current += token;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.id === 'streaming') {
            return [...prev.slice(0, -1), { ...last, content: streamingRef.current }];
          }
          return [...prev, { id: 'streaming', role: 'assistant', content: streamingRef.current }];
        });
      },
      onStateChange: (state) => {
        setIsProcessing(state === 'thinking' || state === 'executing' || state === 'speaking');
      },
      onError: (error) => {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', content: `Error: ${error}` }]);
        setIsProcessing(false);
      },
      onTranscript: (text, isFinal) => {
        if (isFinal) setInput('');
        else setInput(text);
      },
    });

    harnessBridge.startPolling();
    const unsub = harnessBridge.subscribe((state) => setHarnessState(state));

    return () => {
      unsub();
      harnessBridge.stopPolling();
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
        recognitionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isProcessing) return;

    const userMsg = { id: Date.now().toString(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    streamingRef.current = '';
    setIsProcessing(true);

    const cmd = parseHarnessCommand(text);
    if (cmd) {
      if (cmd.action === 'toggle' && cmd.pillar) {
        const current = harnessBridge.getState().toggles[cmd.pillar];
        const newState = !current;
        await harnessBridge.toggle(cmd.pillar, newState);
        const pillarName = cmd.pillar.replace(/-/g, ' ');
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(), role: 'assistant',
          content: `${newState ? 'Enabled' : 'Disabled'} ${pillarName}. The harness pillar is now ${newState ? 'active' : 'off'}.`,
        }]);
        await harnessBridge.addAudit(`Pillar "${cmd.pillar}" ${newState ? 'enabled' : 'disabled'} via chat`, 'info');
        setIsProcessing(false);
        return;
      }
      if (cmd.action === 'autonomy' && cmd.level !== undefined) {
        await harnessBridge.setAutonomy(cmd.level);
        const labels = ['Observe', 'Recommend', 'Execute Safe', 'Autonomous', 'Self-Improve', 'High-Impact'];
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(), role: 'assistant',
          content: `Autonomy level set to L${cmd.level} (${labels[cmd.level]}). The harness will now operate at this level.`,
        }]);
        await harnessBridge.addAudit(`Autonomy set to L${cmd.level} via chat`, 'info');
        setIsProcessing(false);
        return;
      }
      if (cmd.action === 'show-harness') {
        onSwitchToHarness();
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(), role: 'assistant',
          content: 'Switching to Harness Control view. You can see all 12 pillars and their status.',
        }]);
        setIsProcessing(false);
        return;
      }
    }

    try {
      await conversationManager.sendMessage(text);
    } catch (e) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: 'system',
        content: `Failed to reach JARVIS: ${e?.message || 'Unknown error'}`,
      }]);
      setIsProcessing(false);
    }
  }, [input, isProcessing, onSwitchToHarness]);

  const toggleVoice = useCallback(() => {
    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
        recognitionRef.current = null;
      }
      setIsListening(false);
      if (input.trim()) handleSend();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(), role: 'system',
        content: 'Speech recognition not available. Use text input instead.',
      }]);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);

      if (event.results[event.results.length - 1].isFinal) {
        const finalText = transcript.trim();
        if (finalText) {
          setTimeout(() => {
            const userMsg = { id: Date.now().toString(), role: 'user', content: finalText };
            setMessages(prev => [...prev, userMsg]);
            setInput('');
            streamingRef.current = '';
            setIsProcessing(true);

            const cmd = parseHarnessCommand(finalText);
            if (cmd) {
              (async () => {
                if (cmd.action === 'toggle' && cmd.pillar) {
                  const current = harnessBridge.getState().toggles[cmd.pillar];
                  const newState = !current;
                  await harnessBridge.toggle(cmd.pillar, newState);
                  const pillarName = cmd.pillar.replace(/-/g, ' ');
                  setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(), role: 'assistant',
                    content: `${newState ? 'Enabled' : 'Disabled'} ${pillarName}.`,
                  }]);
                  await harnessBridge.addAudit(`Pillar "${cmd.pillar}" ${newState ? 'enabled' : 'disabled'} via voice`, 'info');
                } else if (cmd.action === 'autonomy' && cmd.level !== undefined) {
                  await harnessBridge.setAutonomy(cmd.level);
                  const labels = ['Observe', 'Recommend', 'Execute Safe', 'Autonomous', 'Self-Improve', 'High-Impact'];
                  setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(), role: 'assistant',
                    content: `Autonomy set to L${cmd.level} (${labels[cmd.level]}).`,
                  }]);
                  await harnessBridge.addAudit(`Autonomy set to L${cmd.level} via voice`, 'info');
                } else if (cmd.action === 'show-harness') {
                  onSwitchToHarness();
                }
                setIsProcessing(false);
              })();
            } else {
              conversationManager.sendMessage(finalText).catch((e) => {
                setMessages(prev => [...prev, {
                  id: (Date.now() + 1).toString(), role: 'system',
                  content: `Failed to reach JARVIS: ${e?.message || 'Unknown error'}`,
                }]);
                setIsProcessing(false);
              });
            }
          }, 300);
        }
      }
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setMessages(prev => [...prev, {
          id: Date.now().toString(), role: 'system',
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

  const liveTasks = harnessState.missions.map((m) => ({
    id: m.id, title: m.name,
    status: m.status === 'completed' ? 'done' : m.status === 'running' ? 'running' : m.status === 'queued' ? 'idle' : 'blocked',
  }));
  const liveAgents = harnessState.agents.map((a) => ({ name: a.name, state: a.state }));
  const liveAudit = harnessState.audit.slice(-10).reverse();

  return (
    <div className="flex-1 flex gap-4 min-w-0 overflow-hidden">
      {/* Left rail */}
      <aside className="w-64 shrink-0 bg-stonic-card border border-stonic-b1 rounded-xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-stonic-b1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-stonic-primary to-stonic-accent shadow-[0_0_12px_rgba(0,216,238,0.35)]" />
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
            <button className="p-1.5 rounded-md text-stonic-textDim hover:text-stonic-text hover:bg-stonic-hover transition-colors"><Paperclip size={14} /></button>
            <button className="p-1.5 rounded-md text-stonic-textDim hover:text-stonic-text hover:bg-stonic-hover transition-colors"><ImageIcon size={14} /></button>
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
            <button className="p-1.5 rounded-md text-stonic-textDim hover:text-stonic-primary hover:bg-stonic-primary/10 transition-colors"><Video size={14} /></button>
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
            <div className="space-y-2 font-mono-tech">
              {liveAudit.map((entry, i) => (
                <div key={i} className="text-[9px] text-stonic-textDim flex gap-2">
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
  );
};

// ─── View Toggle Button ──────────────────────────────────────────────────────

const ViewToggleButton = ({ active, onClick, icon, label }) => (
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

// ─── Main ControlUIPanel ─────────────────────────────────────────────────────

export const ControlUIPanel = () => {
  const [viewMode, setViewMode] = useState('chat');

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <div className="flex items-center gap-1 mb-3 shrink-0">
        <ViewToggleButton
          active={viewMode === 'chat'}
          onClick={() => setViewMode('chat')}
          icon={<MessageSquare size={12} />}
          label="Chat"
        />
        <ViewToggleButton
          active={viewMode === 'harness'}
          onClick={() => setViewMode('harness')}
          icon={<Gauge size={12} />}
          label="Harness Control"
        />
      </div>

      {viewMode === 'harness'
        ? <HarnessControlCenter />
        : <ChatView onSwitchToHarness={() => setViewMode('harness')} />
      }
    </div>
  );
};

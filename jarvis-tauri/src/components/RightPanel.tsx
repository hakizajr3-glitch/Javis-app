import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Terminal, Send, Mic, Command, CheckSquare, Bot } from 'lucide-react';
import { conversationManager } from '../conversationManager';
import { jarvisRuntime, JarvisEvent } from '../jarvisConversationRuntime';
import { applyPersonaToUtterance } from '../voiceSelector';

// -- TTS: prefer ElevenLabs via main, fall back to browser speechSynthesis.
async function speakAiResponse(text: string) {
  if (!text || !text.trim()) return;
  try {
    if (window.electronAPI && typeof window.electronAPI.synthesize === 'function') {
      const res = await window.electronAPI.synthesize(text);
      if (res && res.ok && res.audio) {
        const blob = new Blob([res.audio], { type: res.mime || 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.play().catch(() => { /* fall through to speechSynthesis */ });
        return;
      }
    }
  } catch (_) { /* ignore, fall through */ }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0; u.pitch = 1.0; u.volume = 1.0;
      // Apply the saved voice_persona ('male' | 'female' | 'jarvismale')
      // so MALE picks a male voice, FEMALE picks a female voice, and the
      // original Jarvis Male persona routes to a deep/professional male
      // British accent (matches the Adam ElevenLabs voice). Falls back
      // silently if SpeechSynthesis is unavailable or voices haven't
      // loaded within the timeout.
      await applyPersonaToUtterance(u);
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface RightPanelProps {
  onCommand?: (command: string, detail?: string) => void;
}

const commandPatterns: { regex: RegExp; command: string; reply: string }[] = [
  { regex: /\b(open|show|switch to)\s+(control\s*ui|agent\s*harness)\b/i, command: 'control-ui', reply: 'Opening Control UI.' },
  { regex: /\b(open|show|switch to)\s+tasks\b/i, command: 'tasks', reply: 'Switching to Tasks.' },
  { regex: /\b(open|show|switch to)\s+notes\b/i, command: 'notes', reply: 'Switching to Notes.' },
  { regex: /\b(open|show|switch to)\s+contacts\b/i, command: 'contacts', reply: 'Switching to Contacts.' },
  { regex: /\b(open|show|switch to)\s+(ai\s+workforce|agents?)\b/i, command: 'ai-workforce', reply: 'Switching to AI Workforce.' },
  { regex: /\b(open|show|switch to)\s+(dashboard|executive)\b/i, command: 'executive-dashboard', reply: 'Switching to Executive Dashboard.' },
  { regex: /\b(open|show|switch to)\s+(integrations?|connectors?)\b/i, command: 'integrations', reply: 'Switching to Integrations.' },
  { regex: /\b(go\s+)?home\b/i, command: 'intelligence', reply: 'Returning to Intelligence Hub.' },
  { regex: /\b(open|show|switch to)\s+intelligence\b/i, command: 'intelligence', reply: 'Switching to Intelligence Hub.' },
];

export const RightPanel: React.FC<RightPanelProps> = ({ onCommand }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [deepReasoning, setDeepReasoning] = useState(false);
  const [fastResponse, setFastResponse] = useState(true);
  const [logs, setLogs] = useState<{ time: string; level: string; source: string; message: string }[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const inputValueRef = useRef(inputValue);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputValueRef.current = inputValue; }, [inputValue]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Sync messages from conversationManager
  useEffect(() => {
    const unsub = conversationManager;
    unsub.setCallbacks({
      onMessage: (msg) => {
        setMessages(prev => [...prev, { id: msg.id, role: msg.role, content: msg.content, timestamp: msg.timestamp }]);
        if (msg.role === 'assistant') speakAiResponse(msg.content);
      },
      onStateChange: (state: string) => {
        setIsProcessing(state === 'thinking' || state === 'executing');
      },
    });
  }, []);

  // Subscribe to JARVIS runtime events — shows command execution results
  // (shell output, file reads, mouse actions, screenshots, status reports)
  // as messages in the chat panel, alongside AI conversation responses.
  useEffect(() => {
    const unsub = jarvisRuntime.subscribe((evt: JarvisEvent) => {
      // Capture all events as log entries
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const level = evt.source === 'error' ? 'ERROR' : evt.source === 'system' ? 'INFO' : evt.source.toUpperCase().slice(0, 4);
      setLogs(prev => [...prev.slice(-50), { time, level, source: evt.source, message: evt.event }]);

      if (evt.source === 'user') {
        // Show user's voice/text input as a user message
        setMessages(prev => {
          // Avoid duplicates — conversationManager already adds user messages
          // for AI conversation, so only add if this looks like a command
          if (prev.some(m => m.content === evt.event && m.role === 'user')) return prev;
          return [...prev, {
            id: evt.id,
            role: 'user' as const,
            content: evt.event.replace(/^Voice: |^Text: /, '').replace(/^"|"$/g, ''),
            timestamp: evt.timestamp,
          }];
        });
      } else if (evt.source === 'jarvis' || evt.source === 'tool' || evt.source === 'error') {
        // Show JARVIS's responses (command results, status, errors) as assistant messages
        if (evt.event && evt.event !== 'Thinking...') {
          setMessages(prev => [...prev, {
            id: evt.id,
            role: 'assistant' as const,
            content: evt.event,
            timestamp: evt.timestamp,
          }]);
          // Speak tool/jarvis responses (but not every tool event — only meaningful ones)
          if (evt.source === 'jarvis' || evt.source === 'error') {
            speakAiResponse(evt.event);
          }
        }
      }
    });
    return unsub;
  }, []);

  const executeLocalCommand = useCallback((text: string) => {
    const normalized = text.toLowerCase().trim();
    const match = commandPatterns.find(p => p.regex.test(normalized));
    if (!match) return false;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);

    const replyMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: match.reply, timestamp: Date.now() };
    setMessages(prev => [...prev, replyMsg]);
    speakAiResponse(match.reply);

    onCommand?.(match.command, text);
    return true;
  }, [onCommand]);

  const handleSend = useCallback(async () => {
    if (!inputValue.trim()) return;
    const text = inputValue.trim();
    setInputValue('');
    // First try local navigation commands (open tasks, notes, etc.)
    if (executeLocalCommand(text)) return;
    // Then route through JARVIS Conversation Runtime — parses intent,
    // executes real commands (shell, file, mouse, etc.) via Tauri,
    // and falls through to the AI for general conversation.
    const response = await jarvisRuntime.processInput(text, false, { deepReasoning, fastResponse });
    if (response === 'SWITCH_TO_HARNESS') {
      onCommand?.('control-ui', text);
    }
  }, [inputValue, executeLocalCommand, onCommand, deepReasoning, fastResponse]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      const err: Message = {
        id: Date.now().toString(),
        role: 'system',
        content: 'Voice input is not supported in this browser.',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, err]);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    let finalTranscript = '';
    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interim += transcript;
        }
      }
      setInputValue(finalTranscript + interim);
    };

    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = async () => {
      setIsListening(false);
      recognitionRef.current = null;
      const text = (finalTranscript || inputValueRef.current).trim();
      if (text) {
        setInputValue(text);
        if (executeLocalCommand(text)) return;
        // Route voice input through JARVIS Conversation Runtime
        const response = await jarvisRuntime.processInput(text, true, { deepReasoning, fastResponse });
        if (response === 'SWITCH_TO_HARNESS') {
          onCommand?.('control-ui', text);
        }
      }
    };

    recognition.start();
    setIsListening(true);
  }, [isListening, inputValue, executeLocalCommand, deepReasoning, fastResponse]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="w-[330px] flex flex-col gap-3 shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Terminal size={14} className="text-stonic-primary" />
            <div className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-stonic-primary to-transparent" />
          </div>
          <span className="text-[10px] font-bold text-stonic-text tracking-[0.15em] font-mono-tech border-b border-stonic-primary/30 pb-0.5">
            SYSTEM_TRANSCRIPTION
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsChatOpen(true)}
            className={`px-2.5 py-1 rounded-md border border-stonic-b2
                       text-[9px] font-medium transition-all flex items-center gap-1 font-rajdhani
                       ${isChatOpen
                         ? 'bg-stonic-primary/10 text-stonic-primary border-stonic-primary/50'
                         : 'bg-stonic-primary/5 text-stonic-primary hover:bg-stonic-primary/10'}`}
          >
            <span className="text-[8px]">+</span>
            CHAT
          </button>
          <button
            onClick={() => setIsChatOpen(false)}
            className={`px-2.5 py-1 rounded-md border border-stonic-b2
                       text-[9px] font-medium transition-all flex items-center gap-1 font-rajdhani
                       ${!isChatOpen
                         ? 'bg-stonic-primary/10 text-stonic-primary border-stonic-primary/50'
                         : 'bg-stonic-hover text-stonic-textDim hover:text-stonic-text'}`}
          >
            LOGS
          </button>
        </div>
      </div>

      <div className="bg-stonic-card border border-stonic-b1 rounded-xl flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="p-2.5 border-b border-stonic-b1">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-stonic-accent animate-pulse shadow-[0_0_6px_rgba(0,245,212,0.8)]" />
                <span className="text-[9px] text-stonic-textMuted uppercase tracking-wider font-mono-tech">Deep Reasoning</span>
              </div>
            </div>
            <button
              onClick={() => setDeepReasoning(!deepReasoning)}
              className={`
                relative w-7 h-3.5 rounded-full transition-colors duration-300
                ${deepReasoning ? 'bg-stonic-accent/30' : 'bg-stonic-hover'}
              `}
            >
              <div className={`
                absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all duration-300
                ${deepReasoning
                  ? 'left-3.5 bg-stonic-accent shadow-[0_0_6px_rgba(0,245,212,0.8)]'
                  : 'left-0.5 bg-stonic-textDim'
                }
              `} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[7px] text-stonic-textDim font-mono-tech">Fast Response Mode</span>
            <button
              onClick={() => setFastResponse(!fastResponse)}
              className={`
                relative w-7 h-3.5 rounded-full transition-colors duration-300
                ${fastResponse ? 'bg-stonic-primary/30' : 'bg-stonic-hover'}
              `}
            >
              <div className={`
                absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all duration-300
                ${fastResponse
                  ? 'left-3.5 bg-stonic-primary shadow-[0_0_6px_rgba(0,216,238,0.8)]'
                  : 'left-0.5 bg-stonic-textDim'
                }
              `} />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto scrollbar-thin p-2.5 space-y-3"
        >
          {isChatOpen ? (
            messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[9px] text-stonic-textDim font-mono-tech">
                No messages yet
              </div>
            ) : (
              messages.map((message) => (
              <div
                key={message.id}
                className={`
                  flex flex-col gap-1
                  ${message.role === 'user' ? 'items-end' : 'items-start'}
                `}
              >
                <div className="flex items-center gap-2 text-[8px] text-stonic-textDim uppercase tracking-wider font-mono-tech">
                  {message.role === 'user' ? (
                    <>
                      <span>{formatTime(message.timestamp)}</span>
                      <span className="text-stonic-textMuted">User_C9B</span>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1">
                        <div className="w-1 h-1 rounded-full bg-stonic-primary animate-pulse shadow-[0_0_4px_rgba(0,212,255,0.8)]" />
                        <span className="text-stonic-primary">STONIC_RESPONSE</span>
                      </div>
                      <span>{formatTime(message.timestamp)}</span>
                    </>
                  )}
                </div>

                <div className={`max-w-[92%] p-2.5 rounded-lg text-[11px] leading-relaxed font-mono-tech ${message.role === 'user'
                  ? 'bg-stonic-hover border border-stonic-b1 text-stonic-text'
                  : 'bg-stonic-surface border-l-2 border-stonic-primary text-stonic-text'
                }`}>
                  {message.content}
                </div>
              </div>
            ))
            )
          ) : (
            <div className="space-y-1 font-mono-tech">
              {logs.length > 0 ? (
                logs.map((log, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 border-b border-stonic-b1/30">
                    <span className="text-[7px] text-stonic-textDim">{log.time}</span>
                    <span className={`text-[7px] px-1 rounded ${
                      log.level === 'ERROR' ? 'text-red-400 bg-red-500/10' :
                      log.level === 'INFO' ? 'text-stonic-primary bg-stonic-primary/10' :
                      log.level === 'JARV' ? 'text-stonic-accent bg-stonic-accent/10' :
                      log.level === 'TOOL' ? 'text-stonic-warning bg-stonic-warning/10' :
                      'text-stonic-textDim bg-stonic-hover'
                    }`}>{log.level}</span>
                    <span className="text-[9px] text-stonic-textMuted truncate">{log.message}</span>
                  </div>
                ))
              ) : (
                <div className="text-[9px] text-stonic-textDim italic py-4 text-center">
                  No events yet. Send a message or voice command to see activity.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-2.5 border-t border-stonic-b1">
          <div className="flex flex-wrap gap-1.5 mb-2">
            <button
              onClick={() => executeLocalCommand('Open Control UI')}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-stonic-primary bg-stonic-primary/5 border border-stonic-primary/20 hover:bg-stonic-primary/10 transition-colors"
            >
              <Command size={10} /> Control UI
            </button>
            <button
              onClick={() => executeLocalCommand('Open AI Workforce')}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-stonic-textMuted bg-stonic-surface/50 border border-stonic-b1 hover:bg-stonic-hover hover:text-stonic-text transition-colors"
            >
              <Bot size={10} /> Run agent
            </button>
            <button
              onClick={() => executeLocalCommand('Show tasks')}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-stonic-textMuted bg-stonic-surface/50 border border-stonic-b1 hover:bg-stonic-hover hover:text-stonic-text transition-colors"
            >
              <CheckSquare size={10} /> Tasks
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Type your message..."
                className="w-full px-3 py-2 rounded-md bg-stonic-surface/50
                          border border-stonic-b1 text-[11px] text-stonic-text font-mono-tech
                          placeholder:text-stonic-textDim
                          focus:outline-none focus:border-stonic-b2
                          transition-all"
              />
              <button
                type="button"
                onClick={toggleListening}
                className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-colors
                  ${isListening ? 'text-stonic-primary animate-pulse' : 'text-stonic-textMuted hover:text-stonic-primary'}`}
              >
                <Mic size={12} />
              </button>
            </div>
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="p-2 rounded-md bg-stonic-primary/5 border border-stonic-b2
                         text-stonic-primary hover:bg-stonic-primary/10
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all"
            >
              <Send size={12} />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-stonic-card border border-stonic-b1 rounded-xl p-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.8)] ${isProcessing ? 'bg-stonic-accent' : 'bg-emerald-400'}`} />
            <span className={`text-[9px] font-semibold tracking-wider font-mono-tech ${isProcessing ? 'text-stonic-accent' : 'text-emerald-400'}`}>
              {isProcessing ? 'PROCESSING...' : 'SYSTEM READY'}
            </span>
          </div>
          <span className="text-[8px] text-stonic-textDim font-mono-tech">
            V2.0.1-BETA
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-[8px] text-stonic-textDim font-mono-tech">
          <Terminal size={9} />
          <span className="truncate">{isProcessing ? 'Consulting Gemini AI...' : 'System ready - Click INITIALIZE AI to start'}</span>
        </div>
      </div>
    </div>
  );
};

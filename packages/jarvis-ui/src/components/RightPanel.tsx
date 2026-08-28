import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Send, Mic } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
}

interface RightPanelProps {
  messages?: Message[];
  onSend?: (text: string) => void;
  isProcessing?: boolean;
  deepReasoning?: boolean;
  fastResponse?: boolean;
  onToggleDeepReasoning?: () => void;
  onToggleFastResponse?: () => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  messages: externalMessages,
  onSend,
  isProcessing: externalProcessing,
  deepReasoning = false,
  fastResponse = true,
  onToggleDeepReasoning,
  onToggleFastResponse,
}) => {
  const [localMessages, setLocalMessages] = useState<Message[]>(externalMessages || []);
  const [inputValue, setInputValue] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [localProcessing, setLocalProcessing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = externalMessages || localMessages;
  const isProcessing = externalProcessing !== undefined ? externalProcessing : localProcessing;

  useEffect(() => {
    if (externalMessages) setLocalMessages(externalMessages);
  }, [externalMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim() || isProcessing) return;
    if (onSend) {
      onSend(inputValue.trim());
    } else {
      setLocalMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'user',
        content: inputValue.trim(),
        timestamp: Date.now(),
      }]);
      setLocalProcessing(true);
      setTimeout(() => {
        setLocalMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'ai',
          content: 'Response not implemented in standalone mode.',
          timestamp: Date.now(),
        }]);
        setLocalProcessing(false);
      }, 500);
    }
    setInputValue('');
  };

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
            className={`px-2.5 py-1 rounded-md border border-stonic-b2 text-[9px] font-medium transition-all flex items-center gap-1 font-rajdhani ${
              isChatOpen
                ? 'bg-stonic-primary/10 text-stonic-primary border-stonic-primary/50'
                : 'bg-stonic-primary/5 text-stonic-primary hover:bg-stonic-primary/10'
            }`}
          >
            <span className="text-[8px]">+</span> CHAT
          </button>
          <button
            onClick={() => setIsChatOpen(false)}
            className={`px-2.5 py-1 rounded-md border border-stonic-b2 text-[9px] font-medium transition-all flex items-center gap-1 font-rajdhani ${
              !isChatOpen
                ? 'bg-stonic-primary/10 text-stonic-primary border-stonic-primary/50'
                : 'bg-stonic-hover text-stonic-textDim hover:text-stonic-text'
            }`}
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
              onClick={onToggleDeepReasoning}
              className={`relative w-7 h-3.5 rounded-full transition-colors duration-300 ${
                deepReasoning ? 'bg-stonic-accent/30' : 'bg-stonic-hover'
              }`}
            >
              <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                deepReasoning
                  ? 'left-3.5 bg-stonic-accent shadow-[0_0_6px_rgba(0,245,212,0.8)]'
                  : 'left-0.5 bg-stonic-textDim'
              }`} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[7px] text-stonic-textDim font-mono-tech">Fast Response Mode</span>
            <button
              onClick={onToggleFastResponse}
              className={`relative w-7 h-3.5 rounded-full transition-colors duration-300 ${
                fastResponse ? 'bg-stonic-primary/30' : 'bg-stonic-hover'
              }`}
            >
              <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                fastResponse
                  ? 'left-3.5 bg-stonic-primary shadow-[0_0_6px_rgba(0,216,238,0.8)]'
                  : 'left-0.5 bg-stonic-textDim'
              }`} />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin p-2.5 space-y-3">
          {isChatOpen ? (
            messages.map((message) => (
              <div key={message.id} className={`flex flex-col gap-1 ${
                message.role === 'user' ? 'items-end' : 'items-start'
              }`}>
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
                <div className={`max-w-[92%] p-2.5 rounded-lg text-[11px] leading-relaxed font-mono-tech ${
                  message.role === 'user'
                    ? 'bg-stonic-hover border border-stonic-b1 text-stonic-text'
                    : 'bg-stonic-surface border-l-2 border-stonic-primary text-stonic-text'
                }`}>
                  {message.content}
                </div>
              </div>
            ))
          ) : (
            <div className="space-y-1 font-mono-tech">
              <div className="flex items-center gap-2 py-1 border-b border-stonic-b1/30">
                <span className="text-[7px] text-stonic-textDim">10:45:32</span>
                <span className="text-[7px] text-stonic-primary px-1 rounded bg-stonic-primary/10">INFO</span>
                <span className="text-[9px] text-stonic-textMuted">System initialized</span>
              </div>
              <div className="flex items-center gap-2 py-1 border-b border-stonic-b1/30">
                <span className="text-[7px] text-stonic-textDim">10:45:33</span>
                <span className="text-[7px] text-stonic-accent px-1 rounded bg-stonic-accent/10">WS</span>
                <span className="text-[9px] text-stonic-textMuted">WebSocket connection established</span>
              </div>
              <div className="flex items-center gap-2 py-1 border-b border-stonic-b1/30">
                <span className="text-[7px] text-stonic-textDim">10:45:35</span>
                <span className="text-[7px] text-stonic-warning px-1 rounded bg-stonic-warning/10">AI</span>
                <span className="text-[9px] text-stonic-textMuted">Neural network loaded (2.4GB)</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-2.5 border-t border-stonic-b1">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Type your message..."
                className="w-full px-3 py-2 rounded-md bg-stonic-surface/50 border border-stonic-b1 text-[11px] text-stonic-text font-mono-tech placeholder:text-stonic-textDim focus:outline-none focus:border-stonic-b2 transition-all"
              />
              <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-stonic-textMuted hover:text-stonic-primary transition-colors">
                <Mic size={12} />
              </button>
            </div>
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="p-2 rounded-md bg-stonic-primary/5 border border-stonic-b2 text-stonic-primary hover:bg-stonic-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Send size={12} />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-stonic-card border border-stonic-b1 rounded-xl p-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.8)] ${
              isProcessing ? 'bg-stonic-accent' : 'bg-stonic-error'
            }`} />
            <span className={`text-[9px] font-semibold tracking-wider font-mono-tech ${
              isProcessing ? 'text-stonic-accent' : 'text-stonic-error'
            }`}>
              {isProcessing ? 'PROCESSING...' : 'SYSTEM_OFFLINE'}
            </span>
          </div>
          <span className="text-[8px] text-stonic-textDim font-mono-tech">V2.0.1-BETA</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-[8px] text-stonic-textDim font-mono-tech">
          <Terminal size={9} />
          <span className="truncate">{isProcessing ? 'Consulting AI... (Fast)' : 'System ready'}</span>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Command, Cpu, FileText, CheckSquare, Users, Bot, GitBranch, LayoutDashboard, Plug, Settings, X, Mic } from 'lucide-react';

interface CommandItem {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onTabChange: (tab: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onTabChange }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = useMemo(() => [
    { id: 'intelligence', label: 'Go to Intelligence Hub', icon: <Cpu size={14} />, action: () => onTabChange('intelligence') },
    { id: 'control-ui', label: 'Open Control UI', icon: <Command size={14} />, action: () => onTabChange('control-ui') },
    { id: 'notes', label: 'Open Notes', icon: <FileText size={14} />, action: () => onTabChange('notes') },
    { id: 'tasks', label: 'Open Tasks', icon: <CheckSquare size={14} />, action: () => onTabChange('tasks') },
    { id: 'contacts', label: 'Open Contacts', icon: <Users size={14} />, action: () => onTabChange('contacts') },
    { id: 'ai-workforce', label: 'Open AI Workforce', icon: <Bot size={14} />, action: () => onTabChange('ai-workforce') },
    { id: 'org-structure', label: 'Open Organization', icon: <GitBranch size={14} />, action: () => onTabChange('org-structure') },
    { id: 'executive-dashboard', label: 'Open Dashboard', icon: <LayoutDashboard size={14} />, action: () => onTabChange('executive-dashboard') },
    { id: 'integrations', label: 'Open Integrations', icon: <Plug size={14} />, action: () => onTabChange('integrations') },
    { id: 'settings', label: 'Open Settings', icon: <Settings size={14} />, action: () => onTabChange('intelligence') },
  ], [onTabChange]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return commands;
    return commands.filter(c => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelected(0);
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = filtered[selected];
        if (item) { item.action(); onClose(); }
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, filtered, selected, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[520px] bg-stonic-card border border-stonic-b1 rounded-xl shadow-[0_0_40px_rgba(0,212,255,0.15)] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-stonic-b1">
          <Command size={16} className="text-stonic-primary" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0); }}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-[13px] text-stonic-text font-mono-tech placeholder:text-stonic-textDim outline-none"
          />
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-stonic-textDim font-mono-tech border border-stonic-b1 rounded px-1.5 py-0.5">ESC</span>
            <button onClick={onClose} className="p-1 rounded text-stonic-textDim hover:text-stonic-text hover:bg-stonic-hover transition-colors">
              <X size={12} />
            </button>
          </div>
        </div>

        <div className="max-h-[340px] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-[11px] text-stonic-textDim font-mono-tech">
              No commands found for "{query}"
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => { item.action(); onClose(); }}
                  onMouseEnter={() => setSelected(idx)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-[11px] font-medium transition-all
                    ${selected === idx ? 'bg-stonic-primary/10 text-stonic-primary border border-stonic-primary/20' : 'text-stonic-textMuted hover:bg-stonic-hover/50 hover:text-stonic-text'}`}
                >
                  <span className={selected === idx ? 'text-stonic-primary' : 'text-stonic-textDim'}>{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {selected === idx && <span className="text-[9px] text-stonic-primary font-mono-tech">↵ enter</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-stonic-b1 bg-stonic-surface/30 flex items-center gap-4 text-[9px] text-stonic-textDim font-mono-tech">
          <span className="flex items-center gap-1"><span className="text-stonic-primary">↑↓</span> navigate</span>
          <span className="flex items-center gap-1"><span className="text-stonic-primary">↵</span> select</span>
          <span className="flex items-center gap-1"><Mic size={10} className="text-stonic-primary" /> or type "Open Control UI"</span>
        </div>
      </div>
    </div>
  );
};

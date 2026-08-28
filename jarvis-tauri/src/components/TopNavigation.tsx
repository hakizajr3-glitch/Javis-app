import React from 'react';
import { Cpu, FileText, CheckSquare, Users, Settings, Bot, GitBranch, LayoutDashboard, Plug, Command, Search } from 'lucide-react';

interface Tab {
  id: string;
  label: string;
  icon: React.ReactNode;
  group?: string;
}

interface TopNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenCommandPalette?: () => void;
  onOpenSettings?: () => void;
}

const primaryTabs: Tab[] = [
  { id: 'intelligence', label: 'Intelligence', icon: <Cpu size={16} /> },
  { id: 'notes', label: 'Notes', icon: <FileText size={16} /> },
  { id: 'tasks', label: 'Tasks', icon: <CheckSquare size={16} /> },
  { id: 'contacts', label: 'Contacts', icon: <Users size={16} /> },
];

const systemTabs: Tab[] = [
  { id: 'ai-workforce', label: 'AI Workforce', icon: <Bot size={16} />, group: 'Multi-Agent System' },
  { id: 'org-structure', label: 'Organization', icon: <GitBranch size={16} />, group: 'Structure & Roles' },
  { id: 'executive-dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} />, group: 'Executive Oversight' },
  { id: 'integrations', label: 'Integrations', icon: <Plug size={16} /> },
  { id: 'control-ui', label: 'Control UI', icon: <Command size={16} />, group: 'Agent Harness' },
];

export const TopNavigation: React.FC<TopNavigationProps> = ({ activeTab, onTabChange, onOpenCommandPalette, onOpenSettings }) => {
  return (
    <header className="h-11 bg-stonic-surface border-b border-stonic-b2 flex items-center justify-between px-6 shrink-0 relative z-50">
      {/* Logo - J.R.R.V.I.S Red gradient with box-shadow */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500/30 to-amber-500/20 
                          flex items-center justify-center border border-red-400/40
                          shadow-[0_0_15px_rgba(239,68,68,0.3)]">
            <Cpu size={18} className="text-red-400" />
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-stonic-success 
                          shadow-[0_0_8px_rgba(0,255,136,0.8)] animate-pulse" />
        </div>
        <div>
          <h1 className="text-lg font-black tracking-[0.15em] text-white font-orbitron">J.R.R.V.I.S</h1>
          <span className="text-[9px] text-stonic-textDim uppercase tracking-[0.2em] font-mono-tech">Just A Rather Very Intelligent System</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="flex items-center gap-1">
        {/* Primary Tabs */}
        {primaryTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              relative px-3 py-2 rounded-lg flex items-center gap-1.5 font-rajdhani font-semibold text-xs tracking-wide
              transition-all duration-300 group
              ${activeTab === tab.id 
                ? 'text-stonic-primary bg-stonic-primary/5 border border-stonic-primary/40 shadow-[0_0_15px_rgba(0,212,255,0.15)]' 
                : 'text-stonic-textMuted hover:text-stonic-text hover:bg-stonic-hover/50 border border-transparent'
              }
            `}
          >
            <span className={`transition-colors duration-300 ${activeTab === tab.id ? 'text-stonic-primary' : 'group-hover:text-stonic-primary'}`}>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-stonic-primary rounded-full 
                              shadow-[0_0_10px_rgba(0,212,255,0.8)]" />
            )}
          </button>
        ))}

        {/* Separator */}
        <div className="w-px h-5 bg-stonic-b2 mx-1.5" />

        {/* System Tabs */}
        {systemTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            title={tab.group}
            className={`
              relative px-3 py-2 rounded-lg flex items-center gap-1.5 font-rajdhani font-semibold text-xs tracking-wide
              transition-all duration-300 group
              ${activeTab === tab.id
                ? {
                    'ai-workforce': 'text-purple-400 bg-purple-500/5 border border-purple-400/40 shadow-[0_0_15px_rgba(168,85,247,0.15)]',
                    'org-structure': 'text-blue-400 bg-blue-500/5 border border-blue-400/40 shadow-[0_0_15px_rgba(59,130,246,0.15)]',
                    'executive-dashboard': 'text-emerald-400 bg-emerald-500/5 border border-emerald-400/40 shadow-[0_0_15px_rgba(52,211,153,0.15)]',
                    'integrations': 'text-teal-400 bg-teal-500/5 border border-teal-400/40 shadow-[0_0_15px_rgba(45,212,191,0.15)]',
                    'control-ui': 'text-stonic-primary bg-stonic-primary/5 border border-stonic-primary/40 shadow-[0_0_15px_rgba(0,212,255,0.15)]',
                  }[tab.id] || 'text-stonic-primary bg-stonic-primary/5 border border-stonic-primary/40 shadow-[0_0_15px_rgba(0,212,255,0.15)]'
                : 'text-stonic-textMuted hover:text-stonic-text hover:bg-stonic-hover/50 border border-transparent'
              }
            `}
          >
            <span className={`transition-colors duration-300 ${
              activeTab === tab.id ? {
                'ai-workforce': 'text-purple-400',
                'org-structure': 'text-blue-400',
                'executive-dashboard': 'text-emerald-400',
                'integrations': 'text-teal-400',
                'control-ui': 'text-stonic-primary',
              }[tab.id] || 'text-stonic-primary'
              : 'group-hover:text-stonic-primary'
            }`}>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
            {activeTab === tab.id && (
              <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full shadow-[0_0_10px_rgba(0,212,255,0.8)] ${
                {
                  'ai-workforce': 'bg-purple-400',
                  'org-structure': 'bg-blue-400',
                  'executive-dashboard': 'bg-emerald-400',
                  'integrations': 'bg-teal-400',
                  'control-ui': 'bg-stonic-primary',
                }[tab.id] || 'bg-stonic-primary'
              }`} />
            )}
          </button>
        ))}
      </nav>

      {/* Status & Settings */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
          Online
        </div>
        <button
          onClick={() => onOpenCommandPalette?.()}
          className="p-2 rounded-lg text-stonic-textMuted hover:text-stonic-primary
                     hover:bg-stonic-hover/50 transition-all duration-300"
          title="Command palette (Ctrl+K)"
        >
          <Search size={18} />
        </button>
        <button
          onClick={() => onOpenSettings?.()}
          className="p-2 rounded-lg text-stonic-textMuted hover:text-stonic-primary
                     hover:bg-stonic-hover/50 transition-all duration-300 cursor-pointer"
          title="AI Provider Settings"
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
};

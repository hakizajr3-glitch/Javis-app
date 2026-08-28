import React from 'react';
import { Cpu, FileText, CheckSquare, Users, Settings } from 'lucide-react';

interface Tab {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface TopNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  appName?: string;
  appSubtitle?: string;
}

const tabs: Tab[] = [
  { id: 'intelligence', label: 'Intelligence', icon: <Cpu size={16} /> },
  { id: 'notes', label: 'Notes', icon: <FileText size={16} /> },
  { id: 'tasks', label: 'Tasks', icon: <CheckSquare size={16} /> },
  { id: 'contacts', label: 'Contacts', icon: <Users size={16} /> },
];

export const TopNavigation: React.FC<TopNavigationProps> = ({
  activeTab,
  onTabChange,
  appName = 'JARVIS',
  appSubtitle = 'Just A Rather Very Intelligent System',
}) => {
  return (
    <header className="h-11 bg-stonic-surface border-b border-stonic-b2 flex items-center justify-between px-6 shrink-0 relative z-50">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500/30 to-amber-500/20 flex items-center justify-center border border-red-400/40 shadow-[0_0_15px_rgba(239,68,68,0.3)]">
            <Cpu size={18} className="text-red-400" />
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-stonic-success shadow-[0_0_8px_rgba(0,255,136,0.8)] animate-pulse" />
        </div>
        <div>
          <h1 className="text-lg font-black tracking-[0.15em] text-white font-orbitron">{appName}</h1>
          <span className="text-[9px] text-stonic-textDim uppercase tracking-[0.2em] font-mono-tech">{appSubtitle}</span>
        </div>
      </div>

      <nav className="flex items-center gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative px-4 py-2 rounded-lg flex items-center gap-2 font-rajdhani font-semibold text-sm tracking-wide transition-all duration-300 group ${
              activeTab === tab.id
                ? 'text-stonic-primary bg-stonic-primary/5 border border-stonic-primary/40 shadow-[0_0_15px_rgba(0,212,255,0.15)]'
                : 'text-stonic-textMuted hover:text-stonic-text hover:bg-stonic-hover/50 border border-transparent'
            }`}
          >
            <span className={`transition-colors duration-300 ${activeTab === tab.id ? 'text-stonic-primary' : 'group-hover:text-stonic-primary'}`}>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-stonic-primary rounded-full shadow-[0_0_10px_rgba(0,212,255,0.8)]" />
            )}
          </button>
        ))}
      </nav>

      <button className="p-2 rounded-lg text-stonic-textMuted hover:text-stonic-primary hover:bg-stonic-hover/50 transition-all duration-300">
        <Settings size={18} />
      </button>
    </header>
  );
};

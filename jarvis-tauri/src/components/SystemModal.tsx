import React, { useState, useEffect } from 'react';
import { X, Database, Clock, User, Brain, MessageSquare, Monitor, FileText, Layers, Cpu, Eye } from 'lucide-react';

interface SystemModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'memory' | 'history' | 'user' | 'desktop' | 'docs' | 'visual' | null;
}

export const SystemModal: React.FC<SystemModalProps> = ({ isOpen, onClose, type }) => {
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Animate in
  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      setLoading(true);
      setData(null);

      // Simulate data load (backend may be offline)
      setTimeout(() => {
        setData(null);
        setLoading(false);
      }, 800);
    } else {
      setVisible(false);
    }
  }, [isOpen, type]);

  // Handle escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!visible && !isOpen) return null;

  const modalConfig = {
    memory: {
      title: 'MEMORY',
      subtitle: 'SYSTEM ACCESS',
      icon: Database,
      color: 'text-cyan-400',
      border: 'border-cyan-500/30',
      bgGradient: 'from-cyan-500/10 to-cyan-400/5',
      glowColor: 'shadow-[0_0_30px_rgba(0,212,255,0.3)]',
    },
    history: {
      title: 'HISTORY',
      subtitle: 'SYSTEM ACCESS',
      icon: Clock,
      color: 'text-cyan-400',
      border: 'border-cyan-500/30',
      bgGradient: 'from-cyan-500/10 to-cyan-400/5',
      glowColor: 'shadow-[0_0_30px_rgba(0,212,255,0.3)]',
    },
    user: {
      title: 'USER SETTINGS',
      subtitle: 'PREFERENCES',
      icon: User,
      color: 'text-slate-300',
      border: 'border-slate-500/30',
      bgGradient: 'from-slate-500/10 to-slate-400/5',
      glowColor: 'shadow-[0_0_30px_rgba(148,163,184,0.3)]',
    },
    desktop: {
      title: 'DESKTOP CONTROL',
      subtitle: 'STONIC DESKTOP',
      icon: Monitor,
      color: 'text-cyan-400',
      border: 'border-cyan-500/30',
      bgGradient: 'from-cyan-500/10 to-cyan-400/5',
      glowColor: 'shadow-[0_0_30px_rgba(0,212,255,0.3)]',
    },
    docs: {
      title: 'AI DOCUMENTS',
      subtitle: 'KNOWLEDGE BASE',
      icon: FileText,
      color: 'text-cyan-400',
      border: 'border-cyan-500/30',
      bgGradient: 'from-cyan-500/10 to-cyan-400/5',
      glowColor: 'shadow-[0_0_30px_rgba(0,212,255,0.3)]',
    },
    visual: {
      title: 'VISUAL INTELLIGENCE',
      subtitle: 'VISUALIZATION HUB',
      icon: Eye,
      color: 'text-cyan-400',
      border: 'border-cyan-500/30',
      bgGradient: 'from-cyan-500/10 to-cyan-400/5',
      glowColor: 'shadow-[0_0_30px_rgba(0,212,255,0.3)]',
    },
  };

  const config = type ? modalConfig[type] : modalConfig.memory;
  const Icon = config?.icon || Database;

  // Loading state
  if (loading) {
    return (
      <div 
        className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
        style={{ animation: 'fadeIn 0.3s ease-out' }}
        onClick={onClose}
      >
        <div 
          className={`w-[600px] h-[500px] rounded-2xl border ${config.border} bg-gradient-to-br ${config.bgGradient} ${config.glowColor}`}
          onClick={(e) => e.stopPropagation()}
          style={{ animation: 'scaleIn 0.3s ease-out' }}
        >
          {/* Header */}
          <div className={`flex items-center justify-between px-6 py-4 border-b ${config.border}`}>
            <div className={`flex items-center gap-3 ${config.color}`}>
              <Icon size={24} />
              <span className="font-bold text-xl tracking-wider">{config.title}</span>
              <span className="text-xs opacity-60">{config.subtitle}</span>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
              <X size={20} className="text-white/60" />
            </button>
          </div>
          
          {/* Loading Content */}
          <div className="flex-1 flex items-center justify-center h-[calc(100%-60px)]">
            <div className="text-center">
              <div className={`w-16 h-16 rounded-full border-2 ${config.border} animate-pulse mx-auto mb-4`}>
                <Icon size={32} className={`${config.color} m-3`} />
              </div>
              <div className="text-cyan-400 font-mono">LOADING DATA...</div>
            </div>
          </div>
        </div>
        
        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes scaleIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        `}</style>
      </div>
    );
  }

  // Render content based on type
  const renderContent = () => {
    if (type === 'memory') {
      return (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-black/30 border border-cyan-500/20">
            <div className="flex items-center gap-2 text-cyan-400 mb-3">
              <Brain size={16} />
              <span className="font-bold">ACTIVE SESSIONS</span>
            </div>
            <div className="text-4xl font-mono text-white">{data?.sessions || '1'}</div>
          </div>
          
          <div className="p-4 rounded-xl bg-black/30 border border-cyan-500/20">
            <div className="flex items-center gap-2 text-cyan-400 mb-3">
              <Database size={16} />
              <span className="font-bold">AVAILABLE TOOLS</span>
            </div>
            <div className="text-4xl font-mono text-white">{data?.tools || '22'}</div>
          </div>

          <div className="p-4 rounded-xl bg-black/30 border border-cyan-500/20">
            <div className="flex items-center gap-2 text-cyan-400 mb-3">
              <MessageSquare size={16} />
              <span className="font-bold">SYSTEM STATUS</span>
            </div>
            <div className="text-green-400 font-mono text-xl">{data?.status || 'OPERATIONAL'}</div>
          </div>
        </div>
      );
    }
    
    if (type === 'history') {
      return (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-black/30 border border-cyan-500/20">
            <div className="flex items-center gap-2 text-cyan-400 mb-3">
              <MessageSquare size={16} />
              <span className="font-bold">RECENT COMMANDS</span>
            </div>
            <div className="space-y-2">
              {(data?.recent_commands || []).length > 0 ? (
                data.recent_commands.slice(0, 5).map((cmd: string, i: number) => (
                  <div key={i} className="font-mono text-sm text-white/70 pl-4 border-l border-cyan-500/30">
                    {cmd}
                  </div>
                ))
              ) : (
                <div className="text-white/40">No recent commands</div>
              )}
            </div>
          </div>
          
          <div className="p-4 rounded-xl bg-black/30 border border-cyan-500/20">
            <div className="flex items-center gap-2 text-cyan-400 mb-3">
              <Clock size={16} />
              <span className="font-bold">SYSTEM EVENTS</span>
            </div>
            <div className="space-y-2">
              {(data?.system_events || ['System initialized', 'Ready']).slice(0, 5).map((event: string, i: number) => (
                <div key={i} className="font-mono text-sm text-white/60 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                  {event}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }
    
    if (type === 'user') {
      return (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-black/30 border border-teal-500/20">
            <div className="flex items-center gap-2 text-teal-400 mb-3">
              <User size={16} />
              <span className="font-bold">USER PROFILE</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/40">Status:</span>
                <span className="text-green-400">Active</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Session:</span>
                <span className="text-white">Current</span>
              </div>
            </div>
          </div>
          
          <div className="p-4 rounded-xl bg-black/30 border border-teal-500/20">
            <div className="flex items-center gap-2 text-teal-400 mb-3">
              <Brain size={16} />
              <span className="font-bold">SYSTEM ACCESS</span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]"></span>
                <span className="text-white">Voice AI</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]"></span>
                <span className="text-white">File Upload</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]"></span>
                <span className="text-white">WebSocket</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]"></span>
                <span className="text-white">Memory System</span>
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    if (type === 'desktop') {
      return (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-black/30 border border-cyan-500/20">
            <div className="flex items-center gap-2 text-cyan-400 mb-3">
              <Monitor size={16} />
              <span className="font-bold">DESKTOP SESSION</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/40">Status:</span>
                <span className="text-amber-400">Not Connected</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Platform:</span>
                <span className="text-white">{typeof navigator !== 'undefined' ? navigator.platform : 'Unknown'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Screen:</span>
                <span className="text-white">{typeof window !== 'undefined' && window.screen ? `${window.screen.width}x${window.screen.height}` : 'N/A'}</span>
              </div>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-black/30 border border-cyan-500/20">
            <div className="flex items-center gap-2 text-cyan-400 mb-3">
              <Cpu size={16} />
              <span className="font-bold">CAPABILITIES</span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span className="text-white/70">Screen Capture</span>
                <span className="text-xs text-white/30 ml-auto">Requires Tauri desktop</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span className="text-white/70">Input Simulation</span>
                <span className="text-xs text-white/30 ml-auto">Requires Tauri desktop</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400"></span>
                <span className="text-white/70">Browser Control</span>
                <span className="text-xs text-green-400 ml-auto">Available</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400"></span>
                <span className="text-white/70">Filesystem</span>
                <span className="text-xs text-green-400 ml-auto">Available</span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (type === 'docs') {
      return (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-black/30 border border-cyan-500/20">
            <div className="flex items-center gap-2 text-cyan-400 mb-3">
              <FileText size={16} />
              <span className="font-bold">AI DOCUMENTS</span>
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-white/50 text-xs mb-3">Documents generated and managed by JARVIS will appear here.</p>
              <div className="text-white/40 text-xs italic">No documents yet. Ask JARVIS to create a document, report, or diagram.</div>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-black/30 border border-cyan-500/20">
            <div className="flex items-center gap-2 text-cyan-400 mb-3">
              <Database size={16} />
              <span className="font-bold">QUICK ACTIONS</span>
            </div>
            <div className="space-y-2">
              <button className="w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm text-white/70">
                Generate a project report
              </button>
              <button className="w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm text-white/70">
                Create a system architecture diagram
              </button>
              <button className="w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm text-white/70">
                Export conversation as document
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (type === 'visual') {
      return (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-black/30 border border-cyan-500/20">
            <div className="flex items-center gap-2 text-cyan-400 mb-3">
              <Layers size={16} />
              <span className="font-bold">VISUAL INTELLIGENCE</span>
            </div>
            <div className="space-y-3">
              <p className="text-white/50 text-xs">Generate visual representations of data, architecture, or concepts.</p>
              <div className="grid grid-cols-2 gap-3">
                <button className="p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-center">
                  <Layers size={20} className="text-cyan-400 mx-auto mb-1" />
                  <span className="text-xs text-white/70">Flowchart</span>
                </button>
                <button className="p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-center">
                  <Database size={20} className="text-cyan-400 mx-auto mb-1" />
                  <span className="text-xs text-white/70">Mind Map</span>
                </button>
                <button className="p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-center">
                  <Cpu size={20} className="text-cyan-400 mx-auto mb-1" />
                  <span className="text-xs text-white/70">Architecture</span>
                </button>
                <button className="p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-center">
                  <Eye size={20} className="text-cyan-400 mx-auto mb-1" />
                  <span className="text-xs text-white/70">Screenshot</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div 
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
      style={{ animation: 'fadeIn 0.3s ease-out' }}
      onClick={onClose}
    >
      <div 
        className={`w-[600px] h-[500px] max-h-[80vh] rounded-2xl border ${config.border} bg-gradient-to-br ${config.bgGradient} ${config.glowColor} flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'scaleIn 0.3s ease-out' }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${config.border}`}>
          <div className={`flex items-center gap-3 ${config.color}`}>
            <Icon size={24} />
            <span className="font-bold text-xl tracking-wider">{config.title}</span>
            <span className="text-xs opacity-60">{config.subtitle}</span>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={20} className="text-white/60" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {renderContent()}
        </div>

        {/* Footer */}
        <div className={`px-6 py-3 border-t ${config.border} flex justify-between items-center`}>
          <span className="text-xs text-white/40 font-mono">J.A.R.V.I.S. SYSTEM PANEL</span>
          <span className="text-xs text-white/40 font-mono">{new Date().toLocaleTimeString()}</span>
        </div>
      </div>
      
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
};

export default SystemModal;
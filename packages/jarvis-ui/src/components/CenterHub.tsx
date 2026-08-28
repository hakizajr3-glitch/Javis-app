import React from 'react';
import { Brain, Zap, Sparkles, Cpu } from 'lucide-react';

interface CenterHubProps {
  title?: string;
  subtitle?: string;
}

export const CenterHub: React.FC<CenterHubProps> = ({
  title = 'ATHENA',
  subtitle = 'Neural Interface Active',
}) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 relative overflow-hidden px-8">
      {/* Orbital rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[300px] h-[300px] rounded-full border border-stonic-primary/5 animate-[spin_30s_linear_infinite]" />
        <div className="w-[220px] h-[220px] rounded-full border border-stonic-accent/5 animate-[spin_20s_linear_infinite_reverse]" />
        <div className="w-[150px] h-[150px] rounded-full border border-stonic-primary/10 animate-[spin_15s_linear_infinite]" />
      </div>

      {/* Center orb */}
      <div className="relative">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-stonic-primary/20 via-transparent to-stonic-accent/10 flex items-center justify-center border border-stonic-b2 shadow-[0_0_40px_rgba(0,212,255,0.15)]">
          <Brain size={36} className="text-stonic-primary" />
        </div>
        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-stonic-success animate-pulse shadow-[0_0_10px_rgba(0,255,136,0.8)]" />
      </div>

      {/* Title */}
      <div className="text-center">
        <h2 className="text-2xl font-black tracking-[0.2em] text-white font-orbitron">{title}</h2>
        <p className="text-xs text-stonic-textDim tracking-wider font-mono-tech mt-1">{subtitle}</p>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Zap size={12} className="text-stonic-primary" />
          <span className="text-[8px] text-stonic-textDim font-mono-tech">READY</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Cpu size={12} className="text-stonic-accent" />
          <span className="text-[8px] text-stonic-textDim font-mono-tech">ONLINE</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Sparkles size={12} className="text-stonic-warning" />
          <span className="text-[8px] text-stonic-textDim font-mono-tech">AWAITING_INPUT</span>
        </div>
      </div>

      {/* Corner decorations */}
      <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-stonic-primary/20 rounded-tl-xl" />
      <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-stonic-primary/20 rounded-tr-xl" />
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-stonic-primary/20 rounded-bl-xl" />
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-stonic-primary/20 rounded-br-xl" />
    </div>
  );
};

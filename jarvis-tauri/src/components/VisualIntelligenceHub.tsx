import React from 'react';
import { Image, LayoutGrid, Share2 as Mindmap, Database, FolderOpen } from 'lucide-react';

export const VisualIntelligenceHub: React.FC = () => {
  const features = [
    { icon: <Image size={14} />, label: 'Images' },
    { icon: <LayoutGrid size={14} />, label: 'Flowcharts' },
    { icon: <Mindmap size={14} />, label: 'Mindmaps' },
    { icon: <Database size={14} />, label: 'materialize' },
    { icon: <FolderOpen size={14} />, label: 'here' },
  ];

  return (
    <div className="w-full h-[120px] bg-stonic-card border-t border-stonic-b1 border-l border-r border-b rounded-b-xl relative overflow-hidden">
      {/* Corner decorations */}
      <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-stonic-primary/20 rounded-tl-lg" />
      <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-stonic-primary/20 rounded-tr-lg" />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-stonic-primary/20 rounded-bl-lg" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-stonic-primary/20 rounded-br-lg" />

      <div className="h-full flex items-center justify-between px-6">
        {/* Left - Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-stonic-primary/20 to-stonic-accent/10
                      flex items-center justify-center border border-stonic-b2">
            <LayoutGrid size={20} className="text-stonic-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-stonic-text tracking-wider font-orbitron">VISUAL INTELLIGENCE HUB</h3>
            <p className="text-[8px] text-stonic-textDim font-mono-tech">Images, Flowcharts, Mindmaps materialize here</p>
          </div>
        </div>

        {/* Center - Status indicators */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-stonic-error animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
            <span className="text-[8px] text-stonic-error font-mono-tech tracking-wider">SYSTEM_OFFLINE</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-stonic-success animate-pulse shadow-[0_0_6px_rgba(0,255,136,0.8)]" />
            <span className="text-[8px] text-stonic-success font-mono-tech tracking-wider">AI_READY</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-stonic-primary animate-pulse shadow-[0_0_6px_rgba(0,212,255,0.8)]" />
            <span className="text-[8px] text-stonic-primary font-mono-tech tracking-wider">AWAITING_DATA_INPUT</span>
          </div>
        </div>

        {/* Right - Feature tags */}
        <div className="flex items-center gap-2">
          {features.map((feature, index) => (
            <div key={index} className="flex items-center gap-1 px-2 py-1 bg-stonic-surface/30 rounded-md border border-stonic-b1/50">
              <span className="text-stonic-primary text-[8px]">{feature.icon}</span>
              <span className="text-[7px] text-stonic-textDim font-mono-tech">{feature.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import { Bot, Users, Activity, TrendingUp, Clock, Search, X, Layers, GitBranch, RefreshCw } from 'lucide-react';
import { coreBridge } from '../../coreBridge';

interface AgentItem {
  id: string;
  name: string;
  type: 'ai' | 'hybrid';
  role: string;
  capabilities: string[];
  status: 'active' | 'idle' | 'busy' | 'offline';
  currentTask?: string;
  successRate: number;
  tasksCompleted: number;
  lastActive: Date;
  teamId?: string;
  teamName?: string;
}

interface TeamItem {
  id: string;
  name: string;
  description: string;
  members: string[];
  leadAgentId: string;
}

export const AIWorkforceDashboard: React.FC = () => {
  const [selectedAgent, setSelectedAgent] = useState<AgentItem | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [agents, setAgents] = useState<AgentItem[]>(coreBridge.getAgents());
  const [teams, setTeams] = useState<TeamItem[]>(coreBridge.getTeams());
  const [refreshing, setRefreshing] = useState(false);

  // Refresh agent/team data from coreBridge
  const refreshData = useCallback(() => {
    setRefreshing(true);
    setAgents(coreBridge.getAgents());
    setTeams(coreBridge.getTeams());
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  // Poll for updates every 5 seconds so the dashboard stays live
  useEffect(() => {
    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  }, [refreshData]);

  const filteredAgents = agents.filter(a => {
    const matchesStatus = filterStatus === 'all' || a.status === filterStatus;
    const matchesSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.role.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const stats = {
    total: agents.length,
    active: agents.filter(a => a.status === 'active' || a.status === 'busy').length,
    idle: agents.filter(a => a.status === 'idle').length,
    avgSuccessRate: agents.length > 0 ? (agents.reduce((sum, a) => sum + a.successRate, 0) / agents.length).toFixed(1) : '0.0',
  };

  return (
    <div className="flex-1 flex gap-4 min-h-0">
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-violet-500/10 border border-purple-400/40 flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.2)]">
              <Users size={22} className="text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-wider text-white font-orbitron">AI WORKFORCE</h2>
              <span className="text-[9px] text-stonic-textDim tracking-[0.2em] uppercase font-mono-tech">Multi-Agent System • {teams.length} Teams • {agents.length} Agents</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshData}
              className="p-1.5 rounded-lg bg-stonic-card border border-stonic-b1 text-stonic-textDim hover:text-stonic-primary hover:border-stonic-primary/30 transition-all"
              title="Refresh workforce data"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30">
              <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)] animate-pulse" />
              <span className="text-[10px] text-green-400 font-mono-tech tracking-wider">{stats.active} AGENTS ACTIVE</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2 mb-3">
          {[
            { label: 'Total Agents', value: stats.total, icon: Bot, color: 'purple' },
            { label: 'Active Now', value: stats.active, icon: Activity, color: 'green' },
            { label: 'Idle', value: stats.idle, icon: Clock, color: 'amber' },
            { label: 'Teams', value: teams.length, icon: Layers, color: 'cyan' },
            { label: 'Avg Success', value: `${stats.avgSuccessRate}%`, icon: TrendingUp, color: 'blue' },
          ].map(s => (
            <div key={s.label} className="bg-stonic-card border border-stonic-b1 rounded-xl p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <s.icon size={11} className={`text-${s.color}-400`} />
                <span className="text-[7px] text-stonic-textDim font-mono-tech tracking-wider">{s.label}</span>
              </div>
              <span className="text-lg font-bold text-white font-mono-tech">{s.value}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-1 bg-stonic-card border border-stonic-b1 rounded-lg p-1">
            {['all', 'active', 'busy', 'idle', 'offline'].map(f => (
              <button key={f} onClick={() => setFilterStatus(f)} className={`px-3 py-1 rounded-md text-[9px] font-mono-tech tracking-wider transition-all ${
                filterStatus === f ? 'bg-purple-400/10 text-purple-400' : 'text-stonic-textMuted hover:text-stonic-text'
              }`}>{f.toUpperCase()}</button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stonic-textDim" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search agents..." className="w-full pl-7 pr-3 py-1.5 rounded-md bg-stonic-card border border-stonic-b1 text-[10px] text-stonic-text font-mono-tech placeholder:text-stonic-textDim focus:outline-none focus:border-purple-400/40" />
          </div>
        </div>

        <div className="flex-1 grid grid-cols-2 gap-3 overflow-y-auto min-h-0 content-start">
          {filteredAgents.length === 0 && (
            <div className="col-span-2 flex flex-col items-center justify-center py-12 text-center">
              <Bot size={32} className="text-stonic-textDim mb-3" />
              <p className="text-xs text-stonic-textDim font-mono-tech">No agents found</p>
              <p className="text-[9px] text-stonic-textMuted mt-1">
                {agents.length === 0 ? 'No agents have been created yet. Use the Agent Factory to create specialized agents.' : 'Try adjusting your filters or search query.'}
              </p>
            </div>
          )}
          {filteredAgents.map(agent => (
            <button
              key={agent.id}
              onClick={() => setSelectedAgent(agent)}
              className={`text-left p-3 rounded-xl border transition-all duration-300 cursor-pointer ${
                selectedAgent?.id === agent.id
                  ? 'bg-purple-400/5 border-purple-400/40 shadow-[0_0_15px_rgba(168,85,247,0.1)]'
                  : 'bg-stonic-card border-stonic-b1 hover:border-purple-400/20 hover:bg-stonic-hover/20'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    agent.type === 'hybrid' ? 'bg-gradient-to-br from-purple-500/20 to-amber-500/20 border border-purple-400/40' : 'bg-purple-500/10 border border-purple-400/30'
                  }`}>
                    {agent.type === 'hybrid' ? <Users size={16} className="text-purple-400" /> : <Bot size={16} className="text-purple-400" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-stonic-text font-mono-tech">{agent.name}</span>
                      <span className="text-[7px] text-stonic-textDim px-1 rounded bg-stonic-surface/50 font-mono-tech">{agent.type}</span>
                    </div>
                    <span className="text-[8px] text-stonic-textMuted font-mono-tech">{agent.role}</span>
                  </div>
                </div>
                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[7px] font-mono-tech ${
                  agent.status === 'active' ? 'bg-green-500/10 text-green-400' :
                  agent.status === 'busy' ? 'bg-amber-500/10 text-amber-400' :
                  agent.status === 'idle' ? 'bg-blue-500/10 text-blue-400' :
                  'bg-red-500/10 text-red-400'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${agent.status === 'active' ? 'bg-green-400 animate-pulse shadow-[0_0_4px_rgba(74,222,128,0.8)]' : agent.status === 'busy' ? 'bg-amber-400' : 'bg-blue-400'}`} />
                  {agent.status.toUpperCase()}
                </div>
              </div>
              {agent.currentTask && (
                <div className="text-[8px] text-stonic-textDim font-mono-tech mb-2 flex items-center gap-1">
                  <GitBranch size={10} />
                  <span className="truncate">{agent.currentTask}</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-[8px]">
                <span className="text-stonic-textDim font-mono-tech">Success: <span className="text-green-400">{agent.successRate}%</span></span>
                <span className="text-stonic-textDim font-mono-tech">Tasks: <span className="text-stonic-textMuted">{agent.tasksCompleted.toLocaleString()}</span></span>
                {agent.teamName && <span className="text-purple-400 font-mono-tech">{agent.teamName}</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {agent.capabilities.slice(0, 3).map(cap => (
                  <span key={cap} className="px-1.5 py-0.5 rounded bg-stonic-surface border border-stonic-b1 text-[6px] text-stonic-textMuted font-mono-tech">{cap}</span>
                ))}
                {agent.capabilities.length > 3 && <span className="text-[6px] text-stonic-textDim font-mono-tech">+{agent.capabilities.length - 3}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedAgent && (
        <div className="w-[320px] shrink-0 bg-stonic-card border border-stonic-b1 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-stonic-text font-mono-tech tracking-wider">AGENT DETAILS</span>
            <button onClick={() => setSelectedAgent(null)} className="p-1 rounded hover:bg-stonic-hover text-stonic-textMuted"><X size={14} /></button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl bg-purple-500/10 border border-purple-400/40 flex items-center justify-center">
              <Bot size={24} className="text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white font-mono-tech">{selectedAgent.name}</h3>
              <p className="text-[9px] text-stonic-textMuted">{selectedAgent.role}</p>
            </div>
          </div>
          <div className="space-y-2 text-[9px] font-mono-tech">
            <div className="flex justify-between"><span className="text-stonic-textDim">Status</span><span className={`${selectedAgent.status === 'active' ? 'text-green-400' : selectedAgent.status === 'busy' ? 'text-amber-400' : 'text-blue-400'}`}>{selectedAgent.status.toUpperCase()}</span></div>
            <div className="flex justify-between"><span className="text-stonic-textDim">Type</span><span className="text-stonic-textMuted">{selectedAgent.type.toUpperCase()}</span></div>
            <div className="flex justify-between"><span className="text-stonic-textDim">Team</span><span className="text-purple-400">{selectedAgent.teamName || 'Unassigned'}</span></div>
            <div className="flex justify-between"><span className="text-stonic-textDim">Success Rate</span><span className="text-green-400">{selectedAgent.successRate}%</span></div>
            <div className="flex justify-between"><span className="text-stonic-textDim">Tasks Completed</span><span className="text-stonic-textMuted">{selectedAgent.tasksCompleted.toLocaleString()}</span></div>
          </div>
          <div>
            <span className="text-[8px] text-stonic-textDim font-mono-tech">CAPABILITIES</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {selectedAgent.capabilities.map(cap => (
                <span key={cap} className="px-2 py-1 rounded bg-purple-400/5 border border-purple-400/20 text-[7px] text-purple-400 font-mono-tech">{cap}</span>
              ))}
            </div>
          </div>
          {selectedAgent.currentTask && (
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <span className="text-[8px] text-amber-400 font-mono-tech">CURRENT TASK</span>
              <p className="text-[9px] text-stonic-text mt-0.5">{selectedAgent.currentTask}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AIWorkforceDashboard;

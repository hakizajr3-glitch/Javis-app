import React, { useState, useEffect } from 'react';
import { Plug, Link2, Mail, Calendar, Cloud, Database, GitBranch, Code2, Shield, Zap, CheckCircle2, ExternalLink, FileText, MessageSquare, Video, Search, Clock, X } from 'lucide-react';
import { coreBridge } from '../../coreBridge';
import { IntegrationAuthModal } from '../IntegrationAuthModal';
import { initiateComposioAuthLink, openComposioAuthLink } from '../../composioAuth';

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  connected: boolean;
  status: 'connected' | 'disconnected' | 'error' | 'configuring';
  lastSync?: Date;
  popular: boolean;
  composioAuthConfigId?: string;
}

// Real integration registry via coreBridge (persisted across restarts)
const integrations: Integration[] = coreBridge.getIntegrations();

const categories = ['All', 'Communication', 'Calendar & Scheduling', 'Cloud Storage', 'Development', 'Productivity', 'CRM & Business', 'AI & Automation', 'Video & Meetings'];

const getIcon = (iconName: string) => {
  const map: Record<string, React.ReactNode> = {
    mail: <Mail size={16} />,
    message: <MessageSquare size={16} />,
    calendar: <Calendar size={16} />,
    cloud: <Cloud size={16} />,
    git: <GitBranch size={16} />,
    code: <Code2 size={16} />,
    file: <FileText size={16} />,
    database: <Database size={16} />,
    shield: <Shield size={16} />,
    zap: <Zap size={16} />,
    video: <Video size={16} />,
  };
  return map[iconName] || <Plug size={16} />;
};

export const IntegrationsDashboard: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [integrationList, setIntegrationList] = useState<Integration[]>(integrations);
  const [authIntegration, setAuthIntegration] = useState<Integration | null>(null);
  useEffect(() => { coreBridge.saveIntegrations(integrationList); }, [integrationList]);
  const filtered = integrationList.filter(i => {
    const matchesCat = activeCategory === 'All' || i.category === activeCategory;
    const matchesSearch = i.name.toLowerCase().includes(searchQuery.toLowerCase()) || i.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const connectedCount = integrationList.filter(i => i.connected).length;

  const startAuth = async (integration: Integration) => {
    setIntegrationList(prev => prev.map(i =>
      i.id === integration.id ? { ...i, status: 'configuring' } : i
    ));
    const apiKey = localStorage.getItem('composio_api_key');
    const authConfigId = integration.composioAuthConfigId;
    if (apiKey?.trim() && authConfigId?.trim()) {
      try {
        const linkUrl = await initiateComposioAuthLink({
          apiKey: apiKey.trim(),
          authConfigId: authConfigId.trim(),
          userId: localStorage.getItem('composio_user_id') ?? `jarvis-user-${Math.random().toString(36).substring(2, 10)}`,
          callbackUrl: 'https://localhost/callback',
        });
        await openComposioAuthLink(linkUrl);
      } catch {
        setAuthIntegration(integration);
      }
    } else {
      setAuthIntegration(integration);
    }
  };

  const disconnect = (id: string) => {
    setIntegrationList(prev => prev.map(i =>
      i.id === id ? { ...i, connected: false, status: 'disconnected', lastSync: undefined } : i
    ));
  };

  const completeConnection = (id: string) => {
    setIntegrationList(prev => prev.map(i =>
      i.id === id ? { ...i, connected: true, status: 'connected', lastSync: new Date() } : i
    ));
    setAuthIntegration(null);
  };

  return (
    <div className="flex-1 flex gap-4 min-h-0">
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500/20 to-green-500/10 border border-teal-400/40 flex items-center justify-center shadow-[0_0_20px_rgba(45,212,191,0.2)]">
              <Plug size={22} className="text-teal-400" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-wider text-white font-orbitron">INTEGRATIONS</h2>
              <span className="text-[9px] text-stonic-textDim tracking-[0.2em] uppercase font-mono-tech">Connect Your Business Tools</span>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-400/5 border border-teal-400/20">
            <Link2 size={14} className="text-teal-400" />
            <span className="text-[10px] text-teal-400 font-mono-tech tracking-wider">{connectedCount}/{integrationList.length} CONNECTED</span>
          </div>
        </div>

        {/* Search & Categories */}
        <div className="flex items-center gap-3 mb-3">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stonic-textDim" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search integrations..." className="w-full pl-7 pr-3 py-1.5 rounded-md bg-stonic-card border border-stonic-b1 text-[10px] text-stonic-text font-mono-tech placeholder:text-stonic-textDim focus:outline-none focus:border-teal-400/40" />
          </div>
        </div>

        {/* Category Pills */}          <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1 scrollbar-thin">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 rounded-full text-[8px] font-mono-tech tracking-wider whitespace-nowrap transition-all ${
                activeCategory === cat ? 'bg-teal-400/10 text-teal-400 border border-teal-400/30' : 'bg-stonic-card border border-stonic-b1 text-stonic-textMuted hover:text-stonic-text'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Integration Grid */}
        <div className="flex-1 grid grid-cols-3 gap-2.5 overflow-y-auto min-h-0 content-start">
          {filtered.map(integration => (
            <button
              key={integration.id}
              onClick={() => setSelectedIntegration(integration)}
              className={`text-left p-3 rounded-xl border transition-all duration-300 cursor-pointer group ${
                selectedIntegration?.id === integration.id
                  ? 'bg-teal-400/5 border-teal-400/40 shadow-[0_0_15px_rgba(45,212,191,0.1)]'
                  : integration.connected
                    ? 'bg-stonic-card border-green-400/30 hover:border-teal-400/30'
                    : 'bg-stonic-card border-stonic-b1 hover:border-teal-400/20'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  integration.connected ? 'bg-green-500/10 border border-green-400/30' : 'bg-teal-500/10 border border-teal-400/30'
                }`}>
                  <span className={integration.connected ? 'text-green-400' : 'text-teal-400'}>
                    {getIcon(integration.icon)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {integration.popular && <span className="px-1.5 py-0.5 rounded text-[6px] bg-amber-500/10 text-amber-400 font-mono-tech">POPULAR</span>}
                  <div className={`w-2 h-2 rounded-full ${
                    integration.connected ? 'bg-green-400 shadow-[0_0_4px_rgba(74,222,128,0.8)]' : 'bg-stonic-textDim'
                  }`} />
                </div>
              </div>
              <h3 className="text-[10px] font-bold text-stonic-text font-mono-tech mb-0.5">{integration.name}</h3>
              <p className="text-[7px] text-stonic-textMuted leading-relaxed mb-2">{integration.description}</p>
              <div className="flex items-center gap-1 text-[7px]">
                {integration.connected ? (
                  <span className="flex items-center gap-1 text-green-400 font-mono-tech">
                    <CheckCircle2 size={9} /> CONNECTED
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-stonic-textDim font-mono-tech group-hover:text-teal-400 transition-colors">
                    <Plug size={9} /> CONNECT
                  </span>
                )}
                {integration.connected && integration.lastSync && (
                  <span className="text-stonic-textDim flex items-center gap-0.5">
                    <Clock size={8} /> Synced
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Integration Detail Panel */}
      {selectedIntegration && (
        <div className="w-[320px] shrink-0 bg-stonic-card border border-stonic-b1 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-stonic-text font-mono-tech tracking-wider">DETAILS</span>
            <button onClick={() => setSelectedIntegration(null)} className="p-1 rounded hover:bg-stonic-hover text-stonic-textMuted"><X size={14} /></button>
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
              selectedIntegration.connected ? 'bg-green-500/10 border border-green-400/40' : 'bg-teal-500/10 border border-teal-400/40'
            }`}>
              <span className={selectedIntegration.connected ? 'text-green-400' : 'text-teal-400'}>
                {getIcon(selectedIntegration.icon)}
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white font-mono-tech">{selectedIntegration.name}</h3>
              <p className="text-[9px] text-stonic-textMuted">{selectedIntegration.category}</p>
            </div>
          </div>
          <p className="text-[9px] text-stonic-textMuted leading-relaxed">{selectedIntegration.description}</p>
          <div className="space-y-2 text-[9px] font-mono-tech">
            <div className="flex justify-between"><span className="text-stonic-textDim">Status</span><span className={selectedIntegration.connected ? 'text-green-400' : 'text-stonic-textMuted'}>{selectedIntegration.status.toUpperCase()}</span></div>
            <div className="flex justify-between"><span className="text-stonic-textDim">Category</span><span className="text-stonic-textMuted">{selectedIntegration.category}</span></div>
            {selectedIntegration.lastSync && (
              <div className="flex justify-between"><span className="text-stonic-textDim">Last Sync</span><span className="text-stonic-textMuted">{selectedIntegration.lastSync.toLocaleTimeString()}</span></div>
            )}
          </div>
          <button
            onClick={() => selectedIntegration.connected ? disconnect(selectedIntegration.id) : startAuth(selectedIntegration)}
            className={`w-full py-2 rounded-lg font-mono-tech text-[10px] font-bold tracking-wider transition-all ${
              selectedIntegration.connected
                ? 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'
                : 'bg-teal-400/20 border border-teal-400/40 text-teal-400 hover:bg-teal-400/30'
            }`}
          >
            {selectedIntegration.connected ? 'DISCONNECT' : 'CONNECT'}
          </button>
          <button className="w-full py-2 rounded-lg bg-stonic-surface border border-stonic-b1 text-stonic-textMuted font-mono-tech text-[10px] font-bold tracking-wider hover:bg-stonic-hover transition-all flex items-center justify-center gap-1.5">
            <ExternalLink size={12} /> OPEN DOCUMENTATION
          </button>
        </div>
      )}

      {authIntegration && (
        <IntegrationAuthModal
          integration={authIntegration}
          onClose={() => setAuthIntegration(null)}
          onConnected={() => completeConnection(authIntegration.id)}
          onSave={(authConfigId) => {
            setIntegrationList(prev => prev.map(i =>
              i.id === authIntegration.id ? { ...i, composioAuthConfigId: authConfigId } : i
            ));
          }}
        />
      )}
    </div>
  );
};

export default IntegrationsDashboard;

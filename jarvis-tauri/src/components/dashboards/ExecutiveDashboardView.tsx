import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Activity, AlertTriangle, CheckCircle2, Users, Zap, Shield, Bell, RefreshCw, Download, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { coreBridge } from '../../coreBridge';

interface Metric {
  id: string;
  name: string;
  value: number;
  category: string;
  trend: 'up' | 'down' | 'stable';
  change: number;
}

interface AlertItem {
  id: string;
  type: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

// Real metrics via coreBridge (mirrored from jarvis-core managers + persisted).
// Held in state and re-read on refresh so manager-derived values reach the UI.
const seedMetrics: Metric[] = coreBridge.getMetrics();

// Real alerts via coreBridge (persisted across restarts)
const alerts: AlertItem[] = coreBridge.getAlerts();

export const ExecutiveDashboardView: React.FC = () => {
  const [metrics, setMetrics] = useState<Metric[]>(seedMetrics);
  const [dashboardAlerts, setDashboardAlerts] = useState<AlertItem[]>(alerts);
  useEffect(() => { coreBridge.saveAlerts(dashboardAlerts); }, [dashboardAlerts]);
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');

  // Re-read live metrics when the bridge refreshes them from the managers.
  useEffect(() => {
    const unsub = coreBridge.subscribeMetricsRefresh(() => {
      setMetrics([...coreBridge.getMetrics()]);
    });
    return unsub;
  }, []);

  const acknowledgeAlert = (id: string) => {
    setDashboardAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
  };

  const unacknowledgedCount = dashboardAlerts.filter(a => !a.acknowledged).length;

  return (
    <div className="flex-1 flex gap-4 min-h-0">
      <div className="flex-1 flex flex-col min-h-0 gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-400/40 flex items-center justify-center shadow-[0_0_20px_rgba(52,211,153,0.2)]">
              <LayoutDashboard size={22} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-wider text-white font-orbitron">EXECUTIVE DASHBOARD</h2>
              <span className="text-[9px] text-stonic-textDim tracking-[0.2em] uppercase font-mono-tech">Oversight &amp; Analytics</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-stonic-card border border-stonic-b1 rounded-lg p-1">
              {(['24h', '7d', '30d'] as const).map(r => (
                <button key={r} onClick={() => setTimeRange(r)} className={`px-3 py-1 rounded-md text-[9px] font-mono-tech tracking-wider transition-all ${
                  timeRange === r ? 'bg-emerald-400/10 text-emerald-400' : 'text-stonic-textMuted hover:text-stonic-text'
                }`}>{r}</button>
              ))}
            </div>
            <button className="p-2 rounded-lg bg-stonic-card border border-stonic-b1 text-stonic-textMuted hover:text-stonic-text transition-colors">
              <Download size={14} />
            </button>
            <button className="p-2 rounded-lg bg-stonic-card border border-stonic-b1 text-stonic-textMuted hover:text-stonic-text transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Workforce Efficiency', value: '97.8%', sub: '+2.1% this week', icon: Users, color: 'emerald', trend: 'up' },
            { label: 'Task Success Rate', value: '94.2%', sub: '47 tasks today', icon: CheckCircle2, color: 'blue', trend: 'up' },
            { label: 'Active Missions', value: '5', sub: '3 queued', icon: Zap, color: 'amber', trend: 'stable' },
            { label: 'System Health', value: '99.97%', sub: 'All systems nominal', icon: Shield, color: 'green', trend: 'up' },
          ].map(kpi => (
            <div key={kpi.label} className="bg-stonic-card border border-stonic-b1 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <kpi.icon size={14} className={`text-${kpi.color}-400`} />
                <span className={`flex items-center gap-0.5 text-[8px] font-mono-tech ${
                  kpi.trend === 'up' ? 'text-green-400' : kpi.trend === 'down' ? 'text-red-400' : 'text-stonic-textDim'
                }`}>
                  {kpi.trend === 'up' ? <ArrowUp size={10} /> : kpi.trend === 'down' ? <ArrowDown size={10} /> : <Minus size={10} />}
                </span>
              </div>
              <span className="text-2xl font-bold text-white font-mono-tech block">{kpi.value}</span>
              <span className="text-[8px] text-stonic-textDim font-mono-tech">{kpi.sub}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
          <div className="bg-stonic-card border border-stonic-b1 rounded-xl p-3 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Users size={12} className="text-emerald-400" />
              <span className="text-[9px] font-bold text-stonic-text font-mono-tech tracking-wider">WORKFORCE</span>
            </div>
            <div className="space-y-1.5 flex-1">
              {metrics.filter(m => m.category === 'workforce').map(m => (
                <div key={m.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-stonic-hover/20 transition-colors">
                  <span className="text-[9px] text-stonic-textMuted font-mono-tech">{m.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-white font-mono-tech">{m.value}{m.name.includes('Efficiency') || m.name.includes('Rate') ? '%' : ''}</span>
                    <span className={`flex items-center text-[7px] font-mono-tech ${m.trend === 'up' ? 'text-green-400' : m.trend === 'down' ? 'text-red-400' : 'text-stonic-textDim'}`}>
                      {m.trend === 'up' ? <ArrowUp size={8} /> : m.trend === 'down' ? <ArrowDown size={8} /> : <Minus size={8} />}
                      {m.change !== 0 && `${m.change > 0 ? '+' : ''}${m.change}%`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-stonic-card border border-stonic-b1 rounded-xl p-3 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={12} className="text-amber-400" />
              <span className="text-[9px] font-bold text-stonic-text font-mono-tech tracking-wider">MISSIONS</span>
            </div>
            <div className="space-y-1.5 flex-1">
              {metrics.filter(m => m.category === 'mission').map(m => (
                <div key={m.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-stonic-hover/20 transition-colors">
                  <span className="text-[9px] text-stonic-textMuted font-mono-tech">{m.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-white font-mono-tech">{m.value}</span>
                    <span className={`flex items-center text-[7px] font-mono-tech ${m.trend === 'up' ? 'text-green-400' : m.trend === 'down' ? 'text-red-400' : 'text-stonic-textDim'}`}>
                      {m.trend === 'up' ? <ArrowUp size={8} /> : m.trend === 'down' ? <ArrowDown size={8} /> : <Minus size={8} />}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-stonic-card border border-stonic-b1 rounded-xl p-3 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 size={12} className="text-blue-400" />
              <span className="text-[9px] font-bold text-stonic-text font-mono-tech tracking-wider">TASKS</span>
            </div>
            <div className="space-y-1.5 flex-1">
              {metrics.filter(m => m.category === 'task').map(m => (
                <div key={m.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-stonic-hover/20 transition-colors">
                  <span className="text-[9px] text-stonic-textMuted font-mono-tech">{m.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-white font-mono-tech">{m.value}{m.name.includes('Rate') ? '%' : ''}</span>
                    <span className={`flex items-center text-[7px] font-mono-tech ${m.trend === 'up' ? 'text-green-400' : m.trend === 'down' ? 'text-red-400' : 'text-stonic-textDim'}`}>
                      {m.trend === 'up' ? <ArrowUp size={8} /> : m.trend === 'down' ? <ArrowDown size={8} /> : <Minus size={8} />}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-stonic-card border border-stonic-b1 rounded-xl p-3 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Activity size={12} className="text-purple-400" />
              <span className="text-[9px] font-bold text-stonic-text font-mono-tech tracking-wider">SYSTEM</span>
            </div>
            <div className="space-y-1.5 flex-1">
              {metrics.filter(m => m.category === 'system').map(m => (
                <div key={m.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-stonic-hover/20 transition-colors">
                  <span className="text-[9px] text-stonic-textMuted font-mono-tech">{m.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-white font-mono-tech">{m.value}{m.name.includes('ms') ? 'ms' : m.name.includes('Uptime') ? '%' : ''}</span>
                    <span className={`flex items-center text-[7px] font-mono-tech ${m.trend === 'up' ? 'text-green-400' : m.trend === 'down' ? 'text-red-400' : 'text-stonic-textDim'}`}>
                      {m.trend === 'up' ? <ArrowUp size={8} /> : m.trend === 'down' ? <ArrowDown size={8} /> : <Minus size={8} />}
                      {m.change !== 0 && m.name.includes('ms') && `${m.change}ms`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="w-[300px] shrink-0 bg-stonic-card border border-stonic-b1 rounded-xl flex flex-col min-h-0">
        <div className="p-3 border-b border-stonic-b1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-amber-400" />
            <span className="text-[10px] font-bold text-stonic-text font-mono-tech tracking-wider">ALERTS</span>
          </div>
          {unacknowledgedCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-[8px] text-red-400 font-mono-tech">{unacknowledgedCount} new</span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {dashboardAlerts.map(alert => (
            <button
              key={alert.id}
              onClick={() => setSelectedAlert(alert)}
              className={`w-full text-left p-3 border-b border-stonic-b1/30 hover:bg-stonic-hover/20 transition-colors ${
                selectedAlert?.id === alert.id ? 'bg-amber-400/5 border-l-2 border-l-amber-400' : ''
              } ${!alert.acknowledged ? 'bg-red-500/5' : ''}`}
            >
              <div className="flex items-start gap-2">
                <div className={`mt-0.5 w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                  alert.type === 'critical' ? 'bg-red-500/10 border border-red-500/30' :
                  alert.type === 'warning' ? 'bg-amber-500/10 border border-amber-500/30' :
                  alert.type === 'error' ? 'bg-red-500/10 border border-red-500/30' :
                  'bg-blue-500/10 border border-blue-500/30'
                }`}>
                  {alert.type === 'critical' ? <AlertTriangle size={12} className="text-red-400" /> :
                   alert.type === 'warning' ? <AlertTriangle size={12} className="text-amber-400" /> :
                   alert.type === 'error' ? <AlertTriangle size={12} className="text-red-400" /> :
                   <Bell size={12} className="text-blue-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-semibold text-stonic-text font-mono-tech truncate">{alert.title}</span>
                    {!alert.acknowledged && <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />}
                  </div>
                  <p className="text-[7px] text-stonic-textMuted truncate mt-0.5">{alert.message}</p>
                  <span className="text-[7px] text-stonic-textDim font-mono-tech mt-1 block">{alert.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
        {selectedAlert && (
          <div className="p-3 border-t border-stonic-b1">
            <p className="text-[9px] text-stonic-textMuted mb-2">{selectedAlert.message}</p>
            {!selectedAlert.acknowledged && (
              <button onClick={() => acknowledgeAlert(selectedAlert.id)} className="w-full py-1.5 rounded-md bg-emerald-400/10 border border-emerald-400/30 text-emerald-400 text-[8px] font-mono-tech font-bold hover:bg-emerald-400/20 transition-all">
                ACKNOWLEDGE
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ExecutiveDashboardView;

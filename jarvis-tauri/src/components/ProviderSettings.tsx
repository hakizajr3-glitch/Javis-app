/**
 * ProviderSettings — Multi-provider configuration UI.
 *
 * Shows a grid of all supported AI providers. User picks one, enters their
 * API key, selects a model, and clicks Connect. The config is saved and
 * the app is ready to use.
 *
 * Also serves as the first-run wizard — if no provider is configured,
 * this component shows full-screen on app launch.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, Check, ExternalLink, Loader2, Search, Zap, Gift, Server, Shield } from 'lucide-react';
import { PROVIDERS, ProviderId, ProviderDefinition, getAllProviders, getProviderModels } from '../providers/providerRegistry';
import { loadProviderConfig, saveProviderConfig, ProviderConfig } from '../providers/providerConfig';
import { getAdapter } from '../providers/providerAdapters';

interface ProviderSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: () => void;
  /** When true, renders as a full-screen wizard (first-run) instead of a modal */
  firstRun?: boolean;
}

export const ProviderSettings: React.FC<ProviderSettingsProps> = ({ isOpen, onClose, onConnected, firstRun }) => {
  const [config, setConfig] = useState<ProviderConfig>(loadProviderConfig());
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>(config.provider);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [selectedModel, setSelectedModel] = useState(config.model);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'free' | 'local'>('all');

  const providers = getAllProviders();
  const currentProviderDef = PROVIDERS[selectedProvider];
  const models = getProviderModels(selectedProvider);

  // Filter providers
  const filteredProviders = providers.filter(p => {
    const matchesFilter = filter === 'all' || (filter === 'free' && p.free) || (filter === 'local' && p.local);
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // When provider changes, update the model to the provider's default
  useEffect(() => {
    if (selectedProvider !== config.provider) {
      const newModels = getProviderModels(selectedProvider);
      const fastModel = newModels.find(m => m.fast) || newModels[0];
      setSelectedModel(fastModel?.id || '');
      setApiKey(''); // Clear key when switching providers
      setTestResult('idle');
    }
  }, [selectedProvider, config.provider]);

  const handleConnect = useCallback(async () => {
    setTesting(true);
    setTestResult('idle');

    const newConfig: ProviderConfig = {
      provider: selectedProvider,
      apiKey: apiKey.trim(),
      model: selectedModel,
      deepModel: models.find(m => m.deep)?.id || selectedModel,
    };

    try {
      const adapter = getAdapter(selectedProvider);
      const ok = await adapter.testConnectivity({
        apiKey: apiKey.trim(),
        model: selectedModel,
        baseUrl: currentProviderDef.baseUrl,
      });

      if (ok) {
        saveProviderConfig(newConfig);
        setConfig(newConfig);
        setTestResult('success');
        setTimeout(() => {
          onConnected?.();
          onClose();
        }, 800);
      } else {
        setTestResult('error');
      }
    } catch {
      setTestResult('error');
    } finally {
      setTesting(false);
    }
  }, [selectedProvider, apiKey, selectedModel, models, currentProviderDef, onConnected, onClose]);

  const handleSkip = useCallback(() => {
    // Save without testing (user can configure later)
    saveProviderConfig({
      provider: selectedProvider,
      apiKey: apiKey.trim(),
      model: selectedModel,
      deepModel: models.find(m => m.deep)?.id || selectedModel,
    });
    onClose();
  }, [selectedProvider, apiKey, selectedModel, models, onClose]);

  if (!isOpen) return null;

  // ─── First-run wizard (full screen) ──────────────────────────────────────
  if (firstRun) {
    return (
      <div className="fixed inset-0 z-[100] bg-gradient-to-br from-stonic-bg via-stonic-surface to-stonic-bg flex items-center justify-center">
        <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto p-8">
          {/* Logo / Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/10 border border-cyan-400/40 mb-4 shadow-[0_0_30px_rgba(0,212,255,0.3)]">
              <Zap size={32} className="text-cyan-400" />
            </div>
            <h1 className="text-3xl font-black tracking-wider text-white font-orbitron mb-2">J.A.R.V.I.S.</h1>
            <p className="text-sm text-stonic-textDim tracking-wide">Choose your AI provider to get started</p>
          </div>

          <ProviderGrid
            providers={filteredProviders}
            selectedProvider={selectedProvider}
            onSelect={setSelectedProvider}
            filter={filter}
            setFilter={setFilter}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />

          <ProviderConfigForm
            providerDef={currentProviderDef}
            apiKey={apiKey}
            setApiKey={setApiKey}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            models={models}
            testing={testing}
            testResult={testResult}
            onConnect={handleConnect}
            onSkip={handleSkip}
            isFirstRun
          />
        </div>
      </div>
    );
  }

  // ─── Modal (settings) ────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={onClose}
      style={{ animation: 'fadeIn 0.2s ease-out' }}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-stonic-b1 bg-stonic-card shadow-2xl"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'scaleIn 0.2s ease-out' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-stonic-b1">
          <div>
            <h2 className="text-lg font-bold text-white font-mono-tech tracking-wide">AI Provider Settings</h2>
            <p className="text-xs text-stonic-textDim mt-0.5">Choose your AI provider and configure your API key</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-stonic-hover text-stonic-textDim">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <ProviderGrid
            providers={filteredProviders}
            selectedProvider={selectedProvider}
            onSelect={setSelectedProvider}
            filter={filter}
            setFilter={setFilter}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />

          <ProviderConfigForm
            providerDef={currentProviderDef}
            apiKey={apiKey}
            setApiKey={setApiKey}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            models={models}
            testing={testing}
            testResult={testResult}
            onConnect={handleConnect}
            onSkip={handleSkip}
          />
        </div>

        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        `}</style>
      </div>
    </div>
  );
};

// ─── Provider Grid (sub-component) ──────────────────────────────────────────

const ProviderGrid: React.FC<{
  providers: ProviderDefinition[];
  selectedProvider: ProviderId;
  onSelect: (id: ProviderId) => void;
  filter: 'all' | 'free' | 'local';
  setFilter: (f: 'all' | 'free' | 'local') => void;
  searchQuery: string;
  setSearchQuery: (s: string) => void;
}> = ({ providers, selectedProvider, onSelect, filter, setFilter, searchQuery, setSearchQuery }) => (
  <div>
    {/* Filter + Search */}
    <div className="flex items-center gap-2 mb-3">
      <div className="flex items-center gap-1 bg-stonic-surface border border-stonic-b1 rounded-lg p-1">
        {(['all', 'free', 'local'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-md text-[10px] font-mono-tech tracking-wider transition-all ${
              filter === f ? 'bg-cyan-400/10 text-cyan-400' : 'text-stonic-textMuted hover:text-stonic-text'
            }`}
          >
            {f === 'all' && 'ALL'}
            {f === 'free' && <span className="flex items-center gap-1"><Gift size={9} /> FREE</span>}
            {f === 'local' && <span className="flex items-center gap-1"><Server size={9} /> LOCAL</span>}
          </button>
        ))}
      </div>
      <div className="relative flex-1">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stonic-textDim" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search providers..."
          className="w-full pl-7 pr-3 py-1.5 rounded-md bg-stonic-surface border border-stonic-b1 text-[11px] text-stonic-text font-mono-tech placeholder:text-stonic-textDim focus:outline-none focus:border-cyan-400/40"
        />
      </div>
    </div>

    {/* Provider Grid */}
    <div className="grid grid-cols-3 gap-2">
      {providers.map(p => (
        <button
          key={p.id}
          onClick={() => onSelect(p.id)}
          className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
            selectedProvider === p.id
              ? 'bg-cyan-400/5 border-cyan-400/40 shadow-[0_0_15px_rgba(0,212,255,0.1)]'
              : 'bg-stonic-surface border-stonic-b1 hover:border-cyan-400/20 hover:bg-stonic-hover/20'
          }`}
        >
          <div className="flex items-start justify-between mb-1">
            <span className="text-[11px] font-bold text-stonic-text font-mono-tech">{p.name}</span>
            <div className="flex gap-1">
              {p.free && <Gift size={10} className="text-emerald-400" />}
              {p.local && <Server size={10} className="text-purple-400" />}
            </div>
          </div>
          <p className="text-[8px] text-stonic-textMuted line-clamp-2 leading-tight">{p.description}</p>
        </button>
      ))}
    </div>
  </div>
);

// ─── Config Form (sub-component) ────────────────────────────────────────────

const ProviderConfigForm: React.FC<{
  providerDef: ProviderDefinition;
  apiKey: string;
  setApiKey: (s: string) => void;
  selectedModel: string;
  setSelectedModel: (s: string) => void;
  models: { id: string; name: string; fast?: boolean; deep?: boolean }[];
  testing: boolean;
  testResult: 'idle' | 'success' | 'error';
  onConnect: () => void;
  onSkip: () => void;
  isFirstRun?: boolean;
}> = ({ providerDef, apiKey, setApiKey, selectedModel, setSelectedModel, models, testing, testResult, onConnect, onSkip, isFirstRun }) => (
  <div className="space-y-4 p-4 rounded-xl bg-stonic-surface/50 border border-stonic-b1">
    {/* Selected provider info */}
    <div className="flex items-center justify-between">
      <div>
        <span className="text-sm font-bold text-white font-mono-tech">{providerDef.name}</span>
        <p className="text-[10px] text-stonic-textDim mt-0.5">{providerDef.description}</p>
      </div>
      {providerDef.apiKeyUrl && (
        <a
          href={providerDef.apiKeyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-cyan-400/10 border border-cyan-400/20 text-[10px] text-cyan-400 hover:bg-cyan-400/20 transition-colors"
        >
          Get API Key <ExternalLink size={10} />
        </a>
      )}
    </div>

    {/* API Key input (hidden for Ollama) */}
    {!providerDef.local && (
      <div>
        <label className="text-[10px] text-stonic-textDim font-mono-tech tracking-wider mb-1 block">API KEY</label>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder={`Enter your ${providerDef.name} API key...`}
          className="w-full px-3 py-2 rounded-lg bg-stonic-bg/50 border border-stonic-b1 text-xs text-stonic-text font-mono-tech placeholder:text-stonic-textDim focus:outline-none focus:border-cyan-400/40 transition-all"
        />
      </div>
    )}

    {/* Ollama info */}
    {providerDef.local && (
      <div className="p-3 rounded-lg bg-purple-400/5 border border-purple-400/20">
        <div className="flex items-center gap-2 mb-1">
          <Shield size={12} className="text-purple-400" />
          <span className="text-[10px] font-bold text-purple-400 font-mono-tech">RUNS LOCALLY — NO API KEY NEEDED</span>
        </div>
        <p className="text-[9px] text-stonic-textDim">
          Install Ollama from <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="text-purple-400 underline">ollama.com</a>,
          then run <code className="text-purple-300">ollama pull {selectedModel}</code> in your terminal.
        </p>
      </div>
    )}

    {/* Model selector */}
    <div>
      <label className="text-[10px] text-stonic-textDim font-mono-tech tracking-wider mb-1 block">MODEL</label>
      <select
        value={selectedModel}
        onChange={e => setSelectedModel(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-stonic-bg/50 border border-stonic-b1 text-xs text-stonic-text font-mono-tech focus:outline-none focus:border-cyan-400/40 transition-all"
      >
        {models.map(m => (
          <option key={m.id} value={m.id} className="bg-stonic-bg text-stonic-text">
            {m.name} {m.fast ? '(Fast)' : m.deep ? '(Deep)' : ''}
          </option>
        ))}
      </select>
    </div>

    {/* Test result */}
    {testResult === 'success' && (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-400/10 border border-emerald-400/20">
        <Check size={14} className="text-emerald-400" />
        <span className="text-[10px] text-emerald-400 font-mono-tech">Connected successfully! JARVIS is ready.</span>
      </div>
    )}
    {testResult === 'error' && (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-red-400/10 border border-red-400/20">
        <X size={14} className="text-red-400" />
        <span className="text-[10px] text-red-400 font-mono-tech">Connection failed. Check your API key and try again.</span>
      </div>
    )}

    {/* Buttons */}
    <div className="flex items-center gap-2">
      <button
        onClick={onConnect}
        disabled={testing || (!providerDef.local && !apiKey.trim())}
        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-400/10 border border-cyan-400/30 text-cyan-400 font-bold text-xs font-mono-tech tracking-wider hover:bg-cyan-400/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        {testing ? <><Loader2 size={14} className="animate-spin" /> TESTING...</> : <><Zap size={14} /> CONNECT</>}
      </button>
      {isFirstRun && (
        <button
          onClick={onSkip}
          className="px-4 py-2.5 rounded-lg bg-stonic-hover border border-stonic-b1 text-stonic-textDim font-mono-tech text-xs hover:text-stonic-text transition-all"
        >
          SKIP FOR NOW
        </button>
      )}
    </div>
  </div>
);

export default ProviderSettings;

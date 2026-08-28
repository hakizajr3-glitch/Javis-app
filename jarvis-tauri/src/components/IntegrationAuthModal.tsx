import React, { useState, useCallback } from 'react';
import { X, ExternalLink, AlertCircle, CheckCircle2, Loader2, Copy, Terminal } from 'lucide-react';
import { openComposioAuthDocs, initiateComposioAuthLink, openComposioAuthLink, openComposioMcp } from '../composioAuth';

interface IntegrationAuthModalProps {
  integration: {
    id: string;
    name: string;
    description: string;
    category: string;
    composioAuthConfigId?: string;
  };
  onClose: () => void;
  onConnected: () => void;
  onSave: (authConfigId: string) => void;
}

const generateUserId = () => `jarvis-user-${Math.random().toString(36).substring(2, 10)}`;

export const IntegrationAuthModal: React.FC<IntegrationAuthModalProps> = ({
  integration,
  onClose,
  onConnected,
  onSave,
}) => {
  const [apiKey, setApiKey] = useState(localStorage.getItem('composio_api_key') ?? '');
  const [authConfigId, setAuthConfigId] = useState(integration.composioAuthConfigId ?? '');
  const [userId] = useState(() => localStorage.getItem('composio_user_id') ?? generateUserId());
  const [callbackUrl, setCallbackUrl] = useState('https://localhost/callback');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  const handleOpenDocs = useCallback(async () => {
    await openComposioAuthDocs(integration.id);
  }, [integration.id]);

  const handleOpenMcp = useCallback(async () => {
    await openComposioMcp();
  }, []);

  const handleGenerateLink = useCallback(async () => {
    setError(null);
    if (!apiKey.trim() || !authConfigId.trim()) {
      setError('Please enter your Composio API key and Auth Config ID.');
      return;
    }
    setLoading(true);
    try {
      localStorage.setItem('composio_api_key', apiKey.trim());
      localStorage.setItem('composio_user_id', userId);
      onSave(authConfigId.trim());
      const url = await initiateComposioAuthLink({
        apiKey: apiKey.trim(),
        authConfigId: authConfigId.trim(),
        userId,
        callbackUrl: callbackUrl.trim(),
      });
      setLinkUrl(url);
      await openComposioAuthLink(url);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to generate auth link. Check your API key and Auth Config ID.');
    } finally {
      setLoading(false);
    }
  }, [apiKey, authConfigId, callbackUrl, userId, onSave]);

  const copyLink = useCallback(() => {
    if (linkUrl) navigator.clipboard.writeText(linkUrl).catch(() => {});
  }, [linkUrl]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[460px] bg-stonic-card border border-stonic-b1 rounded-xl shadow-[0_0_40px_rgba(45,212,191,0.12)] p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white font-mono-tech">Connect {integration.name}</h3>
            <p className="text-[9px] text-stonic-textDim font-mono-tech">{integration.category}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-stonic-hover text-stonic-textDim"><X size={14} /></button>
        </div>

        <p className="text-[10px] text-stonic-textMuted leading-relaxed mb-4">
          This integration uses <span className="text-teal-400 font-semibold">Composio</span> hosted authentication (Connect Link). Enter your Composio API key and the Auth Config ID for {integration.name}, then open the generated link to authorize access in a Composio-hosted window.
        </p>

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-[9px] text-stonic-textDim font-mono-tech uppercase tracking-wider mb-1">Composio API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="composio_api_key_..."
              className="w-full px-3 py-2 rounded-md bg-stonic-surface/50 border border-stonic-b1 text-[11px] text-stonic-text font-mono-tech placeholder:text-stonic-textDim focus:outline-none focus:border-teal-400/50 transition-all"
            />
          </div>
          <div>
            <label className="block text-[9px] text-stonic-textDim font-mono-tech uppercase tracking-wider mb-1">Auth Config ID</label>
            <input
              type="text"
              value={authConfigId}
              onChange={e => setAuthConfigId(e.target.value)}
              placeholder="your_auth_config_id"
              className="w-full px-3 py-2 rounded-md bg-stonic-surface/50 border border-stonic-b1 text-[11px] text-stonic-text font-mono-tech placeholder:text-stonic-textDim focus:outline-none focus:border-teal-400/50 transition-all"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] text-stonic-textDim font-mono-tech uppercase tracking-wider mb-1">User ID</label>
              <input
                type="text"
                value={userId}
                readOnly
                className="w-full px-3 py-2 rounded-md bg-stonic-surface/30 border border-stonic-b1 text-[10px] text-stonic-textDim font-mono-tech"
              />
            </div>
            <div>
              <label className="block text-[9px] text-stonic-textDim font-mono-tech uppercase tracking-wider mb-1">Callback URL</label>
              <input
                type="text"
                value={callbackUrl}
                onChange={e => setCallbackUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-stonic-surface/50 border border-stonic-b1 text-[10px] text-stonic-text font-mono-tech focus:outline-none focus:border-teal-400/50 transition-all"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2 text-[10px] text-red-300 font-mono-tech">
            <AlertCircle size={12} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {linkUrl && (
          <div className="mb-4 p-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-start gap-2">
            <CheckCircle2 size={12} className="text-teal-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-teal-400 font-mono-tech mb-1">Auth link generated</div>
              <div className="flex items-center gap-2">
                <code className="text-[9px] text-stonic-textDim font-mono-tech truncate flex-1">{linkUrl}</code>
                <button onClick={copyLink} className="p-1 rounded hover:bg-stonic-hover text-stonic-textDim"><Copy size={10} /></button>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={handleOpenDocs}
            className="flex-1 py-2 rounded-lg bg-stonic-surface border border-stonic-b1 text-stonic-textMuted font-mono-tech text-[10px] font-bold tracking-wider hover:bg-stonic-hover transition-all flex items-center justify-center gap-1.5"
          >
            <ExternalLink size={12} /> Docs
          </button>
          <button
            onClick={handleOpenMcp}
            className="flex-1 py-2 rounded-lg bg-stonic-surface border border-stonic-b1 text-stonic-textMuted font-mono-tech text-[10px] font-bold tracking-wider hover:bg-stonic-hover transition-all flex items-center justify-center gap-1.5"
          >
            <Terminal size={12} /> MCP
          </button>
          <button
            onClick={handleGenerateLink}
            disabled={loading}
            className="flex-[2] py-2 rounded-lg bg-teal-400/20 border border-teal-400/40 text-teal-400 font-mono-tech text-[10px] font-bold tracking-wider hover:bg-teal-400/30 transition-all disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : null}
            Open Composio Connect Link
          </button>
        </div>

        <button
          onClick={() => { onConnected(); onClose(); }}
          className="w-full py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 font-mono-tech text-[10px] font-bold tracking-wider hover:bg-green-500/20 transition-all flex items-center justify-center gap-1.5"
        >
          <CheckCircle2 size={12} /> Complete Connection
        </button>
      </div>
    </div>
  );
};

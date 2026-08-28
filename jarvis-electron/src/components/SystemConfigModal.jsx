import React, { useState, useEffect } from 'react';
import { Settings, Key, AudioWaveform, Server, Check, Eye, EyeOff, Info, X, Shield, User, Cpu, Volume2 } from 'lucide-react';
import { AIProviderConfig, getAvailableModels, sanitizeModel } from '../aiProviderConfig';
import { ELEVENLABS_VOICES, findJarvisPersona, getJarvisPersona } from '../elevenLabsConfig';

const getSavedCfg = () => {
  try {
    return JSON.parse(localStorage.getItem('jarvis_config') || '{}');
  } catch { return {}; }
};

const saveCfg = (partial) => {
  const current = getSavedCfg();
  const next = { ...current, ...partial };
  localStorage.setItem('jarvis_config', JSON.stringify(next));
};

// Mirror the same Gemini key into the legacy standalone slot so any other
// component that reads `localStorage.getItem('gemini_api_key')` (without JSON
// parsing) sees the same value.
const saveStandaloneKey = (key) => {
  try { localStorage.setItem('gemini_api_key', key); } catch (_) {}
};

// Same dual-write pattern for ElevenLabs so any voice-pipeline fast path
// that does `localStorage.getItem('elevenlabs_api_key')` sees the new key.
const saveStandaloneElevenlabsKey = (key) => {
  try { localStorage.setItem('elevenlabs_api_key', key); } catch (_) {}
};

// Mirror slot for the ElevenLabs voice id — same dual-write contract.
const saveStandaloneElevenlabsVoiceId = (voiceId) => {
  try { localStorage.setItem('elevenlabs_voice_id', voiceId); } catch (_) {}
};

// In Electron's renderer the localStorage path is the source of truth. The
// preload bridge currently exposes `getConfig` only (read-only); a future
// `setConfig` IPC can be added in `main.js` / `preload.js` if we want a
// mirror-on-disk for QA tooling, but it's not required for chat to work.

export const SystemConfigModal = ({ isOpen, onClose }) => {
  const [visible, setVisible] = useState(false);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKey, setApiKey] = useState('');
  // Lazy initializer: resolve the persona from localStorage on the first
  // render (no flicker on a returning user whose saved value differs from
  // DEFAULT_JARVIS_PERSONA).
  const [voicePersona, setVoicePersona] = useState(() => getJarvisPersona());
  const [selectedModel, setSelectedModel] = useState(AIProviderConfig.fastModel);
  // ElevenLabs (streaming TTS). Optional — empty key triggers browser
  // SpeechSynthesis so JARVIS still speaks without one.
  const [elevenlabsKey, setElevenlabsKey] = useState('');
  const [elevenlabsVisible, setElevenlabsVisible] = useState(false);
  // ElevenLabs voice id — empty string means "use the resolver's default
  // (Bella)".
  const [elevenlabsVoiceId, setElevenlabsVoiceId] = useState('');
  const [elevenlabsVoicePreset, setElevenlabsVoicePreset] = useState('default');
  const [saving, setSaving] = useState(false);

  const selectedPreset = ELEVENLABS_VOICES.find((v) => v.id === elevenlabsVoicePreset) || null;

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      const cfg = getSavedCfg();
      setApiKey(cfg.gemini_api_key || '');
      // Single source of truth for persona restore: getJarvisPersona()
      // validates the saved value against the JARVIS_PERSONAS catalog
      // and falls back to DEFAULT_JARVIS_PERSONA on anything else
      // (missing key, hand-edited localStorage, stale entries from an
      // earlier build).
      setVoicePersona(getJarvisPersona());
      // Restore the ElevenLabs key from either the canonical JSON config
      // or the legacy standalone slot.
      const elFromCfg = (cfg.elevenlabs_api_key || '').trim();
      const elStandalone = (() => {
        try { return (localStorage.getItem('elevenlabs_api_key') || '').trim(); } catch (_) { return ''; }
      })();
      setElevenlabsKey(elFromCfg || elStandalone);
      // Restore the ElevenLabs voice id (cfg takes precedence; same
      // dual-write contract as the key).
      const elVoiceFromCfg = (cfg.elevenlabs_voice_id || '').trim();
      const elVoiceStandalone = (() => {
        try { return (localStorage.getItem('elevenlabs_voice_id') || '').trim(); } catch (_) { return ''; }
      })();
      const elVoiceResolved = elVoiceFromCfg || elVoiceStandalone;
      setElevenlabsVoiceId(elVoiceResolved);
      const matchedPreset = elVoiceResolved && ELEVENLABS_VOICES.find((v) => v.id === elVoiceResolved);
      setElevenlabsVoicePreset(matchedPreset ? matchedPreset.id : (elVoiceResolved ? 'custom' : 'default'));
      // Sanitize the restored model: if a previously-saved pick is no
      // longer available (retired / quota-blocked), fall back to the
      // current default so the dropdown never shows a dead model.
      setSelectedModel(sanitizeModel(cfg.model_fast, AIProviderConfig.fastModel));
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e) => {
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

  // Picking any persona auto-targets the ElevenLabs voice only for the
  // Jarvis Male persona (the only one backed by ElevenLabs). Male/Female
  // personas skip ElevenLabs entirely.
  const selectPersona = (id) => {
    setVoicePersona(id);
    // Only Jarvis Male binds to an ElevenLabs voice. Male/Female personas
    // have no elevenlabsVoiceId and skip ElevenLabs entirely.
    const persona = findJarvisPersona(id);
    if (persona && persona.elevenlabsVoiceId) {
      setElevenlabsVoiceId(persona.elevenlabsVoiceId);
      const matchedPreset = ELEVENLABS_VOICES.find((v) => v.id === persona.elevenlabsVoiceId);
      setElevenlabsVoicePreset(matchedPreset ? matchedPreset.id : 'custom');
    } else {
      // Male / Female: clear any stale ElevenLabs voice selection
      setElevenlabsVoiceId('');
      setElevenlabsVoicePreset('default');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const trimmed = apiKey.trim();
    const persona = voicePersona;
    const elTrimmed = (elevenlabsKey || '').trim();
    const elVoiceTrimmed = (elevenlabsVoiceId || '').trim();

    // Dual localStorage write keeps every reader (RightPanel.getApiKey, the
    // legacy aiManager direct lookup, third-party tests) on the same page —
    // for both the Gemini key (required), the ElevenLabs key (optional),
    // and the ElevenLabs voice id.
    saveCfg({
      gemini_api_key: trimmed,
      elevenlabs_api_key: elTrimmed,
      elevenlabs_voice_id: elVoiceTrimmed,
      voice_persona: persona,
      model_fast: selectedModel,
    });
    saveStandaloneKey(trimmed);
    saveStandaloneElevenlabsKey(elTrimmed);
    saveStandaloneElevenlabsVoiceId(elVoiceTrimmed);

    setSaving(false);
    onClose();
  };

  if (!visible && !isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
      style={{ animation: 'fadeIn 0.3s ease-out' }}
      onClick={onClose}
    >
      <div
        className="w-[640px] max-h-[85vh] rounded-2xl border border-white/15 bg-gradient-to-br from-[#0a0e1a]/95 to-[#111827]/95 shadow-[0_0_50px_rgba(0,212,255,0.15)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'scaleIn 0.3s ease-out' }}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center">
              <Settings size={18} className="text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">System Configuration</h2>
              <p className="text-[10px] text-white/50 tracking-wide mt-0.5">Manage your API keys and assistant preferences.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X size={20} className="text-white/60" />
          </button>
        </div>

        <div className="flex-1 p-6 overflow-y-auto space-y-6">

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-white/80">
              <Key size={14} className="text-amber-400/80" />
              <span className="text-xs font-bold tracking-wider uppercase">Authentication</span>
            </div>
            <div className="p-4 rounded-xl bg-black/40 border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-medium text-white/80">Gemini API Key</label>
                {apiKey.trim() ? (
                <div className="flex items-center gap-1.5 text-[9px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                  <Shield size={10} />
                  <span>SECURE STORAGE</span>
                </div>
                ) : null}
              </div>
              <p className="text-[10px] text-white/40 mb-3">Required for all live interactions and agent reasoning.</p>
              <div className="relative">
                <input
                  type={apiKeyVisible ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Gemini API key"
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2.5 text-[12px] text-white/70 font-mono tracking-wider outline-none focus:border-cyan-500/40 transition-colors placeholder:text-white/20"
                />
                <button
                  onClick={() => setApiKeyVisible(!apiKeyVisible)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                >
                  {apiKeyVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-white/80">
              <Cpu size={14} className="text-emerald-400/80" />
              <span className="text-xs font-bold tracking-wider uppercase">AI Model</span>
            </div>
            <div className="p-4 rounded-xl bg-black/40 border border-white/10">
              <label className="text-[11px] font-medium text-white/80">Gemini Model</label>
              <p className="text-[10px] text-white/40 mb-3">Your default model for chat and voice replies. Fallbacks try the next model if yours fails (e.g. quota). Deep Reasoning still applies quality settings on top of your pick.</p>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2.5 text-[12px] text-white outline-none focus:border-cyan-500/40 transition-colors cursor-pointer appearance-none"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2'%3e%3cpath d='M6 9l6 6 6-6'/%3e%3c/svg%3e\")",
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.75rem center',
                  backgroundSize: '14px',
                  paddingRight: '2.25rem',
                }}
              >
                {getAvailableModels().map((m) => (
                  <option key={m} value={m} className="bg-[#0a0e1a] text-white">
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ---- Voice Synthesis (ElevenLabs) — only for Jarvis Male ---- */}
          {voicePersona === 'jarvismale' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-white/80">
              <Volume2 size={14} className="text-emerald-400/80" />
              <span className="text-xs font-bold tracking-wider uppercase">Voice Synthesis <span className="text-white/30 font-normal normal-case ml-1">(optional)</span></span>
            </div>
            <div className="p-4 rounded-xl bg-black/40 border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-medium text-white/80">ElevenLabs API Key</label>
                {(elevenlabsKey || '').trim() ? (
                  <div className="flex items-center gap-1.5 text-[9px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                    <Shield size={10} />
                    <span>SECURE STORAGE</span>
                  </div>
                ) : (
                  <span className="text-[9px] text-white/40">Browser TTS fallback active</span>
                )}
              </div>
              <p className="text-[10px] text-white/40 mb-3">Optional. Enables high-quality streaming voice for AI responses. Leave blank to use your browser's built-in text-to-speech. Get a key at <span className="text-emerald-300/80">elevenlabs.io</span> → Profile → API Keys.</p>
              <div className="relative">
                <input
                  type={elevenlabsVisible ? 'text' : 'password'}
                  value={elevenlabsKey}
                  onChange={(e) => setElevenlabsKey(e.target.value)}
                  placeholder="Enter your ElevenLabs API key"
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2.5 text-[12px] text-white/70 font-mono tracking-wider outline-none focus:border-emerald-500/40 transition-colors placeholder:text-white/20"
                />
                <button
                  onClick={() => setElevenlabsVisible(!elevenlabsVisible)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                  aria-label={elevenlabsVisible ? 'Hide ElevenLabs API key' : 'Show ElevenLabs API key'}
                >
                  {elevenlabsVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-[9px] text-white/30 mt-2">Set VITE_ELEVENLABS_API_KEY in <span className="text-white/50">jarvis-electron/.env</span> for a build-time default. UI input overrides it at runtime.</p>
            </div>
          </div>
          )}

          {/* ---- Voice (ElevenLabs preset + voice ID) — only for Jarvis Male ---- */}
          {voicePersona === 'jarvismale' && (
          <>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-white/80">
              <AudioWaveform size={14} className="text-sky-400/80" />
              <span className="text-xs font-bold tracking-wider uppercase">Voice <span className="text-white/30 font-normal normal-case ml-1">(optional)</span></span>
            </div>
            <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-white/80">Voice Preset</label>
                  {selectedPreset ? (
                    <span className="text-[9px] text-sky-300 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">{selectedPreset.name}</span>
                  ) : elevenlabsVoicePreset === 'custom' ? (
                    <span className="text-[9px] text-white/50 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">Custom</span>
                  ) : (
                    <span className="text-[9px] text-white/40">Default (Bella)</span>
                  )}
                </div>
                <p className="text-[10px] text-white/40 mb-2">Pick a curated ElevenLabs voice, or paste any voice ID from the ElevenLabs Voice Library below.</p>
                <select
                  value={elevenlabsVoicePreset}
                  onChange={(e) => {
                    const v = e.target.value;
                    setElevenlabsVoicePreset(v);
                    if (v === 'default') {
                      setElevenlabsVoiceId('');
                    } else if (v !== 'custom') {
                      setElevenlabsVoiceId(v);
                    }
                  }}
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2.5 text-[12px] text-white outline-none focus:border-sky-500/40 transition-colors cursor-pointer appearance-none"
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2'%3e%3cpath d='M6 9l6 6 6-6'/%3e%3c/svg%3e\")",
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                    backgroundSize: '14px',
                    paddingRight: '2.25rem',
                  }}
                >
                  <option value="default" className="bg-[#0a0e1a] text-white">Default (Bella · narration-friendly)</option>
                  {ELEVENLABS_VOICES.map((v) => (
                    <option key={v.id} value={v.id} className="bg-[#0a0e1a] text-white">
                      {v.name}
                    </option>
                  ))}
                  <option value="custom" className="bg-[#0a0e1a] text-white">Custom… (paste any voice ID)</option>
                </select>
                {selectedPreset && (
                  <p className="text-[10px] text-white/50 mt-2 italic leading-relaxed">{selectedPreset.description}</p>
                )}
              </div>

              <div>
                <label className="text-[11px] font-medium text-white/80">Voice ID</label>
                <p className="text-[9px] text-white/40 mb-2">Find IDs at <span className="text-sky-300/80">elevenlabs.io</span> → Voices → click any voice → copy the ID from the URL or the share button.</p>
                <div className="relative">
                  <input
                    type="text"
                    value={elevenlabsVoiceId}
                    onChange={(e) => {
                      setElevenlabsVoiceId(e.target.value);
                      setElevenlabsVoicePreset('custom');
                    }}
                    placeholder="e.g. IRHApOXLvnW57QJPQH2P (Adam)"
                    className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2.5 pr-9 text-[12px] text-white/70 font-mono tracking-wider outline-none focus:border-sky-500/40 transition-colors placeholder:text-white/20"
                  />
                  {elevenlabsVoiceId && (
                    <button
                      onClick={() => { setElevenlabsVoiceId(''); setElevenlabsVoicePreset('default'); }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                      aria-label="Clear voice ID"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          </>
          )}

          {/* ---- Voice Persona ---- */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-white/80">
              <AudioWaveform size={14} className="text-purple-400/80" />
              <span className="text-xs font-bold tracking-wider uppercase">Voice Persona</span>
              <span className="text-[10px] text-cyan-300/70 ml-1">default: Jarvis Male</span>
              <span className="text-[10px] text-cyan-300/70 ml-1">default: Jarvis Male</span>
            </div>                {(() => {
                  const jarvisMaleEntry = findJarvisPersona('jarvismale');
                  const isJarvisMale = voicePersona === 'jarvismale';
                  const personaVoiceId = (jarvisMaleEntry && jarvisMaleEntry.elevenlabsVoiceId) ? jarvisMaleEntry.elevenlabsVoiceId : (ELEVENLABS_VOICES[0] && ELEVENLABS_VOICES[0].id);
                  return (
                <button
                  onClick={() => selectPersona('jarvismale')}
                  className={`relative w-full p-4 rounded-xl border transition-all duration-200 text-left ${
                    isJarvisMale
                      ? 'bg-gradient-to-br from-cyan-500/10 to-amber-500/5 border-cyan-500/40 shadow-[0_0_22px_rgba(0,212,255,0.12)]'
                      : 'bg-black/40 border-white/10 hover:border-white/20'
                  }`}
                >
                  {isJarvisMale && (
                    <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center">
                      <Check size={12} className="text-cyan-400" />
                    </div>
                  )}
                  <div className="flex items-start gap-3 mb-2">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400/25 to-amber-400/15 border border-cyan-400/40 flex items-center justify-center shrink-0">
                      <User size={18} className="text-cyan-200" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className="text-[11px] font-bold text-white/90">Jarvis Male Persona</div>
                        <span className="text-[8px] uppercase tracking-wider font-bold text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/20">Original</span>
                      </div>
                      <div className="text-[9px] text-white/55">{jarvisMaleEntry && jarvisMaleEntry.shortDescription}</div>
                    </div>
                  </div>
                  <p className="text-[9px] text-white/45 italic leading-relaxed line-clamp-4">
                    {jarvisMaleEntry && jarvisMaleEntry.description}
                  </p>
                  <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-white/5">
                    <span className="text-[8px] text-white/40 uppercase tracking-wider font-bold">ElevenLabs Voice</span>
                    <span className="text-[9px] text-cyan-300 font-mono">{personaVoiceId}</span>
                  </div>
                </button>
              );
            })()}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => selectPersona('male')}
                className={`relative p-3 rounded-xl border transition-all duration-200 text-left ${
                  voicePersona === 'male'
                    ? 'bg-cyan-500/10 border-cyan-500/40 shadow-[0_0_20px_rgba(0,212,255,0.1)]'
                    : 'bg-black/40 border-white/10 hover:border-white/20'
                }`}
              >
                {voicePersona === 'male' && (
                  <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center">
                    <Check size={12} className="text-cyan-400" />
                  </div>
                )}
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400/20 to-blue-400/20 border border-cyan-400/30 flex items-center justify-center mb-2">
                  <User size={14} className="text-cyan-300" />
                </div>
                <div className="text-[10px] font-bold text-white/90 mb-0.5">Male Persona</div>
                <div className="text-[8px] text-white/45">Deep, professional tone.</div>
              </button>

              <button
                onClick={() => selectPersona('female')}
                className={`relative p-3 rounded-xl border transition-all duration-200 text-left ${
                  voicePersona === 'female'
                    ? 'bg-purple-500/10 border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.1)]'
                    : 'bg-black/40 border-white/10 hover:border-white/20'
                }`}
              >
                {voicePersona === 'female' && (
                  <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-purple-500/20 border border-purple-400/50 flex items-center justify-center">
                    <Check size={12} className="text-purple-400" />
                  </div>
                )}
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400/20 to-pink-400/20 border border-purple-400/30 flex items-center justify-center mb-2">
                  <User size={14} className="text-purple-300" />
                </div>
                <div className="text-[10px] font-bold text-white/90 mb-0.5">Female Persona</div>
                <div className="text-[8px] text-white/45">Clear, helpful tone.</div>
              </button>
            </div>
          </div>

          {/* ---- Infrastructure (uniform model grid) ---- */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-white/80">
              <Server size={14} className="text-emerald-400/80" />
              <span className="text-xs font-bold tracking-wider uppercase">Infrastructure</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(() => {
                const models = getAvailableModels();
                return models.map((model, i) => (
                  <div key={model} className="p-4 rounded-xl bg-black/40 border border-white/10">
                    <div className="text-[9px] text-white/40 font-bold tracking-wider mb-2">
                      {i === 0 ? 'PRIMARY' : 'FALLBACK ' + i}
                    </div>
                    <div className="text-[12px] font-semibold text-white mb-2">{model}</div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(74,222,128,0.6)]"></span>
                      <span className="text-[10px] text-green-400">Active</span>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/10 space-y-3">
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-500/5 border border-blue-500/15">
            <Info size={14} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-blue-300/80 leading-relaxed">
              These models are optimized for performance and cannot be changed in the current build.
            </p>
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg text-[11px] font-medium text-white/60 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white/80 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-lg text-[11px] font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 transition-all shadow-[0_0_20px_rgba(0,212,255,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
};

export default SystemConfigModal;

import { useState, useEffect } from 'react';
import { TopNavigation } from './components/TopNavigation';
import { LeftSidebar } from './components/LeftSidebar';
import { CenterHubExact } from './components/CenterHubExact';
import { RightPanel } from './components/RightPanel';
import { CommandPalette } from './components/CommandPalette';
import { IntelligenceDashboard } from './components/dashboards/IntelligenceDashboard';
import { NotesDashboard } from './components/dashboards/NotesDashboard';
import { TasksDashboard } from './components/dashboards/TasksDashboard';
import { ContactsDashboard } from './components/dashboards/ContactsDashboard';
import { AIWorkforceDashboard } from './components/dashboards/AIWorkforceDashboard';
import { OrgStructureDashboard } from './components/dashboards/OrgStructureDashboard';
import { ExecutiveDashboardView } from './components/dashboards/ExecutiveDashboardView';
import { IntegrationsDashboard } from './components/dashboards/IntegrationsDashboard';
import { ControlUIPanel } from './components/dashboards/ControlUIPanel';
import { ProviderSettings } from './components/ProviderSettings';
import { coreBridge } from './coreBridge';
import { ConfigurationManager } from './configManager';
import { sanitizeModel, AIProviderConfig } from './aiProviderConfig';
import { isProviderConfigured } from './providers/providerConfig';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

function App() {
  const [activeTab, setActiveTab] = useState('intelligence');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [showFirstRunWizard, setShowFirstRunWizard] = useState(false);
  const [showProviderSettings, setShowProviderSettings] = useState(false);

  // First-run check: if no provider is configured, show the setup wizard
  useEffect(() => {
    if (!isProviderConfigured()) {
      setShowFirstRunWizard(true);
    }
  }, []);

  // Boot the jarvis-core platform bridge: hydrate managers from the persisted
  // snapshot, mirror dashboard data into the real managers, start the mission
  // scheduler, and refresh executive metrics. Safe to call once per mount.
  useEffect(() => {
    coreBridge.bootstrap().catch(e => console.warn('[App] coreBridge bootstrap:', e));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(open => !open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Load persisted configuration from the Tauri backend on first mount so
  // the Rust-side ConfigurationManager stays in sync with the renderer.
  // In a browser preview this is a no-op and falls back to localStorage.
  useEffect(() => {
    (async () => {
      try {
        await ConfigurationManager.getInstance().load();
        // Keep localStorage-backed readers (aiService.ts, aiManager.ts) in
        // sync with whatever the Rust backend loaded. Also sanitize the model
        // so a stale saved pick (e.g. gemini-2.0-flash-lite) cannot survive
        // a restart and cause 429/404 errors.
        //
        // Merge strategy: localStorage wins for values that exist there,
        // because the modal always writes to both stores on Save. The Rust
        // config is only used to fill missing keys. This prevents an empty
        // Rust config from wiping out a key that was saved while the backend
        // plugin was unavailable.
        const cfg = ConfigurationManager.getInstance().get();
        const raw = localStorage.getItem('jarvis_config');
        const parsed = raw ? JSON.parse(raw) : {};
        const mergedModelFast = parsed.model_fast || cfg.model_fast;
        const mergedModelDeep = parsed.model_deep || cfg.model_deep;
        const next = {
          ...parsed,
          gemini_api_key: parsed.gemini_api_key || cfg.gemini_api_key || '',
          elevenlabs_api_key: parsed.elevenlabs_api_key || cfg.elevenlabs_api_key || '',
          elevenlabs_voice_id: parsed.elevenlabs_voice_id || cfg.elevenlabs_voice_id || '',
          voice_persona: parsed.voice_persona || cfg.voice_persona || 'jarvismale',
          reasoning_mode: parsed.reasoning_mode || cfg.reasoning_mode || 'fast',
          fast_response_mode: parsed.fast_response_mode ?? cfg.fast_response_mode ?? true,
          model_fast: sanitizeModel(mergedModelFast, AIProviderConfig.fastModel),
          model_deep: sanitizeModel(mergedModelDeep, AIProviderConfig.deepModel),
        };
        localStorage.setItem('jarvis_config', JSON.stringify(next));
        if (next.gemini_api_key) {
          localStorage.setItem('gemini_api_key', next.gemini_api_key);
        } else {
          localStorage.removeItem('gemini_api_key');
        }
      } catch (e) {
        console.warn('[App] ConfigurationManager load failed:', e);
      }
    })();
  }, []);

  // Check for updates on app startup and periodically every 3 hours.
  // When a new version is available, download and install it, then
  // relaunch. A flag in sessionStorage prevents re-checking while a
  // check is already in flight.
  useEffect(() => {
    let checking = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const checkForUpdates = async () => {
      if (checking) return;
      checking = true;
      try {
        const update = await check();
        if (update) {
          console.log(`[Updater] Found update: ${update.version}`);
          // Persist a flag so the next launch can show a "restarted for
          // update" message if desired.
          sessionStorage.setItem('jarvis_update_installed', update.version);
          await update.downloadAndInstall();
          await relaunch();
        }
      } catch (e) {
        // Updater failures are non-blocking — log and continue.
        console.warn('[Updater] Update check failed:', e);
      } finally {
        checking = false;
      }
    };

    // Check immediately on mount, then every 3 hours.
    checkForUpdates();
    interval = setInterval(checkForUpdates, 3 * 60 * 60 * 1000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  // Show a subtle toast if the app was just restarted after an update.
  const [updateToast, setUpdateToast] = useState<string | null>(() => {
    const v = sessionStorage.getItem('jarvis_update_installed');
    if (v) {
      sessionStorage.removeItem('jarvis_update_installed');
      return v;
    }
    return null;
  });
  useEffect(() => {
    if (updateToast) {
      const t = setTimeout(() => setUpdateToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [updateToast]);

  // Render the appropriate dashboard content based on active tab
  const renderDashboardContent = () => {
    switch (activeTab) {
      case 'intelligence':
        return <IntelligenceDashboard />;
      case 'notes':
        return <NotesDashboard />;
      case 'tasks':
        return <TasksDashboard />;
      case 'contacts':
        return <ContactsDashboard />;
      case 'ai-workforce':
        return <AIWorkforceDashboard />;
      case 'org-structure':
        return <OrgStructureDashboard />;
      case 'executive-dashboard':
        return <ExecutiveDashboardView />;
      case 'integrations':
        return <IntegrationsDashboard />;
      case 'control-ui':
        return <ControlUIPanel />;
      default:
        return <CenterHubExact />;
    }
  };

  return (
    <div className="h-screen w-screen bg-stonic-bg flex flex-col overflow-hidden">
      <TopNavigation activeTab={activeTab} onTabChange={setActiveTab} onOpenCommandPalette={() => setCommandPaletteOpen(true)} onOpenSettings={() => setShowProviderSettings(true)} />

      <main className="flex-1 flex gap-4 p-4 min-h-0 overflow-hidden">
        <LeftSidebar />
        {renderDashboardContent()}
        <RightPanel onCommand={(command) => setActiveTab(command)} />
      </main>

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onTabChange={(tab) => { setActiveTab(tab); setCommandPaletteOpen(false); }}
      />

      {/* Update installed toast */}
      {updateToast && (
        <div className="fixed bottom-4 right-4 px-4 py-2.5 rounded-xl bg-green-500/15 border border-green-500/30 text-[11px] text-green-300 font-mono tracking-wide shadow-[0_0_20px_rgba(74,222,128,0.15)] animate-in slide-in-from-right-4">
          Updated to v{updateToast} — restart complete.
        </div>
      )}

      {/* First-run setup wizard — shows if no AI provider is configured */}
      <ProviderSettings
        isOpen={showFirstRunWizard}
        onClose={() => setShowFirstRunWizard(false)}
        onConnected={() => setShowFirstRunWizard(false)}
        firstRun
      />

      {/* Provider settings modal — opened from the settings menu */}
      <ProviderSettings
        isOpen={showProviderSettings}
        onClose={() => setShowProviderSettings(false)}
        onConnected={() => setShowProviderSettings(false)}
      />
    </div>
  );
}

export default App;

import { useState, useEffect } from 'react';
import { TopNavigation } from './components/TopNavigation';
import { LeftSidebar } from './components/LeftSidebar';
import { CenterHubExact } from './components/CenterHubExact';
import { RightPanel } from './components/RightPanel';
import { ControlUIPanel } from './components/dashboards/ControlUIPanel';
import { sanitizeModel, AIProviderConfig } from './aiProviderConfig';

function App() {
  const [activeTab, setActiveTab] = useState('intelligence');

  // On first mount, attempt to load any persisted configuration so the
  // renderer starts from the saved API keys and model selection. In
  // Electron this is localStorage-backed; in a browser it is also localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('jarvis_config');
      if (raw) {
        const cfg = JSON.parse(raw);
        // Re-write the legacy standalone key slot so any component that
        // still reads `gemini_api_key` directly sees the latest saved value.
        if (cfg.gemini_api_key) {
          localStorage.setItem('gemini_api_key', cfg.gemini_api_key);
        }
        // Sanitize any stale model saved by an older build (e.g. the
        // quota-blocked gemini-2.0-flash-lite) so the first request after
        // launch doesn't 429/404.
        const fallback = cfg.reasoning_mode === 'deep' ? AIProviderConfig.deepModel : AIProviderConfig.fastModel;
        cfg.model_fast = sanitizeModel(cfg.model_fast, fallback);
        localStorage.setItem('jarvis_config', JSON.stringify(cfg));
      }
    } catch (e) {
      console.warn('[App] Failed to load persisted config:', e);
    }
  }, []);

  // Render the appropriate dashboard content based on active tab
  const renderContent = () => {
    if (activeTab === 'control-ui') {
      return <ControlUIPanel />;
    }
    return <CenterHubExact />;
  };

  return (
    <div className="h-screen w-screen bg-stonic-bg flex flex-col overflow-hidden">
      <TopNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="flex-1 flex gap-4 p-4 min-h-0 overflow-hidden">
        <LeftSidebar />
        {renderContent()}
        <RightPanel />
      </main>
    </div>
  );
}

export default App;

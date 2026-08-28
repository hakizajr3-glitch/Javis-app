import { useState } from 'react';
import { TopNavigation, LeftSidebar, RightPanel } from '@jarvis/ui';
import { CenterHubExact } from './components/CenterHubExact';

// Types exported from @jarvis/ui
import type { ExecutionStep, ExecutionPlan } from '@jarvis/ui';
export type { ExecutionStep, ExecutionPlan };

function App() {
  const [activeTab, setActiveTab] = useState('intelligence');

  return (
    <div className="h-screen w-screen bg-stonic-bg flex flex-col overflow-hidden">
      {/* Top Navigation */}
      <TopNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Main Content - Exact layout from image */}
      <main className="flex-1 flex gap-4 p-4 min-h-0 overflow-hidden">
        {/* Left Sidebar - Camera & Headlines */}
        <LeftSidebar />

        {/* Center Hub - Exactly as shown in image */}
        <CenterHubExact />

        {/* Right Panel - System Transcription */}
        <RightPanel />
      </main>
    </div>
  );
}

export default App;

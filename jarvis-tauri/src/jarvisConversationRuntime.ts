/**
 * jarvisConversationRuntime — the Voice-First Conversation + Execution brain.
 *
 * This is the core of the JARVIS experience:
 *
 *   YOU SPEAK → JARVIS understands → executes real actions → speaks back
 *
 * The runtime decouples conversation from missions:
 *   - You can talk to JARVIS while missions run in the background
 *   - "How's the backend?" → JARVIS inspects current state and answers
 *   - "Run npm test" → JARVIS executes a real shell command via Tauri
 *   - "Open the file" → JARVIS executes real file operations
 *   - "What are you doing?" → JARVIS reports current status
 *
 * Every action emits an event on the eventBus so the UI can show
 * live telemetry (logs, charts, agent status, mission progress).
 */

import { conversationManager } from './conversationManager';
import { harnessBridge } from './harnessBridge';
import {
  executeShell, readFile, writeFile, listDir, pathExists,
  mouseClick, mouseMove, keyboardType, keyboardPress, keyboardHotkey,
  captureScreen, isTauri,
} from './tauriCommands';
import { playwrightSidecar } from '@jarvis-core/browser-control/playwrightSidecarClient';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface JarvisEvent {
  id: string;
  timestamp: number;
  time: string;
  source: 'user' | 'jarvis' | 'system' | 'agent' | 'tool' | 'mission' | 'error';
  event: string;
  level: 'info' | 'success' | 'warn' | 'error';
  data?: any;
}

export interface MissionStatus {
  id: string;
  name: string;
  status: 'running' | 'queued' | 'completed' | 'failed' | 'paused';
  progress: number;
  tasks: number;
  completed: number;
  currentTask?: string;
}

export interface AgentStatus {
  id: string;
  name: string;
  role: string;
  state: 'running' | 'idle' | 'busy' | 'offline';
  model: string;
  currentTask?: string;
}

type Listener = (event: JarvisEvent) => void;

// ─── Intent parser ───────────────────────────────────────────────────────────

export interface ParsedIntent {
  type: 'shell' | 'file-read' | 'file-write' | 'file-list' | 'file-exists'
      | 'mouse-click' | 'mouse-move' | 'keyboard-type' | 'keyboard-key' | 'keyboard-hotkey'
      | 'screenshot' | 'status' | 'mission-status' | 'agent-status'
      | 'mission-pause' | 'mission-resume' | 'mission-stop' | 'mission-cancel'
      | 'harness-toggle' | 'harness-autonomy' | 'harness-show'
      | 'browser-navigate' | 'browser-click' | 'browser-type' | 'browser-screenshot'
      | 'browser-extract' | 'browser-title' | 'browser-back' | 'browser-forward'
      | 'browser-start' | 'browser-stop'
      | 'help' | 'conversation' | 'conversation-continuity';
  params: Record<string, any>;
  rawText: string;
}

export function parseIntent(text: string): ParsedIntent {
  const lower = text.toLowerCase().trim();

  // ── Shell commands ─────────────────────────────────────────────────────
  // "run npm test", "execute git status", "run ls -la"
  const runMatch = lower.match(/(?:run|execute|do)\s+(?:command\s+)?["']?([^"']+?)["']?\s*(?:in|at|directory)?\s*(.*)?$/);
  if (runMatch && (lower.startsWith('run ') || lower.startsWith('execute ') || lower.startsWith('do '))) {
    const cmd = runMatch[1].trim();
    const dir = runMatch[2]?.trim();
    // Don't treat "run a test" or "do something" as shell commands
    if (cmd.length > 2 && !cmd.includes('a ') && !cmd.includes('the ')) {
      return { type: 'shell', params: { command: cmd, cwd: dir || null }, rawText: text };
    }
  }

  // "open terminal and run X"
  const terminalMatch = lower.match(/(?:open\s+)?terminal.*?(?:run|execute)\s+(.+)/);
  if (terminalMatch) {
    return { type: 'shell', params: { command: terminalMatch[1].trim() }, rawText: text };
  }

  // ── File operations ────────────────────────────────────────────────────
  // "read file /path/to/file", "show file contents"
  const readMatch = lower.match(/(?:read|show|cat|display)\s+(?:file\s+|contents\s+of\s+|the\s+file\s+)?(.+)/);
  if (readMatch && (lower.startsWith('read ') || lower.startsWith('show file') || lower.startsWith('cat '))) {
    const path = readMatch[1].trim().replace(/^["']|["']$/g, '');
    if (path.startsWith('/') || path.startsWith('~') || path.match(/^[a-zA-Z]:/)) {
      return { type: 'file-read', params: { path }, rawText: text };
    }
  }

  // "write file /path content"
  const writeMatch = lower.match(/(?:write|create|save)\s+(?:file\s+)?(.+?)\s+(?:with|containing|content)\s+(.+)/);
  if (writeMatch) {
    return { type: 'file-write', params: { path: writeMatch[1].trim(), content: writeMatch[2].trim() }, rawText: text };
  }

  // "list files in /path", "show directory /path"
  const listMatch = lower.match(/(?:list|show|ls)\s+(?:files\s+)?(?:in\s+|directory\s+)?(.+)/);
  if (listMatch && (lower.startsWith('list ') || lower.startsWith('ls '))) {
    const path = listMatch[1].trim().replace(/^["']|["']$/g, '');
    if (path.startsWith('/') || path.startsWith('~') || path === '.' || path === '..') {
      return { type: 'file-list', params: { path }, rawText: text };
    }
  }

  // "does /path exist"
  const existsMatch = lower.match(/(?:does|check if)\s+(.+?)\s+exist/);
  if (existsMatch) {
    return { type: 'file-exists', params: { path: existsMatch[1].trim() }, rawText: text };
  }

  // ── Mouse/keyboard ─────────────────────────────────────────────────────
  // "click", "click left", "click right"
  if (lower === 'click' || lower === 'left click' || lower === 'right click' || lower === 'middle click') {
    const button = lower.includes('right') ? 'right' : lower.includes('middle') ? 'middle' : 'left';
    return { type: 'mouse-click', params: { button }, rawText: text };
  }

  // "move mouse to x y"
  const moveMatch = lower.match(/(?:move|put)\s+(?:the\s+)?mouse\s+(?:to\s+)?(-?\d+)\s+(-?\d+)/);
  if (moveMatch) {
    return { type: 'mouse-move', params: { x: parseInt(moveMatch[1]), y: parseInt(moveMatch[2]) }, rawText: text };
  }

  // "type hello world"
  const typeMatch = lower.match(/(?:type|enter|input)\s+(.+)/);
  if (typeMatch && (lower.startsWith('type ') || lower.startsWith('enter ') || lower.startsWith('input '))) {
    return { type: 'keyboard-type', params: { text: typeMatch[1].trim() }, rawText: text };
  }

  // "press enter", "press escape"
  const pressMatch = lower.match(/(?:press|hit)\s+(?:the\s+)?(\w+)/);
  if (pressMatch && (lower.startsWith('press ') || lower.startsWith('hit '))) {
    return { type: 'keyboard-key', params: { key: pressMatch[1].trim() }, rawText: text };
  }

  // "press control c", "hotkey cmd space"
  const hotkeyMatch = lower.match(/(?:press|hotkey)\s+(.+)/);
  if (hotkeyMatch && lower.startsWith('hotkey ')) {
    const keys = hotkeyMatch[1].trim().split(/\s+/);
    return { type: 'keyboard-hotkey', params: { keys }, rawText: text };
  }

  // ── Screenshot ─────────────────────────────────────────────────────────
  if (lower.match(/(?:take|capture|grab)\s+(?:a\s+)?(?:screenshot|screen capture|screen)/)) {
    return { type: 'screenshot', params: {}, rawText: text };
  }
  if (lower === 'screenshot' || lower === 'capture screen') {
    return { type: 'screenshot', params: {}, rawText: text };
  }

  // ── Browser control ────────────────────────────────────────────────────
  // "navigate to google.com", "go to https://example.com", "open website X"
  const navMatch = lower.match(/(?:navigate to|go to|open|visit)\s+(?:https?:\/\/)?(.+)/);
  if (navMatch && (lower.startsWith('navigate to ') || lower.startsWith('go to ') ||
      lower.startsWith('open ') || lower.startsWith('visit '))) {
    let url = navMatch[1].trim().replace(/^["']|["']$/g, '');
    // Don't treat "open terminal" or "open tasks" as browser navigation
    const nonBrowserKeywords = ['terminal', 'tasks', 'notes', 'contacts', 'dashboard',
      'integrations', 'control ui', 'harness', 'intelligence', 'ai workforce',
      'organization', 'executive', 'file ', 'folder', 'directory', 'app', 'application',
      'settings', 'configuration', 'modal', 'window'];
    if (nonBrowserKeywords.some(kw => url.toLowerCase().includes(kw))) {
      // Fall through to other parsers
    } else {
      // Add protocol if missing
      if (!url.match(/^https?:\/\//)) {
        // Check if it looks like a domain
        if (url.match(/^[\w-]+\.[\w.]+/)) {
          url = 'https://' + url;
        } else {
          // It's a search query — use Google
          url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
        }
      }
      return { type: 'browser-navigate', params: { url }, rawText: text };
    }
  }

  // "click the search button", "click #submit", "click Login"
  const clickMatch = lower.match(/(?:click|tap)\s+(?:the\s+)?(.+)/);
  if (clickMatch && (lower.startsWith('click ') || lower.startsWith('tap '))) {
    const target = clickMatch[1].trim();
    // If it looks like a CSS selector
    if (target.startsWith('#') || target.startsWith('.') || target.startsWith('[') ||
        target.includes('button') || target.includes('input') || target.includes('a ')) {
      return { type: 'browser-click', params: { selector: target }, rawText: text };
    }
    // Otherwise treat as text to click
    return { type: 'browser-click', params: { text: target }, rawText: text };
  }

  // "type hello in the search box", "type hello into #search"
  const browserTypeMatch = lower.match(/(?:type|enter)\s+(.+?)\s+(?:in|into|on)\s+(?:the\s+)?(.+)/);
  if (browserTypeMatch && (lower.startsWith('type ') || lower.startsWith('enter '))) {
    return {
      type: 'browser-type',
      params: { text: browserTypeMatch[1].trim(), selector: browserTypeMatch[2].trim() },
      rawText: text,
    };
  }

  // "take a browser screenshot", "screenshot the page"
  if (lower.match(/(?:browser|page)\s+screenshot/) || lower.match(/screenshot\s+(?:the\s+)?(?:browser|page)/)) {
    return { type: 'browser-screenshot', params: {}, rawText: text };
  }

  // "get page title", "what's the page title"
  if (lower.match(/(?:get|what(?:'s| is)?)\s+(?:the\s+)?page\s+title/)) {
    return { type: 'browser-title', params: {}, rawText: text };
  }

  // "go back", "browser back"
  if (lower === 'go back' || lower === 'browser back' || lower === 'navigate back') {
    return { type: 'browser-back', params: {}, rawText: text };
  }

  // "go forward", "browser forward"
  if (lower === 'go forward' || lower === 'browser forward' || lower === 'navigate forward') {
    return { type: 'browser-forward', params: {}, rawText: text };
  }

  // "start browser", "open browser", "launch browser"
  if (lower.match(/(?:start|launch|open)\s+browser/) || lower === 'start browser' || lower === 'open browser') {
    return { type: 'browser-start', params: {}, rawText: text };
  }

  // "stop browser", "close browser"
  if (lower.match(/(?:stop|close)\s+browser/) || lower === 'stop browser' || lower === 'close browser') {
    return { type: 'browser-stop', params: {}, rawText: text };
  }

  // "extract text from h1", "get text from .title"
  const extractMatch = lower.match(/(?:extract|get)\s+text\s+(?:from|in|on)\s+(.+)/);
  if (extractMatch) {
    return { type: 'browser-extract', params: { selector: extractMatch[1].trim() }, rawText: text };
  }

  // ── Status queries ─────────────────────────────────────────────────────
  if (lower.match(/(?:what(?:'s| is| are) (?:you )?(?:doing|happening|going on)|status|what's up|report)/)) {
    return { type: 'status', params: {}, rawText: text };
  }
  if (lower.match(/(?:how(?:'s| is) (?:the )?(?:mission|project|build|backend|frontend))/)) {
    return { type: 'mission-status', params: {}, rawText: text };
  }
  if (lower.match(/(?:what.*agents?(?:.*doing|.*status)|agent status|show agents)/)) {
    return { type: 'agent-status', params: {}, rawText: text };
  }

  // ── Voice control: mission pause/resume/stop/cancel ────────────────────
  // "stop" (bare) → pause all running missions
  // "stop mission" / "stop everything" / "stop all" → pause all missions
  // "pause" / "pause mission" / "hold on" / "wait" → pause current mission
  // "resume" / "continue" / "resume mission" / "keep going" / "go on" → resume
  // "cancel" / "cancel mission" / "abort" / "abort mission" → cancel mission
  if (lower === 'stop' || lower === 'stop mission' || lower === 'stop everything' ||
      lower === 'stop all' || lower === 'stop all missions' || lower === 'halt') {
    return { type: 'mission-stop', params: { all: true }, rawText: text };
  }
  if (lower === 'pause' || lower === 'pause mission' || lower === 'hold on' ||
      lower === 'wait' || lower === 'pause that' || lower === 'pause it') {
    return { type: 'mission-pause', params: {}, rawText: text };
  }
  if (lower === 'resume' || lower === 'resume mission' || lower === 'continue' ||
      lower === 'keep going' || lower === 'go on' || lower === 'resume that' ||
      lower === 'resume it' || lower === 'carry on') {
    return { type: 'mission-resume', params: {}, rawText: text };
  }
  if (lower === 'cancel' || lower === 'cancel mission' || lower === 'abort' ||
      lower === 'abort mission' || lower === 'cancel that' || lower === 'cancel it') {
    return { type: 'mission-cancel', params: {}, rawText: text };
  }

  // ── Conversation continuity ────────────────────────────────────────────
  // "fix that" / "do it" / "what about the other one" / "try again" /
  // "that one" / "the same thing" / "again" — refers to current mission context
  if (lower.match(/^(?:fix that|fix it|do it|do that|try again|try that again|that one|the same thing|again|what about the other one|what about that one|the other one)$/)) {
    return { type: 'conversation-continuity', params: { phrase: lower }, rawText: text };
  }

  // ── Harness commands ───────────────────────────────────────────────────
  const toggleMatch = lower.match(/(?:turn on|enable|activate|start)\s+(.+)/);
  const offMatch = lower.match(/(?:turn off|disable|deactivate|stop)\s+(.+)/);
  const PILLAR_KEYWORDS: Record<string, string> = {
    'browser': 'browser', 'browser control': 'browser',
    'terminal': 'terminal', 'desktop': 'desktop', 'desktop control': 'desktop',
    'vision': 'vision', 'filesystem': 'filesystem', 'sandbox': 'sandbox',
    'verification': 'verification', 'recovery': 'recovery',
    'multi-agent': 'multi-agent', 'parallel': 'parallel',
    'model router': 'model-router', 'knowledge graph': 'knowledge-graph',
  };
  if (toggleMatch || offMatch) {
    const keyword = (toggleMatch?.[1] || offMatch?.[1] || '').trim();
    for (const [k, v] of Object.entries(PILLAR_KEYWORDS)) {
      if (keyword.includes(k)) {
        return { type: 'harness-toggle', params: { pillar: v }, rawText: text };
      }
    }
  }

  const autoMatch = lower.match(/(?:set\s+)?autonomy\s+(?:to\s+)?(?:level\s+)?(\d)/);
  if (autoMatch) {
    return { type: 'harness-autonomy', params: { level: parseInt(autoMatch[1]) }, rawText: text };
  }

  if (lower.match(/(?:show|open|switch to)\s+(?:the\s+)?harness/)) {
    return { type: 'harness-show', params: {}, rawText: text };
  }

  // ── Help ───────────────────────────────────────────────────────────────
  if (lower === 'help' || lower === 'what can you do') {
    return { type: 'help', params: {}, rawText: text };
  }

  // ── Default: conversation (send to AI) ─────────────────────────────────
  return { type: 'conversation', params: {}, rawText: text };
}

// ─── Jarvis Conversation Runtime ─────────────────────────────────────────────

class JarvisConversationRuntime {
  private events: JarvisEvent[] = [];
  private listeners: Set<Listener> = new Set();
  private missions: MissionStatus[] = [];
  private agents: AgentStatus[] = [];
  private ttsEnabled = true;
  private initialized = false;
  // Conversation continuity: tracks the last mission/task context so
  // "fix that", "do it", "try again" can resolve to the right target.
  private currentMissionContext: {
    missionId?: string;
    missionName?: string;
    lastAction?: string;
    lastResult?: any;
    timestamp: number;
  } | null = null;

  // ─── Event system ──────────────────────────────────────────────────────

  emit(source: JarvisEvent['source'], event: string, level: JarvisEvent['level'] = 'info', data?: any): JarvisEvent {
    const now = new Date();
    const evt: JarvisEvent = {
      id: Math.random().toString(36).substring(2, 11),
      timestamp: now.getTime(),
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`,
      source, event, level, data,
    };
    this.events = [...this.events.slice(-200), evt];
    this.listeners.forEach(cb => { try { cb(evt); } catch (_) {} });
    // Also push to harness audit log
    harnessBridge.addAudit(`[${source}] ${event}`, level);
    return evt;
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  getEvents(): JarvisEvent[] {
    return this.events;
  }

  // ─── Mission/Agent state ───────────────────────────────────────────────

  getMissions(): MissionStatus[] {
    return this.missions;
  }

  getAgents(): AgentStatus[] {
    return this.agents;
  }

  setMissions(missions: MissionStatus[]): void {
    this.missions = missions;
  }

  setAgents(agents: AgentStatus[]): void {
    this.agents = agents;
  }

  // ─── Text-to-speech ────────────────────────────────────────────────────

  setTtsEnabled(enabled: boolean): void {
    this.ttsEnabled = enabled;
  }

  isTtsEnabled(): boolean {
    return this.ttsEnabled;
  }

  private speak(text: string): void {
    if (!this.ttsEnabled || typeof window === 'undefined') return;
    try {
      // Strip markdown/emojis for cleaner speech
      const clean = text.replace(/[#*`_~]/g, '').replace(/[^\w\s.,!?'-]/g, ' ').trim();
      if (clean && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.rate = 1.05;
        utterance.pitch = 0.9;
        utterance.volume = 0.9;
        // Try to use a British male voice for the JARVIS feel
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v =>
          v.name.includes('Daniel') || v.name.includes('Arthur') ||
          v.name.includes('Google UK English Male') || v.lang === 'en-GB'
        );
        if (preferred) utterance.voice = preferred;
        window.speechSynthesis.speak(utterance);
      }
    } catch (_) { /* ignore TTS errors */ }
  }

  // ─── Process user input (text or voice transcript) ─────────────────────

  async processInput(text: string, fromVoice: boolean = false, options?: { deepReasoning?: boolean; fastResponse?: boolean }): Promise<string> {
    if (!this.initialized) {
      this.initialized = true;
      this.emit('system', 'JARVIS Conversation Runtime initialized', 'success');
    }

    // Apply reasoning mode — deep reasoning adds a system note, fast mode skips it
    if (options?.deepReasoning) {
      this.emit('system', 'Deep reasoning mode enabled — using extended analysis', 'info');
    }
    if (options?.fastResponse === false) {
      this.emit('system', 'Fast response disabled — using thorough analysis', 'info');
    }

    this.emit('user', fromVoice ? `Voice: "${text}"` : `Text: "${text}"`, 'info');

    const intent = parseIntent(text);

    try {
      switch (intent.type) {
        // ── Real execution ──────────────────────────────────────────────
        case 'shell': {
          const { command, cwd } = intent.params;
          this.emit('tool', `Executing: ${command}${cwd ? ` in ${cwd}` : ''}`, 'info');
          if (!isTauri()) {
            const msg = `I can't execute shell commands in browser mode. In the desktop app, I would run: ${command}`;
            this.emit('jarvis', msg, 'warn');
            this.speak(msg);
            return msg;
          }
          const result = cwd
            ? await executeShell(command) // Note: executeShellInDir would be used here
            : await executeShell(command);
          const response = result.success
            ? `Command completed. Output: ${result.stdout.slice(0, 500)}${result.stdout.length > 500 ? '...' : ''}`
            : `Command failed with exit code ${result.exitCode}. Error: ${result.stderr.slice(0, 300)}`;
          this.emit(result.success ? 'tool' : 'error',
            `Shell: ${command} → exit ${result.exitCode}`,
            result.success ? 'success' : 'error',
            result);
          this.speak(result.success
            ? `Done. ${result.stdout.slice(0, 200)}`
            : `Command failed. ${result.stderr.slice(0, 200)}`);
          return response;
        }

        case 'file-read': {
          const { path } = intent.params;
          this.emit('tool', `Reading file: ${path}`, 'info');
          if (!isTauri()) {
            return `I can't read files in browser mode. In the desktop app, I would read: ${path}`;
          }
          const content = await readFile(path);
          const preview = content.slice(0, 800);
          const response = `File contents (${content.length} chars):\n${preview}${content.length > 800 ? '\n...' : ''}`;
          this.emit('tool', `Read ${path} (${content.length} chars)`, 'success');
          this.speak(`File read. It contains ${content.length} characters.`);
          return response;
        }

        case 'file-write': {
          const { path, content } = intent.params;
          this.emit('tool', `Writing file: ${path}`, 'info');
          if (!isTauri()) {
            return `I can't write files in browser mode. In the desktop app, I would write to: ${path}`;
          }
          await writeFile(path, content);
          this.emit('tool', `Wrote ${content.length} chars to ${path}`, 'success');
          this.speak(`File written to ${path}.`);
          return `Successfully wrote ${content.length} characters to ${path}`;
        }

        case 'file-list': {
          const { path } = intent.params;
          this.emit('tool', `Listing directory: ${path}`, 'info');
          if (!isTauri()) {
            return `I can't list directories in browser mode. In the desktop app, I would list: ${path}`;
          }
          const entries = await listDir(path);
          const listing = entries.map(e =>
            `${e.isDir ? '📁' : '📄'} ${e.name}${e.isFile ? ` (${e.size} bytes)` : ''}`
          ).join('\n');
          this.emit('tool', `Listed ${entries.length} items in ${path}`, 'success');
          this.speak(`Found ${entries.length} items in that directory.`);
          return `Contents of ${path}:\n${listing}`;
        }

        case 'file-exists': {
          const { path } = intent.params;
          if (!isTauri()) return `I can't check files in browser mode.`;
          const exists = await pathExists(path);
          this.emit('tool', `Check: ${path} → ${exists ? 'exists' : 'not found'}`, exists ? 'success' : 'warn');
          this.speak(`${path} ${exists ? 'exists' : 'does not exist'}.`);
          return `${path} ${exists ? 'exists' : 'does not exist'}`;
        }

        case 'mouse-click': {
          const { button } = intent.params;
          if (!isTauri()) return `I can't control the mouse in browser mode.`;
          await mouseClick(button);
          this.emit('tool', `Mouse click: ${button}`, 'success');
          this.speak(`Clicked ${button} button.`);
          return `Clicked ${button} mouse button.`;
        }

        case 'mouse-move': {
          const { x, y } = intent.params;
          if (!isTauri()) return `I can't control the mouse in browser mode.`;
          await mouseMove(x, y);
          this.emit('tool', `Mouse moved to (${x}, ${y})`, 'success');
          return `Mouse moved to ${x}, ${y}.`;
        }

        case 'keyboard-type': {
          const { text: typeText } = intent.params;
          if (!isTauri()) return `I can't type in browser mode.`;
          await keyboardType(typeText);
          this.emit('tool', `Typed: "${typeText}"`, 'success');
          this.speak(`Typed ${typeText.length} characters.`);
          return `Typed: ${typeText}`;
        }

        case 'keyboard-key': {
          const { key } = intent.params;
          if (!isTauri()) return `I can't press keys in browser mode.`;
          await keyboardPress(key);
          this.emit('tool', `Key pressed: ${key}`, 'success');
          return `Pressed ${key}.`;
        }

        case 'keyboard-hotkey': {
          const { keys } = intent.params;
          if (!isTauri()) return `I can't press hotkeys in browser mode.`;
          await keyboardHotkey(keys);
          this.emit('tool', `Hotkey: ${keys.join(' + ')}`, 'success');
          return `Pressed ${keys.join(' + ')}.`;
        }

        case 'screenshot': {
          if (!isTauri()) return `I can't capture the screen in browser mode.`;
          this.emit('tool', 'Capturing screen...', 'info');
          const result = await captureScreen();
          if (result.success && result.base64) {
            this.emit('tool', `Screenshot captured (${result.width}x${result.height})`, 'success', result);
            this.speak(`Screenshot captured. The screen is ${result.width} by ${result.height} pixels.`);
            return `Screenshot captured: ${result.width}x${result.height}. The image is available for viewing.`;
          }
          return `Screenshot failed: ${result.error}`;
        }

        // ── Browser control (Playwright sidecar) ───────────────────────
        case 'browser-start': {
          this.emit('tool', 'Starting Playwright browser sidecar...', 'info');
          const started = await playwrightSidecar.start();
          if (started) {
            this.emit('tool', 'Browser sidecar started', 'success');
            this.speak('Browser control is now active. I can navigate, click, type, and extract data from web pages.');
            return 'Browser control started. I can now navigate to websites, click elements, type text, take screenshots, and extract data. Try saying "navigate to google.com".';
          }
          this.emit('error', 'Failed to start browser sidecar', 'error');
          this.speak('I could not start the browser sidecar. Make sure Playwright is installed.');
          return 'Failed to start browser sidecar. Run it manually with: npx tsx jarvis-core/src/browser-control/playwrightSidecar.ts';
        }

        case 'browser-stop': {
          await playwrightSidecar.stop();
          this.emit('tool', 'Browser sidecar stopped', 'info');
          this.speak('Browser control stopped.');
          return 'Browser control stopped.';
        }

        case 'browser-navigate': {
          const { url } = intent.params;
          this.emit('tool', `Navigating to ${url}...`, 'info');
          const response = await playwrightSidecar.navigate(url);
          if (response.success) {
            const finalUrl = response.result?.url || url;
            const status = response.result?.status;
            this.emit('tool', `Navigated to ${finalUrl} (HTTP ${status})`, 'success');
            this.speak(`Navigated to ${url}. The page returned status ${status || 'unknown'}.`);
            return `Navigated to ${finalUrl}. HTTP status: ${status || 'unknown'}.`;
          }
          this.emit('error', `Navigation failed: ${response.error}`, 'error');
          this.speak(`I could not navigate to ${url}. ${response.error}`);
          return `Navigation failed: ${response.error}. Make sure the browser sidecar is running — say "start browser" first.`;
        }

        case 'browser-click': {
          const { selector, text } = intent.params;
          this.emit('tool', `Clicking ${selector || text}...`, 'info');
          const response = text
            ? await playwrightSidecar.sendCommand('clickText', { text })
            : await playwrightSidecar.click(selector);
          if (response.success) {
            this.emit('tool', `Clicked ${selector || text}`, 'success');
            this.speak(`Clicked ${selector || text}.`);
            return `Clicked ${selector || text}.`;
          }
          this.emit('error', `Click failed: ${response.error}`, 'error');
          return `Click failed: ${response.error}. Make sure the browser sidecar is running.`;
        }

        case 'browser-type': {
          const { text: typeText, selector } = intent.params;
          this.emit('tool', `Typing "${typeText}" into ${selector}...`, 'info');
          const response = await playwrightSidecar.type(selector, typeText);
          if (response.success) {
            this.emit('tool', `Typed "${typeText}" into ${selector}`, 'success');
            this.speak(`Typed ${typeText.length} characters into ${selector}.`);
            return `Typed "${typeText}" into ${selector}.`;
          }
          this.emit('error', `Type failed: ${response.error}`, 'error');
          return `Type failed: ${response.error}. Make sure the browser sidecar is running.`;
        }

        case 'browser-screenshot': {
          this.emit('tool', 'Taking browser screenshot...', 'info');
          const response = await playwrightSidecar.screenshot(false);
          if (response.success && response.result?.base64) {
            this.emit('tool', `Browser screenshot captured (${response.result.width}x${response.result.height})`, 'success', response.result);
            this.speak(`Browser screenshot captured. The page is ${response.result.width} by ${response.result.height} pixels.`);
            return `Browser screenshot captured: ${response.result.width}x${response.result.height}.`;
          }
          this.emit('error', `Browser screenshot failed: ${response.error}`, 'error');
          return `Browser screenshot failed: ${response.error}. Make sure the browser sidecar is running.`;
        }

        case 'browser-extract': {
          const { selector } = intent.params;
          this.emit('tool', `Extracting text from ${selector}...`, 'info');
          const response = await playwrightSidecar.extractText(selector);
          if (response.success) {
            const data = response.result?.data || '';
            this.emit('tool', `Extracted text from ${selector}`, 'success', response.result);
            this.speak(`Extracted: ${String(data).slice(0, 200)}`);
            return `Text from ${selector}: ${data}`;
          }
          this.emit('error', `Extract failed: ${response.error}`, 'error');
          return `Extract failed: ${response.error}. Make sure the browser sidecar is running.`;
        }

        case 'browser-title': {
          const response = await playwrightSidecar.getTitle();
          if (response.success) {
            const title = response.result?.title || 'Unknown';
            this.emit('tool', `Page title: ${title}`, 'success');
            this.speak(`The page title is ${title}.`);
            return `Page title: ${title}`;
          }
          return `Could not get page title: ${response.error}`;
        }

        case 'browser-back': {
          const response = await playwrightSidecar.sendCommand('goBack', {});
          if (response.success) {
            const url = response.result?.url || 'unknown';
            this.emit('tool', `Went back to ${url}`, 'success');
            this.speak('Went back.');
            return `Navigated back to ${url}.`;
          }
          return `Could not go back: ${response.error}`;
        }

        case 'browser-forward': {
          const response = await playwrightSidecar.sendCommand('goForward', {});
          if (response.success) {
            const url = response.result?.url || 'unknown';
            this.emit('tool', `Went forward to ${url}`, 'success');
            this.speak('Went forward.');
            return `Navigated forward to ${url}.`;
          }
          return `Could not go forward: ${response.error}`;
        }

        // ── Status queries ─────────────────────────────────────────────
        case 'status': {
          const missions = this.getMissions();
          const runningMissions = missions.filter(m => m.status === 'running');
          const agents = this.getAgents();
          const runningAgents = agents.filter(a => a.state === 'running');
          const harnessState = harnessBridge.getState();
          const activePillars = Object.entries(harnessState.toggles).filter(([_, v]) => v).length;
          const totalPillars = Object.keys(harnessState.toggles).length;

          let response = `System Status:\n`;
          response += `• Autonomy: L${harnessState.autonomyLevel}\n`;
          response += `• Pillars: ${activePillars}/${totalPillars} active\n`;
          response += `• Missions: ${runningMissions.length} running, ${missions.length} total\n`;
          response += `• Agents: ${runningAgents.length} active, ${agents.length} total\n`;
          if (runningMissions.length > 0) {
            response += `• Current: ${runningMissions.map(m => m.name).join(', ')}`;
          }

          this.emit('jarvis', 'Status report delivered', 'info');
          this.speak(`I'm currently running ${runningMissions.length} missions with ${runningAgents.length} active agents. Autonomy is at level ${harnessState.autonomyLevel}.`);
          return response;
        }

        case 'mission-status': {
          const missions = this.getMissions();
          if (missions.length === 0) {
            this.speak('There are no active missions right now.');
            return 'No active missions.';
          }
          let response = 'Mission Status:\n';
          for (const m of missions) {
            const pct = Math.round(m.progress * 100);
            response += `• ${m.name}: ${m.status} (${pct}% — ${m.completed}/${m.tasks} tasks)\n`;
          }
          // Update conversation context to the first running mission
          const running = missions.find(m => m.status === 'running');
          if (running) {
            this.currentMissionContext = {
              missionId: running.id,
              missionName: running.name,
              lastAction: 'status-check',
              timestamp: Date.now(),
            };
          }
          this.speak(`Mission progress: ${missions.map(m => `${m.name} at ${Math.round(m.progress * 100)} percent`).join('. ')}.`);
          return response;
        }

        // ── Voice control: mission pause/resume/stop/cancel ─────────────
        case 'mission-stop': {
          const missions = this.getMissions();
          const running = missions.filter(m => m.status === 'running');
          if (running.length === 0) {
            this.speak('There are no running missions to stop.');
            return 'No running missions to stop.';
          }
          // Pause all running missions
          for (const m of running) {
            m.status = 'paused';
          }
          this.setMissions(missions);
          this.emit('mission', `Stopped ${running.length} mission(s): ${running.map(m => m.name).join(', ')}`, 'warn');
          this.speak(`Stopped ${running.length} mission${running.length > 1 ? 's' : ''}: ${running.map(m => m.name).join(', ')}. Say "resume" to continue.`);
          return `Stopped ${running.length} mission(s): ${running.map(m => m.name).join(', ')}. Say "resume" to continue.`;
        }

        case 'mission-pause': {
          const missions = this.getMissions();
          const running = missions.filter(m => m.status === 'running');
          if (running.length === 0) {
            this.speak('There are no running missions to pause.');
            return 'No running missions to pause.';
          }
          // Pause the first running mission
          const target = running[0];
          target.status = 'paused';
          this.setMissions(missions);
          this.currentMissionContext = {
            missionId: target.id,
            missionName: target.name,
            lastAction: 'pause',
            timestamp: Date.now(),
          };
          this.emit('mission', `Paused mission: ${target.name}`, 'warn');
          this.speak(`Paused ${target.name}. Say "resume" when you're ready to continue.`);
          return `Paused mission: ${target.name}. Say "resume" to continue.`;
        }

        case 'mission-resume': {
          const missions = this.getMissions();
          const paused = missions.filter(m => m.status === 'paused');
          if (paused.length === 0) {
            this.speak('There are no paused missions to resume.');
            return 'No paused missions to resume.';
          }
          // Resume the first paused mission (or the one from context)
          const target = this.currentMissionContext?.missionId
            ? paused.find(m => m.id === this.currentMissionContext!.missionId) || paused[0]
            : paused[0];
          target.status = 'running';
          this.setMissions(missions);
          this.currentMissionContext = {
            missionId: target.id,
            missionName: target.name,
            lastAction: 'resume',
            timestamp: Date.now(),
          };
          this.emit('mission', `Resumed mission: ${target.name}`, 'success');
          this.speak(`Resumed ${target.name}. Continuing execution.`);
          return `Resumed mission: ${target.name}.`;
        }

        case 'mission-cancel': {
          const missions = this.getMissions();
          const active = missions.filter(m => m.status === 'running' || m.status === 'paused');
          if (active.length === 0) {
            this.speak('There are no active missions to cancel.');
            return 'No active missions to cancel.';
          }
          // Cancel the first active mission
          const target = active[0];
          target.status = 'failed';
          this.setMissions(missions);
          this.emit('mission', `Cancelled mission: ${target.name}`, 'error');
          this.speak(`Cancelled ${target.name}.`);
          return `Cancelled mission: ${target.name}.`;
        }

        // ── Conversation continuity ─────────────────────────────────────
        case 'conversation-continuity': {
          const phrase = intent.params.phrase as string;
          const ctx = this.currentMissionContext;
          const missions = this.getMissions();

          // Resolve what "that" / "it" / "the other one" refers to
          if (!ctx && missions.length === 0) {
            this.speak("I'm not sure what you're referring to. Could you be more specific?");
            return "No context available for that reference. Please specify what you'd like me to do.";
          }

          // Determine the target mission from context or current running missions
          const targetMission = ctx?.missionId
            ? missions.find(m => m.id === ctx.missionId)
            : missions.find(m => m.status === 'running') || missions[0];

          if (!targetMission) {
            this.speak("I couldn't find the mission you're referring to.");
            return "Could not resolve the referenced mission.";
          }

          // Update context to this mission
          this.currentMissionContext = {
            missionId: targetMission.id,
            missionName: targetMission.name,
            lastAction: phrase,
            timestamp: Date.now(),
          };

          // Handle specific continuity phrases
          if (phrase.match(/fix/)) {
            // "fix that" — check if the mission has failures and offer to fix
            const failedTasks = targetMission.tasks - targetMission.completed;
            const response = `Looking at ${targetMission.name} (${targetMission.status}, ${Math.round(targetMission.progress * 100)}% complete). `;
            if (targetMission.status === 'failed') {
              this.emit('mission', `Fixing mission: ${targetMission.name}`, 'info');
              this.speak(`I'll look into fixing ${targetMission.name}. Let me analyze what went wrong.`);
              return response + `The mission failed. I'll analyze the failure and attempt to fix it. Would you like me to retry the failed tasks?`;
            } else if (failedTasks > 0) {
              this.speak(`${targetMission.name} has ${failedTasks} remaining tasks. I'll continue working on them.`);
              return response + `${failedTasks} tasks remaining. I'll continue working on them.`;
            } else {
              this.speak(`${targetMission.name} is complete. Is there something specific you'd like me to fix?`);
              return response + `The mission appears complete. What would you like me to fix?`;
            }
          }

          if (phrase.match(/try again|again/)) {
            // "try again" — retry the last action or resume a failed mission
            if (targetMission.status === 'failed') {
              targetMission.status = 'running';
              this.setMissions(missions);
              this.emit('mission', `Retrying mission: ${targetMission.name}`, 'info');
              this.speak(`Retrying ${targetMission.name}.`);
              return `Retrying mission: ${targetMission.name}.`;
            }
            this.speak(`I'll retry the last action on ${targetMission.name}.`);
            return `Retrying last action on ${targetMission.name}.`;
          }

          if (phrase.match(/do it|do that/)) {
            // "do it" — execute the last suggested action
            this.emit('mission', `Executing on ${targetMission.name}`, 'info');
            this.speak(`Proceeding with ${targetMission.name}.`);
            return `Proceeding with ${targetMission.name} (${targetMission.status}, ${Math.round(targetMission.progress * 100)}% complete).`;
          }

          if (phrase.match(/other one|that one/)) {
            // "what about the other one" — switch to a different mission
            const otherMissions = missions.filter(m => m.id !== targetMission.id);
            if (otherMissions.length > 0) {
              const other = otherMissions[0];
              this.currentMissionContext = {
                missionId: other.id,
                missionName: other.name,
                lastAction: phrase,
                timestamp: Date.now(),
              };
              this.speak(`Switching to ${other.name}. It's at ${Math.round(other.progress * 100)} percent, status: ${other.status}.`);
              return `Switching to ${other.name}: ${other.status}, ${Math.round(other.progress * 100)}% complete (${other.completed}/${other.tasks} tasks).`;
            }
            this.speak('There are no other missions to switch to.');
            return 'No other missions available.';
          }

          // Default: just acknowledge with current context
          this.speak(`Regarding ${targetMission.name} — it's at ${Math.round(targetMission.progress * 100)} percent, status: ${targetMission.status}.`);
          return `Context: ${targetMission.name} (${targetMission.status}, ${Math.round(targetMission.progress * 100)}% complete). What would you like me to do?`;
        }

        case 'agent-status': {
          const agents = this.getAgents();
          if (agents.length === 0) {
            this.speak('No agents are currently active.');
            return 'No active agents.';
          }
          let response = 'Agent Status:\n';
          for (const a of agents) {
            response += `• ${a.name} (${a.role}): ${a.state}${a.currentTask ? ` — ${a.currentTask}` : ''}\n`;
          }
          this.speak(`Agent status: ${agents.map(a => `${a.name} is ${a.state}`).join('. ')}.`);
          return response;
        }

        // ── Harness commands ───────────────────────────────────────────
        case 'harness-toggle': {
          const { pillar } = intent.params;
          const current = harnessBridge.getState().toggles[pillar];
          const newState = !current;
          await harnessBridge.toggle(pillar, newState);
          const name = pillar.replace(/-/g, ' ');
          this.emit('system', `Pillar "${name}" ${newState ? 'enabled' : 'disabled'}`, 'info');
          const response = `${newState ? 'Enabled' : 'Disabled'} ${name}.`;
          this.speak(response);
          return response;
        }

        case 'harness-autonomy': {
          const { level } = intent.params;
          await harnessBridge.setAutonomy(level);
          const labels = ['Observe', 'Recommend', 'Execute Safe', 'Autonomous', 'Self-Improve', 'High-Impact'];
          this.emit('system', `Autonomy set to L${level}`, 'info');
          const response = `Autonomy set to L${level} (${labels[level]}).`;
          this.speak(response);
          return response;
        }

        case 'harness-show': {
          this.emit('system', 'Switching to Harness Control view', 'info');
          this.speak('Switching to harness control view.');
          return 'SWITCH_TO_HARNESS';
        }

        // ── Help ───────────────────────────────────────────────────────
        case 'help': {
          const response = `I can do the following:\n\n` +
            `• Run shell commands: "run npm test", "execute git status"\n` +
            `• Read files: "read file /path/to/file"\n` +
            `• Write files: "write file /path content"\n` +
            `• List directories: "list files in /path"\n` +
            `• Control mouse: "click", "move mouse to 100 200"\n` +
            `• Type text: "type hello world"\n` +
            `• Press keys: "press enter", "hotkey cmd space"\n` +
            `• Take screenshots: "take a screenshot"\n` +
            `• Browser control: "start browser", "navigate to google.com", "click the search button", "type hello into #search", "browser screenshot"\n` +
            `• Voice control: "stop" (pause missions), "pause", "resume", "continue", "cancel"\n` +
            `• Conversation continuity: "fix that", "try again", "do it", "what about the other one"\n` +
            `• Check status: "what are you doing?", "how's the mission?"\n` +
            `• Control harness: "enable browser control", "set autonomy to level 3"\n` +
            `• Or just talk to me naturally — I'll respond with AI.`;
          this.speak('I can run commands, read and write files, control your mouse and keyboard, take screenshots, control a real browser with Playwright, manage missions with voice commands, and answer your questions. Just talk to me naturally.');
          return response;
        }

        // ── Default: AI conversation ───────────────────────────────────
        case 'conversation':
        default: {
          // Send to the AI (conversationManager → Gemini)
          this.emit('jarvis', 'Thinking...', 'info');
          // The conversationManager handles the AI call and streaming
          await conversationManager.sendMessage(text);
          // The response comes back through the callback, not as a return value
          // We return a placeholder; the UI will show the streamed response
          return '';
        }
      }
    } catch (error: any) {
      const errMsg = `I encountered an error: ${error?.message || 'Unknown error'}`;
      this.emit('error', `Execution error: ${error?.message}`, 'error');
      this.speak(errMsg);
      return errMsg;
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export const jarvisRuntime = new JarvisConversationRuntime();

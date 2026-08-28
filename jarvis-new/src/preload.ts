import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Config + key presence (deeply-isolated main-process secret snapshot)
  getConfig: () => ipcRenderer.invoke('jarvis:get-config'),
  hasKey: (name: string) => ipcRenderer.invoke('jarvis:has-key', name),

  // Text-to-speech via main process ElevenLabs bridge
  synthesize: (text: string, opts: Record<string, any> = {}) =>
    ipcRenderer.invoke('jarvis:synthesize', { text, ...opts }),

  // Speech-to-text fallback via main process Deepgram bridge
  transcribeAudio: (audioBytes: Uint8Array, opts: Record<string, any> = {}) =>
    ipcRenderer.invoke('jarvis:transcribe', { audioBytes, ...opts }),

  // User commands
  sendCommand: (command: string) => ipcRenderer.invoke('user:command', command),
  sendVoice: (transcript: string) => ipcRenderer.invoke('user:voice', transcript),

  // System dialogs
  selectFolder: () => ipcRenderer.invoke('system:select-folder'),
  selectFile: () => ipcRenderer.invoke('system:select-file'),

  // App status
  getStatus: () => ipcRenderer.invoke('app:status'),

  // AI events from main process
  onAIConnected: (callback: (data: any) => void) => {
    ipcRenderer.on('ai:connected', (_, data) => callback(data));
  },
  onAIDisconnected: (callback: () => void) => {
    ipcRenderer.on('ai:disconnected', () => callback());
  },
  onAIError: (callback: (data: any) => void) => {
    ipcRenderer.on('ai:error', (_, data) => callback(data));
  },
  onAIMessage: (callback: (data: any) => void) => {
    ipcRenderer.on('ai:message', (_, data) => callback(data));
  },
  onAgentUpdate: (callback: (data: any) => void) => {
    ipcRenderer.on('agent_update', (_, data) => callback(data));
  },
  onExecutionStatus: (callback: (data: any) => void) => {
    ipcRenderer.on('execution_status', (_, data) => callback(data));
  },

  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

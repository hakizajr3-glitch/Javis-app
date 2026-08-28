// Tauri preload script
// This runs in the renderer and exposes safe APIs to the webview

const { invoke } = window.__TAURI__?.core || {};
const { listen } = window.__TAURI__?.event || {};

// Reuse WebSocket connection
let wsConnection: WebSocket | null = null;

function getWebSocket(): WebSocket {
  if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
    wsConnection = new WebSocket('ws://localhost:8000/ws/desktop');
  }
  return wsConnection;
}

// Expose APIs to renderer
window.electronAPI = {
  sendCommand: async (command: string) => {
    // Try WebSocket first (most reliable)
    return new Promise((resolve, reject) => {
      try {
        const ws = getWebSocket();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'user_command',
            payload: { command, context: {} }
          }));
          resolve(undefined);
        } else {
          ws.onopen = () => {
            ws.send(JSON.stringify({
              type: 'user_command',
              payload: { command, context: {} }
            }));
            resolve(undefined);
          };
        }
      } catch (e) {
        reject(e);
      }
    });
  },
  
  sendVoice: async (transcript: string) => {
    const ws = getWebSocket();
    ws.send(JSON.stringify({
      type: 'voice_command',
      payload: { transcript, context: {} }
    }));
  },

  // Not implemented in Tauri
  selectFolder: async () => { throw new Error('Not implemented'); },
  selectFile: async () => { throw new Error('Not implemented'); },
  getStatus: async () => 'ok',

  // Event listeners
  onAIConnected: (callback: (data: any) => void) => {
    listen('ai:connected', (event: any) => callback(event.payload));
  },
  onAIDisconnected: (callback: () => void) => {
    listen('ai:disconnected', () => callback());
  },
  onAIError: (callback: (data: any) => void) => {
    listen('ai:error', (event: any) => callback(event.payload));
  },
  onAIMessage: (callback: (data: any) => void) => {
    listen('ai:message', (event: any) => callback(event.payload));
  },
  onAgentUpdate: (callback: (data: any) => void) => {
    listen('agent_update', (event: any) => callback(event.payload));
  },
  onExecutionStatus: (callback: (data: any) => void) => {
    listen('execution_status', (event: any) => callback(event.payload));
  },

  removeAllListeners: (channel: string) => {
    // Tauri doesn't have this, but that's okay
  }
};
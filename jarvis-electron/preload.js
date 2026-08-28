const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("electronAPI", {
  getConfig: () => ipcRenderer.invoke("jarvis:get-config"),
  synthesize: (text, opts = {}) => ipcRenderer.invoke("jarvis:synthesize", { text, ...opts }),
  transcribeAudio: (audioBytes, opts = {}) => ipcRenderer.invoke("jarvis:transcribe", { audioBytes, ...opts }),
  hasKey: (name) => ipcRenderer.invoke("jarvis:has-key", name),
});

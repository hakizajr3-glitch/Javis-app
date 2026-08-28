import { app, BrowserWindow, ipcMain, desktopCapturer, dialog, shell, Menu } from 'electron';
import * as path from 'path';

// Enable Speech Recognition API in Chromium
app.commandLine.appendSwitch('enable-features', 'SpeechRecognition');
app.commandLine.appendSwitch('enable-web-speech');
app.commandLine.appendSwitch('allow-file-access-from-files');
import WebSocket from 'ws';
import { spawn } from 'child_process';
import * as fs from 'fs';

// Global state
let mainWindow: BrowserWindow | null = null;
let wsConnection: WebSocket | null = null;
let pythonProcess: any = null;

const isMac = process.platform === 'darwin';

// WebSocket connection to Python AI Core
const WS_URL = 'ws://127.0.0.1:8000/ws/desktop';

// Create macOS app menu
function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' as const },
          { role: 'delete' as const },
          { role: 'selectAll' as const },
        ] : [
          { role: 'delete' as const },
          { type: 'separator' as const },
          { role: 'selectAll' as const }
        ])
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
          { type: 'separator' as const },
          { role: 'window' as const }
        ] : [
          { role: 'close' as const }
        ])
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
    },
    show: false,
    backgroundColor: '#0a0a0f',
  });

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Connect to Python AI Core via WebSocket
function connectToAIEngine() {
  console.log('Connecting to AI Engine...');
  
  wsConnection = new WebSocket(WS_URL);
  
  wsConnection.on('open', () => {
    console.log('Connected to AI Engine');
    broadcastToRenderer('ai:connected', { status: 'connected' });
  });
  
  wsConnection.on('message', (data: WebSocket.RawData) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('[Main] Received from AI Engine:', message.type);
      handleAIMessage(message);
    } catch (err) {
      console.error('[Main] Failed to parse AI message:', err);
    }
  });
  
  wsConnection.on('error', (err: Error) => {
    console.error('AI Engine connection error:', err);
    broadcastToRenderer('ai:error', { error: err.message });
  });
  
  wsConnection.on('close', () => {
    console.log('AI Engine disconnected');
    broadcastToRenderer('ai:disconnected', {});
    // Attempt reconnect after 3 seconds
    setTimeout(connectToAIEngine, 3000);
  });
}

// Handle messages from AI Engine
function handleAIMessage(message: any) {
  switch (message.type) {
    case 'command':
      executeSystemCommand(message.payload);
      break;
    case 'screenshot_request':
      captureScreenshot(message.id);
      break;
    case 'browser_launch':
      launchBrowser(message.payload);
      break;
    case 'file_operation':
      handleFileOperation(message.payload);
      break;
    case 'response':
    case 'agent_update':
    case 'execution_status':
      // Send as ai:message so frontend can receive it
      broadcastToRenderer('ai:message', { type: message.type, payload: message.payload });
      break;
    default:
      broadcastToRenderer('ai:message', message);
  }
}

// Send message to AI Engine
function sendToAIEngine(type: string, payload: any) {
  console.log(`[Main] Sending to AI Engine: ${type}`, payload);
  if (wsConnection?.readyState === WebSocket.OPEN) {
    const message = JSON.stringify({ type, payload, timestamp: Date.now() });
    wsConnection.send(message);
    console.log(`[Main] Message sent to AI Engine: ${type}`);
  } else {
    console.error(`[Main] Cannot send message - WebSocket not open. State: ${wsConnection?.readyState}`);
  }
}

// Broadcast to renderer process
function broadcastToRenderer(channel: string, data: any) {
  mainWindow?.webContents.send(channel, data);
}

// Execute system commands
async function executeSystemCommand(payload: any) {
  const { command, args } = payload;
  
  try {
    switch (command) {
      case 'launch_app':
        await shell.openPath(args.path);
        break;
      case 'open_external':
        await shell.openExternal(args.url);
        break;
      case 'show_item':
        await shell.showItemInFolder(args.path);
        break;
    }
    
    sendToAIEngine('command_complete', { command, success: true });
  } catch (err) {
    sendToAIEngine('command_complete', { command, success: false, error: err });
  }
}

// Capture screenshot
async function captureScreenshot(requestId: string) {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 1920, height: 1080 }
    });
    
    const screenSource = sources.find(s => s.name === 'Entire Screen') || sources[0];
    
    if (screenSource) {
      const thumbnail = screenSource.thumbnail.toPNG();
      const base64Image = thumbnail.toString('base64');
      
      sendToAIEngine('screenshot_data', {
        requestId,
        image: base64Image,
        sourceName: screenSource.name
      });
    }
  } catch (err) {
    console.error('Screenshot failed:', err);
    sendToAIEngine('screenshot_error', { requestId, error: err });
  }
}

// Launch browser - platform-aware
function launchBrowser(payload: any) {
  const { url } = payload;
  
  // On macOS, use open command for better integration
  if (process.platform === 'darwin') {
    spawn('open', [url]);
  } else {
    shell.openExternal(url);
  }
}

// Handle file operations
async function handleFileOperation(payload: any) {
  const { operation, params } = payload;
  
  try {
    let result;
    
    switch (operation) {
      case 'read':
        result = fs.readFileSync(params.path, 'utf-8');
        break;
      case 'write':
        fs.writeFileSync(params.path, params.content);
        result = { success: true };
        break;
      case 'exists':
        result = fs.existsSync(params.path);
        break;
      case 'mkdir':
        fs.mkdirSync(params.path, { recursive: true });
        result = { success: true };
        break;
      case 'readdir':
        result = fs.readdirSync(params.path);
        break;
    }
    
    sendToAIEngine('file_operation_complete', { operation, result });
  } catch (err) {
    sendToAIEngine('file_operation_error', { operation, error: err });
  }
}

// Start Python AI Core
function startAIEngine() {
  try {
    const enginePath = path.join(__dirname, '../../engine');
    
    pythonProcess = spawn('python3', ['-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', '8000', '--reload'], {
      cwd: enginePath,
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });
    
    pythonProcess.stdout.on('data', (data: Buffer) => {
      console.log(`[AI Engine]: ${data}`);
    });
    
    pythonProcess.stderr.on('data', (data: Buffer) => {
      console.error(`[AI Engine Error]: ${data}`);
    });
    
    pythonProcess.on('close', (code: number) => {
      console.log(`AI Engine exited with code ${code}`);
    });
    
    pythonProcess.on('error', (_err: Error) => {
      console.log('AI Engine not available (Python not found). Running in UI-only mode.');
    });
  } catch (err) {
    console.log('AI Engine startup failed. Running in UI-only mode.');
  }
}

// IPC Handlers
ipcMain.handle('user:command', async (event, command: string) => {
  sendToAIEngine('user_command', { command, context: {} });
  return { sent: true };
});

ipcMain.handle('user:voice', async (event, transcript: string) => {
  sendToAIEngine('voice_command', { transcript });
  return { sent: true };
});

ipcMain.handle('system:select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  });
  return result.filePaths[0];
});

ipcMain.handle('system:select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile']
  });
  return result.filePaths[0];
});

ipcMain.handle('app:status', () => {
  return {
    aiConnected: wsConnection?.readyState === WebSocket.OPEN,
    timestamp: Date.now()
  };
});

// App lifecycle
app.whenReady().then(() => {
  createMenu();
  createWindow();
  startAIEngine();
  
  // Wait a bit for Python to start, then connect
  setTimeout(connectToAIEngine, 2000);
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    pythonProcess?.kill();
    app.quit();
  }
});

app.on('before-quit', () => {
  pythonProcess?.kill();
});

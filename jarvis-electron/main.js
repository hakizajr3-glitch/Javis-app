// main.js — Electron main process for the J.A.R.V.I.S. desktop app.
// Mirrors the Tauri main.rs pattern: reads .env once at boot, exposes secret-bearing
// config and audio services to the renderer through a contextBridge-isolated preload.
//
// IMPORTANT: do not log secret values. Anything we expose through IPC should be
// explicitly named — the renderer never sees raw env.
const { app, BrowserWindow, ipcMain, session, protocol, net } = require('electron');
const path = require('path');
// dotenv is a no-op if the file is missing; we never crash when secrets are absent.
try { require('dotenv').config({ path: path.join(__dirname, '.env') }); } catch (_) {}

// Register a custom secure protocol so the packaged Electron app can load
// its own files without losing the Secure Context that getUserMedia() and
// the Camera API require. Loading dist/index.html over file:// strips the
// secure context; loading via jarvis://app/ preserves it.
protocol.registerSchemesAsPrivileged([
  { scheme: 'jarvis', privileges: { secure: true, standard: true, supportFetchAPI: true, bypassCSP: false } }
]);

const env = process.env;

// Read-once secret snapshot — short names so accidental logging is obviously a leak.
const SECRETS = Object.freeze({
  gemini_api_key: env.GEMINI_API_KEY || env.GOOGLE_API_KEY || '',
  deepgram_api_key: env.DEEPGRAM_API_KEY || '',
  elevenlabs_api_key: env.ELEVENLABS_API_KEY || '',
  elevenlabs_voice_id: env.ELEVENLABS_VOICE_ID || env.ELEVENLABS_VOICE || '',
  livekit_api_key: env.LIVEKIT_API_KEY || '',
  livekit_api_secret: env.LIVEKIT_API_SECRET || '',
  livekit_url: env.LIVEKIT_URL || '',
});

// Strip secrets to booleans for `hasKey` probes — renderer can know *what* is
// configured without ever learning *what* the secret is.
const PUBLIC_PRESENCE = Object.fromEntries(
  Object.entries(SECRETS).map(([k, v]) => [k, Boolean(v && String(v).trim())])
);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // Disable Web Speech API network dependency in renderer — we proxy STT/TTS
      // through IPC instead, so Chromium doesn't try to reach a missing cloud STT.
    },
    backgroundColor: '#0a0e14',
    title: 'JARVIS',
    show: false,
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5177');
    mainWindow.webContents.openDevTools();
  } else {
    // Use the custom jarvis://app/ scheme in production so the renderer
    // keeps a secure context and getUserMedia() / navigator.mediaDevices
    // continue to work in the packaged .app.
    mainWindow.loadURL('jarvis://app/index.html');
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ---- IPC: configuration --------------------------------------------------------
ipcMain.handle('jarvis:get-config', () => SECRETS);

ipcMain.handle('jarvis:has-key', (_evt, name) => {
  if (typeof name !== 'string') return false;
  return Boolean(PUBLIC_PRESENCE[name]);
});

// ---- IPC: text-to-speech via ElevenLabs -----------------------------------------
// Same REST endpoint Tauri's Rust side calls (Eleven Flash v2 by default for speed).
ipcMain.handle('jarvis:synthesize', async (_evt, payload = {}) => {
  const text = (payload && payload.text) || '';
  if (!text.trim()) return { ok: false, reason: 'empty-text' };
  const apiKey = SECRETS.elevenlabs_api_key;
  const voiceId = (payload && payload.voiceId) || SECRETS.elevenlabs_voice_id;
  if (!apiKey || !voiceId) {
    return { ok: false, reason: 'no-elevenlabs-config' };
  }
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: payload.model_id || 'eleven_flash_v2',
          voice_settings: payload.voice_settings || {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );
    if (!res.ok) {
      return { ok: false, reason: `elevenlabs-${res.status}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: true, audio: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), mime: 'audio/mpeg' };
  } catch (e) {
    return { ok: false, reason: 'network-error', message: String(e && e.message || e) };
  }
});

// ---- IPC: speech-to-text fallback via Deepgram ----------------------------------
// Renderer sends recorded mic bytes when window.webkitSpeechRecognition fails.
ipcMain.handle('jarvis:transcribe', async (_evt, payload = {}) => {
  const apiKey = SECRETS.deepgram_api_key;
  if (!apiKey) return { ok: false, reason: 'no-deepgram-config' };
  const bytes = payload && payload.audioBytes;
  if (!bytes) return { ok: false, reason: 'empty-audio' };
  const mime = (payload && payload.mime) || 'audio/webm';
  try {
    const url = new URL('https://api.deepgram.com/v1/listen');
    url.searchParams.set('model', (payload && payload.model) || 'nova-2');
    url.searchParams.set('smart_format', 'true');
    url.searchParams.set('language', (payload && payload.language) || 'en-US');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': mime,
      },
      body: Buffer.from(bytes),
    });
    if (!res.ok) {
      return { ok: false, reason: `deepgram-${res.status}` };
    }
    const data = await res.json();
    const transcript =
      data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    return { ok: true, transcript };
  } catch (e) {
    return { ok: false, reason: 'network-error', message: String(e && e.message || e) };
  }
});

app.whenReady().then(() => {
  // In production, wire the jarvis://app/ scheme to the dist/ folder so
  // the renderer loads from the same files as before, but over a secure
  // context. Files are served relative to the app root (__dirname).
  if (app.isPackaged) {
    protocol.handle('jarvis', (request) => {
      const url = new URL(request.url);
      let filePath = url.pathname;
      // Strip the leading '/app/' prefix so jarvis://app/index.html serves
      // dist/index.html. Use replace() instead of slice() to avoid
      // off-by-one path construction.
      filePath = filePath.replace(/^\/app\//, '');
      if (!filePath) filePath = 'index.html';

      // Resolve the requested file and lock it inside dist/ to prevent
      // directory-traversal requests (e.g. jarvis://app/../../etc/passwd).
      const base = path.join(__dirname, 'dist');
      const resolved = path.normalize(path.join(base, filePath));
      if (!resolved.startsWith(base + path.sep)) {
        return new Response('Forbidden', { status: 403, headers: { 'Content-Type': 'text/plain' } });
      }

      return net.fetch('file://' + resolved);
    });
  }

  // Allow camera + microphone permission requests in the native shell.
  // Without this handler, getUserMedia() silently returns NotAllowedError
  // inside the packaged Electron app even when macOS TCC is granted.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'mediaKeySystem' || permission === 'camera' || permission === 'microphone') {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Also allow permission checks (Electron >= 25) so existing granted
  // states are not blocked. Returning undefined for unrelated permissions
  // lets Electron fall back to its default behavior instead of blanket-denying.
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (['media', 'mediaKeySystem', 'camera', 'microphone'].includes(permission)) {
      return true;
    }
    return undefined;
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { handleConnection } from './websocket/handler.js';
import { SessionManager } from './memory/sessionManager.js';
import { startSupabaseServer } from './supabase/api.js';

dotenv.config();

const PORT = parseInt(process.env.WS_PORT || '8000');
const API_PORT = parseInt(process.env.API_PORT || '8080');

const wss = new WebSocketServer({ port: PORT });

// Supabase-authenticated HTTP API (health / JWT / secret-key endpoints)
const supabaseServer = startSupabaseServer(API_PORT);

const sessionManager = new SessionManager();

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║       J.A.R.V.I.S. VOICE AI BACKEND v1.0              ║');
console.log('║       Production-Ready Real-Time Pipeline             ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');
console.log(`🌐 WebSocket Server: ws://localhost:${PORT}`);
console.log(`📊 Max Sessions: ${process.env.MAX_SESSIONS || '50'}`);
console.log('');

wss.on('connection', (ws: WebSocket) => {
  const sessionId = sessionManager.createSession();
  console.log(`🔗 Client connected: ${sessionId}`);

  handleConnection(ws, sessionId, sessionManager);

  ws.on('close', () => {
    console.log(`🔌 Client disconnected: ${sessionId}`);
    sessionManager.deleteSession(sessionId);
  });

  ws.on('error', (error) => {
    console.error(`❌ WebSocket error [${sessionId}]:`, error);
  });
});

wss.on('error', (error) => {
  console.error('❌ Server error:', error);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  supabaseServer.close();
  wss.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
});
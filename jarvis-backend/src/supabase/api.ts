/**
 * Supabase API — real auth for the J.A.R.V.I.S. backend.
 *
 * Uses `@supabase/server`'s `withSupabase` wrapper, which validates the
 * credential for each request and injects a fully-scoped SupabaseContext:
 *   - supabase       → RLS-scoped client (user or anon)
 *   - supabaseAdmin  → bypasses RLS (secret key only)
 *   - userClaims     → JWT identity (id, email, role)
 *
 * Endpoints:
 *   GET /api/health        → auth: 'none'      (open, liveness probe)
 *   GET /api/me            → auth: 'user'      (requires a valid user JWT)
 *   GET /api/service/ping  → auth: 'secret'    (server-to-server)
 *
 * Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY,
 *      SUPABASE_JWKS_URL (read from process.env per request).
 */
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { withSupabase } from '@supabase/server';

// ────────────────────────────────────────────────────────────────────────────
// Node ↔ Web-standard request bridging (Node 22 has native Request/Response)
// ────────────────────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk as Buffer));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
  }
  const hasBody = !['GET', 'HEAD'].includes(req.method || 'GET');
  const body = hasBody ? await readBody(req) : undefined;
  return new Request(url, { method: req.method, headers, body });
}

async function writeWebResponse(res: ServerResponse, webRes: Response): Promise<void> {
  const body = Buffer.from(await webRes.arrayBuffer());
  // Headers.entries() collapses duplicate set-cookie values, which would
  // silently drop auth/session cookies — write them individually first.
  const headers = Object.fromEntries(webRes.headers.entries());
  delete headers['set-cookie'];
  for (const cookie of webRes.headers.getSetCookie()) {
    res.appendHeader('set-cookie', cookie);
  }
  res.writeHead(webRes.status, headers);
  res.end(body);
}

// ────────────────────────────────────────────────────────────────────────────
// Handlers
// ────────────────────────────────────────────────────────────────────────────

/** Open liveness probe — no credentials required. */
const health = withSupabase({ auth: 'none' }, async (_req) => {
  return Response.json({
    status: 'ok',
    service: 'jarvis-backend',
    supabase: true,
    time: new Date().toISOString(),
  });
});

/** Authenticated endpoint — only runs for requests with a valid user JWT. */
const me = withSupabase({ auth: 'user' }, async (_req, ctx) => {
  return Response.json({
    user: ctx.userClaims,
    authMode: ctx.authMode,
  });
});

/** Server-to-server endpoint — protected by the Supabase secret key. */
const servicePing = withSupabase({ auth: 'secret' }, async (_req, ctx) => {
  return Response.json({
    ok: true,
    authMode: ctx.authMode,
    message: 'authenticated with Supabase secret key',
  });
});

const routes: Record<string, (req: Request) => Promise<Response>> = {
  '/api/health': health,
  '/api/me': me,
  '/api/service/ping': servicePing,
};

// ────────────────────────────────────────────────────────────────────────────
// HTTP server
// ────────────────────────────────────────────────────────────────────────────

export function startSupabaseServer(port: number): ReturnType<typeof createServer> {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const handler = routes[url.pathname];
      if (!handler) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not_found', path: url.pathname }));
        return;
      }
      const webReq = await toWebRequest(req);
      const webRes = await handler(webReq);
      await writeWebResponse(res, webRes);
    } catch (err) {
      console.error('[Supabase API] handler error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal_error' }));
    }
  });

  server.listen(port, () => {
    console.log(`🔐 Supabase HTTP API: http://localhost:${port}`);
    console.log(`   Routes: /api/health (open) · /api/me (JWT) · /api/service/ping (secret)`);
  });

  server.on('error', (err) => {
    console.error('❌ Supabase API server error:', err);
  });

  return server;
}

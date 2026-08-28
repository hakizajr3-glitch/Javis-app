import { describe, it, expect, afterEach } from 'vitest';
import http from 'http';
import { createApiServer } from './server.js';
import { signToken } from './middleware/auth.js';

const TEST_SECRET = 'test-secret-key-for-vitest';

function request(port: number, path: string, options: { method?: string; headers?: Record<string, string>; body?: any } = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: options.method || 'GET', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let body: any;
          try { body = JSON.parse(data); } catch { body = data; }
          resolve({ status: res.statusCode || 0, body });
        });
      }
    );
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

describe('API Server', () => {
  let server: http.Server | null = null;
  let port = 0;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
  });

  it('starts and responds to /health', async () => {
    port = 13900 + Math.floor(Math.random() * 1000);
    const result = createApiServer({ port });
    server = result.server;
    await new Promise((r) => setTimeout(r, 300));

    const res = await request(port, '/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('serves /api info with all endpoints including events and auth', async () => {
    port = 13900 + Math.floor(Math.random() * 1000);
    const result = createApiServer({ port });
    server = result.server;
    await new Promise((r) => setTimeout(r, 300));

    const res = await request(port, '/api');
    expect(res.status).toBe(200);
    expect(res.body.endpoints).toContain('/api/events');
    expect(res.body.endpoints).toContain('/api/auth');
  });

  it('returns 404 for unknown routes', async () => {
    port = 13900 + Math.floor(Math.random() * 1000);
    const result = createApiServer({ port });
    server = result.server;
    await new Promise((r) => setTimeout(r, 300));

    const res = await request(port, '/api/nonexistent');
    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated requests when auth is enabled', async () => {
    port = 13900 + Math.floor(Math.random() * 1000);
    const result = createApiServer({ port, authEnabled: true, jwtSecret: TEST_SECRET });
    server = result.server;
    await new Promise((r) => setTimeout(r, 300));

    const res = await request(port, '/api/missions/active');
    expect(res.status).toBe(401);
  });

  it('accepts valid JWT when auth is enabled', async () => {
    port = 13900 + Math.floor(Math.random() * 1000);
    const result = createApiServer({ port, authEnabled: true, jwtSecret: TEST_SECRET });
    server = result.server;
    await new Promise((r) => setTimeout(r, 300));

    const token = signToken({ userId: 'test-user' }, { secret: TEST_SECRET });
    const res = await request(port, '/api/missions/active', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it('rejects invalid JWT', async () => {
    port = 13900 + Math.floor(Math.random() * 1000);
    const result = createApiServer({ port, authEnabled: true, jwtSecret: TEST_SECRET });
    server = result.server;
    await new Promise((r) => setTimeout(r, 300));

    const res = await request(port, '/api/missions/active', {
      headers: { Authorization: 'Bearer invalid-token' },
    });
    expect(res.status).toBe(401);
  });

  it('keeps /health public when auth is enabled', async () => {
    port = 13900 + Math.floor(Math.random() * 1000);
    const result = createApiServer({ port, authEnabled: true, jwtSecret: TEST_SECRET });
    server = result.server;
    await new Promise((r) => setTimeout(r, 300));

    const res = await request(port, '/health');
    expect(res.status).toBe(200);
  });

  it('issues tokens via /api/auth/token bootstrap endpoint', async () => {
    port = 13900 + Math.floor(Math.random() * 1000);
    const result = createApiServer({ port, authEnabled: true, jwtSecret: TEST_SECRET });
    server = result.server;
    await new Promise((r) => setTimeout(r, 300));

    const res = await request(port, '/api/auth/token', {
      method: 'POST',
      body: { userId: 'bootstrap-user' },
    });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  it('serves /api/events/stats without auth disabled', async () => {
    port = 13900 + Math.floor(Math.random() * 1000);
    const result = createApiServer({ port });
    server = result.server;
    await new Promise((r) => setTimeout(r, 300));

    const res = await request(port, '/api/events/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalEvents');
  });
});

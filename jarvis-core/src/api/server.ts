import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import http from 'http';
import missionsRouter from './routes/missions.js';
import notesRouter from './routes/notes.js';
import tasksRouter from './routes/tasks.js';
import contactsRouter from './routes/contacts.js';
import workforceRouter from './routes/workforce.js';
import organizationsRouter from './routes/organizations.js';
import memoryRouter from './routes/memory.js';
import artifactsRouter from './routes/artifacts.js';
import dashboardRouter from './routes/dashboard.js';
import securityRouter from './routes/security.js';
import llmRouter from './routes/llm.js';
import eventsRouter from './routes/events.js';
import harnessRouter from './routes/harness.js';
import pairingRouter from './routes/pairing.js';
import { createAuthRouter } from './routes/auth.js';
import { createAuthMiddleware } from './middleware/auth.js';

export interface ApiServerOptions {
  port?: number;
  corsOrigin?: string | string[];
  authEnabled?: boolean;
  /** JWT secret. Falls back to process.env.JARVIS_JWT_SECRET. */
  jwtSecret?: string;
}

export function createApiServer(options: ApiServerOptions = {}): { app: Express; server: http.Server } {
  const app = express();
  const port = options.port || parseInt(process.env.JARVIS_API_PORT || '3001');

  app.use(cors({ origin: options.corsOrigin || '*' }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`[API] ${req.method} ${req.path}`);
    next();
  });

  // Auth middleware (optional — enabled via authEnabled or JARVIS_API_AUTH=true)
  const authEnabled = options.authEnabled ?? process.env.JARVIS_API_AUTH === 'true';
  if (authEnabled) {
    app.use(createAuthMiddleware({ secret: options.jwtSecret }));
    console.log('[JARVIS API] Auth middleware enabled');
  }

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API info
  app.get('/api', (_req: Request, res: Response) => {
    res.json({
      name: 'JARVIS Core API',
      version: '1.0.0',
      endpoints: [
        '/api/auth',
        '/api/missions',
        '/api/notes',
        '/api/tasks',
        '/api/contacts',
        '/api/agents',
        '/api/teams',
        '/api/organizations',
        '/api/memory',
        '/api/artifacts',
        '/api/dashboard',
        '/api/events',
        '/api/security',
        '/api/llm',
        '/api/harness',
      ],
    });
  });

  // API routes
  app.use('/api/auth', createAuthRouter({ jwtSecret: options.jwtSecret }));
  app.use('/api/missions', missionsRouter);
  app.use('/api/notes', notesRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/contacts', contactsRouter);
  app.use('/api/agents', workforceRouter);
  app.use('/api/teams', workforceRouter);
  app.use('/api/organizations', organizationsRouter);
  app.use('/api/memory', memoryRouter);
  app.use('/api/artifacts', artifactsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/security', securityRouter);
  app.use('/api/llm', llmRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/harness', harnessRouter);
  app.use('/api/pairing', pairingRouter);

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found', path: req.path });
  });

  // Error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[API] Error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  const server = http.createServer(app);

  server.listen(port, () => {
    console.log(`[JARVIS API] Server running on http://localhost:${port}`);
  });

  return { app, server };
}

import { Router, Request, Response } from 'express';
import { signToken } from '../middleware/auth.js';

export interface AuthRouterOptions {
  /** JWT secret passed down from the API server. Falls back to process.env.JARVIS_JWT_SECRET. */
  jwtSecret?: string;
}

/**
 * Bootstrap token endpoint.
 * Guarded by JARVIS_BOOTSTRAP_KEY when set; otherwise open (local dev).
 */
export function createAuthRouter(options: AuthRouterOptions = {}): Router {
  const router: Router = Router();

  router.post('/token', async (req: Request, res: Response) => {
    try {
      const bootstrapKey = process.env.JARVIS_BOOTSTRAP_KEY;
      if (bootstrapKey) {
        const provided = req.headers['x-bootstrap-key'];
        if (provided !== bootstrapKey) {
          return res.status(403).json({ error: 'Invalid bootstrap key' });
        }
      }

      const { userId, expiresIn } = req.body;
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'userId is required' });
      }

      const token = signToken({ userId }, { secret: options.jwtSecret, expiresIn });
      res.json({ token, userId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default createAuthRouter;

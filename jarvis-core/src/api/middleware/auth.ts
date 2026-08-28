import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthMiddlewareOptions {
  /** JWT secret. Falls back to process.env.JARVIS_JWT_SECRET. */
  secret?: string;
  /** Paths that never require auth. */
  publicPaths?: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    [key: string]: any;
  };
}

const DEFAULT_PUBLIC_PATHS = ['/health', '/api', '/api/auth'];

function resolveSecret(options: AuthMiddlewareOptions): string {
  const secret = options.secret || process.env.JARVIS_JWT_SECRET;
  if (!secret) {
    throw new Error(
      '[auth] JWT secret not configured. Set JARVIS_JWT_SECRET or pass secret in AuthMiddlewareOptions.'
    );
  }
  return secret;
}

export function createAuthMiddleware(options: AuthMiddlewareOptions = {}) {
  const secret = resolveSecret(options);
  const publicPaths = new Set([...DEFAULT_PUBLIC_PATHS, ...(options.publicPaths || [])]);

  // Exact-match-only paths (e.g. '/api' must not make every /api/* route public).
  const exactOnly = new Set(['/api']);
  const isPublic = (path: string): boolean => {
    if (publicPaths.has(path)) return true;
    for (const p of publicPaths) {
      if (exactOnly.has(p)) continue;
      if (path.startsWith(p + '/')) return true;
    }
    return false;
  };

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (isPublic(req.path)) {
      next();
      return;
    }

    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or malformed Authorization header' });
      return;
    }

    const token = header.slice(7);
    try {
      const payload = jwt.verify(token, secret) as { userId?: string; sub?: string; [key: string]: any };
      const userId = payload.userId || payload.sub;
      if (!userId) {
        res.status(401).json({ error: 'Token payload missing userId' });
        return;
      }
      req.user = { ...payload, userId };
      next();
    } catch (err: any) {
      res.status(401).json({ error: 'Invalid or expired token', detail: err.message });
    }
  };
}

/** Sign a JWT for a user. Useful for bootstrapping and tests. */
export function signToken(
  payload: { userId: string; [key: string]: any },
  options: AuthMiddlewareOptions & { expiresIn?: string } = {}
): string {
  const secret = resolveSecret(options);
  return jwt.sign(payload, secret, { expiresIn: options.expiresIn || '24h' } as jwt.SignOptions);
}

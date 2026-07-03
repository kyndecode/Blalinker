import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// Identifiant de corrélation attaché à chaque requête (logs, erreurs, réponses).
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

/** Assigne un Request-Id (repris de l'en-tête entrant ou généré) et le renvoie au client. */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && incoming.trim()
    ? incoming.trim().slice(0, 100)
    : randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

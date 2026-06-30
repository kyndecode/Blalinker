import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyAccessToken, isTokenRevoked } from '../utils/jwt.util';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { makeStore } from './security.middleware';

/** Rate limiter strict pour les routes admin : 60 req/min max */
export const adminRateLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:admin:'),
  message: { error: 'Trop de requêtes admin. Réessayez dans une minute.' },
});

// Augmenter le type Request d'Express
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        status: string;
      };
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token d\'authentification manquant' });
  }

  const token = authHeader.split(' ')[1];

  // Vérifier si le token a été révoqué
  if (await isTokenRevoked(token)) {
    return res.status(401).json({ error: 'Session expirée. Veuillez vous reconnecter.' });
  }

  try {
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findFirst({
      where: { id: payload.userId, deletedAt: null },
      select: { id: true, role: true, status: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Utilisateur introuvable' });
    }

    if (user.status === 'banned') {
      return res.status(403).json({ error: 'Votre compte a été suspendu.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Votre compte est temporairement suspendu. Contactez le support.' });
    }

    req.user = user;
    next();
  } catch (err) {
    logger.warn('Token invalide:', { ip: req.ip, err });
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

/** Middleware pour restreindre l'accès aux administrateurs */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !['admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
}

/** Middleware pour les actions réservées au super administrateur (actions sensibles) */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Action réservée au super administrateur' });
  }
  next();
}

/** Middleware pour restreindre l'accès aux prestataires */
export function requireProvider(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'provider') {
    return res.status(403).json({ error: 'Accès réservé aux prestataires' });
  }
  next();
}

/** Middleware pour restreindre l'accès aux clients */
export function requireClient(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'client') {
    return res.status(403).json({ error: 'Accès réservé aux clients' });
  }
  next();
}

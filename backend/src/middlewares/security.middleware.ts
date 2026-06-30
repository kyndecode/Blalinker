import { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit, { type Store } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import mongoSanitize from 'express-mongo-sanitize';
import compression from 'compression';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { redis } from '../config/redis';

/**
 * Store Redis partagé pour le rate limiting → compteurs cohérents entre instances
 * et conservés au redémarrage. En test, on retombe sur le store mémoire par défaut.
 */
export function makeStore(prefix: string): Store | undefined {
  if (env.NODE_ENV === 'test') return undefined;
  const sendCommand = (...args: string[]) =>
    (redis as unknown as { call: (...a: string[]) => Promise<unknown> }).call(...args);
  return new RedisStore({ sendCommand: sendCommand as never, prefix }) as unknown as Store;
}

/** Applique tous les middlewares de sécurité sur l'app Express */
export function applySecurityMiddlewares(app: Express) {

  // Compression GZIP — réduit la bande passante (critique pour marchés africains)
  app.use(compression());

  // Headers de sécurité HTTP
  app.use(helmet({
    contentSecurityPolicy: env.NODE_ENV === 'production' ? {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'"],
        styleSrc:    ["'self'", "'unsafe-inline'"],
        imgSrc:      ["'self'", 'data:', 'https://res.cloudinary.com'],
        connectSrc:  ["'self'"],
        frameSrc:    ["'none'"],
        objectSrc:   ["'none'"],
        upgradeInsecureRequests: [],
      },
    } : false,
    hsts: env.NODE_ENV === 'production' ? {
      maxAge: 31_536_000,
      includeSubDomains: true,
      preload: true,
    } : false,
    crossOriginEmbedderPolicy: false,
  }));

  // Rate limiting global
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max:      env.NODE_ENV === 'test' ? 10_000 : 200,
      standardHeaders: true,
      legacyHeaders:   false,
      store: makeStore('rl:global:'),
      handler: (_req: Request, res: Response) => {
        res.status(429).json({
          error: 'Trop de requêtes. Veuillez réessayer dans quelques minutes.',
          code:  'RATE_LIMIT_EXCEEDED',
        });
      },
    })
  );

  // Rate limiting strict pour l'auth (brute-force protection)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max:      env.NODE_ENV === 'test' ? 10_000 : 15,
    skipSuccessfulRequests: true,
    store: makeStore('rl:auth:'),
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        error: 'Trop de tentatives. Réessayez dans 15 minutes.',
        code:  'AUTH_RATE_LIMIT',
      });
    },
  });
  app.use('/api/v1/auth', authLimiter);

  // Sanitisation — empêche les injections NoSQL
  app.use(mongoSanitize());
}

/** Middleware de validation que le Content-Type est JSON */
export function requireJson(req: Request, res: Response, next: NextFunction) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('application/json') && !ct.includes('multipart/form-data')) {
      return res.status(415).json({ error: 'Content-Type doit être application/json' });
    }
  }
  next();
}

/** Middleware de logging des requêtes */
export function requestLogger(req: Request, _res: Response, next: NextFunction) {
  if (env.NODE_ENV !== 'test') {
    logger.debug(`${req.method} ${req.path}`, {
      ip: req.ip,
      ua: req.headers['user-agent']?.substring(0, 80),
    });
  }
  next();
}

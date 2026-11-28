/**
 * BLA — Configuration Express
 * Middlewares globaux + routes + gestion d'erreurs
 */
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { timingSafeEqual } from 'crypto';
import * as Sentry from '@sentry/node';
import client from 'prom-client';
import { env, getCorsOrigins } from './config/env';
import { applySecurityMiddlewares, requestLogger } from './middlewares/security.middleware';
import { requestId } from './middlewares/requestId.middleware';
import { responseSanitizer } from './middlewares/responseSanitizer.middleware';
import { openApiSpec } from './config/openapi';
import { logger } from './config/logger';
import { prisma } from './config/database';
import { redis } from './config/redis';

// Routes
import authRoutes       from './modules/auth/auth.routes';
import categoriesRoutes from './modules/categories/categories.routes';
import providersRoutes  from './modules/providers/providers.routes';
import servicesRoutes   from './modules/services/services.routes';
import bookingsRoutes   from './modules/bookings/bookings.routes';
import adminRoutes      from './modules/admin/admin.routes';
import paymentsRoutes   from './modules/payments/payments.routes';
import contactRoutes    from './modules/contact/contact.routes';
import usersRoutes      from './modules/users/users.routes';
import reviewsRoutes    from './modules/reviews/reviews.routes';
import notificationsRoutes from './modules/notifications/notifications.routes';
import reportsRoutes    from './modules/reports/reports.routes';
import uploadsRoutes    from './modules/uploads/uploads.routes';
import payoutsRoutes    from './modules/payouts/payouts.routes';
import siteRoutes       from './modules/site/site.routes';
import searchRoutes     from './modules/search/search.routes';

export const app = express();

// ─── Monitoring (Sentry) ──────────────────────────────────────
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 0,
  });
  app.use(Sentry.Handlers.requestHandler());
  logger.info('Sentry activé');
}

// ─── Métriques Prometheus ─────────────────────────────────────
const metricsRegistry = new client.Registry();
metricsRegistry.setDefaultLabels({ app: 'bla-backend' });
client.collectDefaultMetrics({ register: metricsRegistry });

// ─── Middlewares de base ──────────────────────────────────────
// Nombre de relais de confiance devant l'API (Render). Si l'historique des connexions
// n'affiche que des IP internes (10.x), augmenter TRUST_PROXY_HOPS d'une unité.
app.set('trust proxy', env.TRUST_PROXY_HOPS);
const corsOrigins = getCorsOrigins();

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-request', 'X-Admin-Request', 'X-Auth-Mode'],
}));

// Corps limités à 1 Mo : aucune route n'en attend davantage (les fichiers passent par multer).
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// ─── Observabilité ────────────────────────────────────────────
app.use(requestId);

// ─── Confidentialité : aucun secret dans une réponse JSON ─────
app.use(responseSanitizer);

// ─── Sécurité ─────────────────────────────────────────────────
applySecurityMiddlewares(app);
app.use(requestLogger);

// ─── Racine + Health check ────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    name:    'BLA API',
    version: process.env.npm_package_version ?? '1.0.0',
    status:  'ok',
    docs:    '/api/v1',
    health:  '/health',
  });
});

app.get('/health', async (_req, res) => {
  const [db, cache] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redis.ping(),
  ]);

  const dbOk    = db.status === 'fulfilled';
  const cacheOk = cache.status === 'fulfilled';
  const healthy = dbOk && cacheOk;

  res.status(healthy ? 200 : 503).json({
    status:    healthy ? 'ok' : 'degraded',
    version:   process.env.npm_package_version ?? '1.0.0',
    env:       env.NODE_ENV,
    checks:    { database: dbOk ? 'up' : 'down', redis: cacheOk ? 'up' : 'down' },
    timestamp: new Date().toISOString(),
  });
});

// Endpoint métriques Prometheus. En production : fermé (404) sauf jeton METRICS_TOKEN
// (Authorization: Bearer …) — les métriques du processus n'ont pas à être publiques.
function metricsAllowed(req: express.Request): boolean {
  if (env.NODE_ENV !== 'production') return true;
  if (!env.METRICS_TOKEN) return false;
  const given = Buffer.from(String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(env.METRICS_TOKEN);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

app.get('/metrics', async (req, res) => {
  if (!metricsAllowed(req)) return res.status(404).json({ error: 'Route introuvable', code: 'NOT_FOUND' });
  res.set('Content-Type', metricsRegistry.contentType);
  return res.end(await metricsRegistry.metrics());
});

// Contrat OpenAPI (importable dans Swagger UI / Postman)
app.get('/openapi.json', (_req, res) => {
  res.json(openApiSpec);
});

// ─── Routes API ───────────────────────────────────────────────
const API = '/api/v1';

app.use(`${API}/auth`,       authRoutes);
app.use(`${API}/categories`, categoriesRoutes);
app.use(`${API}/providers`,  providersRoutes);
app.use(`${API}/services`,   servicesRoutes);
app.use(`${API}/bookings`,  bookingsRoutes);
app.use(`${API}/admin`,     adminRoutes);
app.use(`${API}/payments`,  paymentsRoutes);
app.use(`${API}/contact`,   contactRoutes);
app.use(`${API}/users`,     usersRoutes);
app.use(`${API}/reviews`,       reviewsRoutes);
app.use(`${API}/notifications`, notificationsRoutes);
app.use(`${API}/reports`,       reportsRoutes);
app.use(`${API}/uploads`,       uploadsRoutes);
app.use(`${API}/payouts`,       payoutsRoutes);
app.use(`${API}/site`,          siteRoutes);
app.use(`${API}/search`,        searchRoutes);

// ─── 404 ──────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route introuvable', code: 'NOT_FOUND' });
});

// ─── Gestion globale des erreurs ──────────────────────────────
if (env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

/** Erreurs dues à la requête elle-même : réponse 4xx explicite (pas une « erreur interne »). */
export function clientErrorResponse(err: unknown): { status: number; error: string; code: string } | null {
  if (err instanceof multer.MulterError) {
    return err.code === 'LIMIT_FILE_SIZE'
      ? { status: 413, error: 'Fichier trop volumineux : la taille maximale autorisée est de 6 Mo.', code: 'FILE_TOO_LARGE' }
      : { status: 400, error: 'Envoi de fichier invalide.', code: 'INVALID_UPLOAD' };
  }
  const type = (err as { type?: string } | null)?.type;
  if (type === 'entity.parse.failed') return { status: 400, error: 'Corps de requête JSON invalide.', code: 'INVALID_JSON' };
  if (type === 'entity.too.large') return { status: 413, error: 'Requête trop volumineuse.', code: 'PAYLOAD_TOO_LARGE' };
  return null;
}

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const clientError = clientErrorResponse(err);
  if (clientError) {
    logger.warn('Requête refusée', { requestId: req.id, code: clientError.code });
    return res.status(clientError.status).json({ error: clientError.error, code: clientError.code, requestId: req.id });
  }
  logger.error('Erreur non gérée:', { requestId: req.id, message: err.message, stack: err.stack });
  res.status(500).json({
    error: env.NODE_ENV === 'production'
      ? 'Erreur interne. Notre équipe a été notifiée.'
      : err.message,
    code: 'INTERNAL_ERROR',
    requestId: req.id,
  });
});

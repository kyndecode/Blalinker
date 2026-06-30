/**
 * BLA — Configuration Express
 * Middlewares globaux + routes + gestion d'erreurs
 */
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import * as Sentry from '@sentry/node';
import client from 'prom-client';
import { env, getCorsOrigins } from './config/env';
import { applySecurityMiddlewares, requestLogger } from './middlewares/security.middleware';
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
app.set('trust proxy', 1); // Nécessaire derrière Nginx
const corsOrigins = getCorsOrigins();

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-request', 'X-Admin-Request', 'X-Auth-Mode'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

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

// Endpoint métriques Prometheus
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', metricsRegistry.contentType);
  res.end(await metricsRegistry.metrics());
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

// ─── 404 ──────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route introuvable', code: 'NOT_FOUND' });
});

// ─── Gestion globale des erreurs ──────────────────────────────
if (env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Erreur non gérée:', { message: err.message, stack: err.stack });
  res.status(500).json({
    error: env.NODE_ENV === 'production'
      ? 'Erreur interne. Notre équipe a été notifiée.'
      : err.message,
    code: 'INTERNAL_ERROR',
  });
});

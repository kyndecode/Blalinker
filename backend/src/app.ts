/**
 * BLA — Configuration Express
 * Middlewares globaux + routes + gestion d'erreurs
 */
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env, getCorsOrigins } from './config/env';
import { applySecurityMiddlewares, requestLogger } from './middlewares/security.middleware';
import { logger } from './config/logger';

// Routes
import authRoutes       from './modules/auth/auth.routes';
import categoriesRoutes from './modules/categories/categories.routes';
import providersRoutes  from './modules/providers/providers.routes';
import bookingsRoutes   from './modules/bookings/bookings.routes';
import adminRoutes      from './modules/admin/admin.routes';
import paymentsRoutes   from './modules/payments/payments.routes';

export const app = express();

// ─── Middlewares de base ──────────────────────────────────────
app.set('trust proxy', 1); // Nécessaire derrière Nginx
const corsOrigins = getCorsOrigins();

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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

app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    version:   process.env.npm_package_version ?? '1.0.0',
    env:       env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ─── Routes API ───────────────────────────────────────────────
const API = '/api/v1';

app.use(`${API}/auth`,       authRoutes);
app.use(`${API}/categories`, categoriesRoutes);
app.use(`${API}/providers`,  providersRoutes);
app.use(`${API}/bookings`,  bookingsRoutes);
app.use(`${API}/admin`,     adminRoutes);
app.use(`${API}/payments`,  paymentsRoutes);

// ─── 404 ──────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route introuvable', code: 'NOT_FOUND' });
});

// ─── Gestion globale des erreurs ──────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Erreur non gérée:', { message: err.message, stack: err.stack });
  res.status(500).json({
    error: env.NODE_ENV === 'production'
      ? 'Erreur interne. Notre équipe a été notifiée.'
      : err.message,
    code: 'INTERNAL_ERROR',
  });
});

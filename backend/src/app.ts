/**
 * BLA — Configuration Express
 * Middlewares globaux + routes + gestion d'erreurs
 */
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { applySecurityMiddlewares, requestLogger } from './middlewares/security.middleware';
import { logger } from './config/logger';

// Routes
import authRoutes     from './modules/auth/auth.routes';
import providersRoutes from './modules/providers/providers.routes';
import bookingsRoutes from './modules/bookings/bookings.routes';
import adminRoutes    from './modules/admin/admin.routes';

export const app = express();

// ─── Middlewares de base ──────────────────────────────────────
app.set('trust proxy', 1); // Nécessaire derrière Nginx

app.use(cors({
  origin: env.CORS_ORIGIN.split(','),
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

// ─── Health check (monitoring) ────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: process.env.npm_package_version ?? '1.0.0',
    env: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ─── Routes API ───────────────────────────────────────────────
const API = '/api/v1';

app.use(`${API}/auth`,      authRoutes);
app.use(`${API}/providers`, providersRoutes);
app.use(`${API}/bookings`,  bookingsRoutes);
app.use(`${API}/admin`,     adminRoutes);

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

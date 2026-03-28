/**
 * Validation des variables d'environnement au démarrage.
 * L'application refuse de démarrer si une variable critique est manquante.
 */
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Application
  NODE_ENV:     z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT:         z.coerce.number().default(3000),
  APP_URL:      z.string().url().default('http://localhost:3000'),
  CORS_ORIGIN:  z.string().default('http://localhost:5173'),

  // Base de données
  DATABASE_URL: z.string().min(1, 'DATABASE_URL est requise'),
  REDIS_URL:    z.string().default('redis://localhost:6379'),

  // JWT (RS256 — clés asymétriques)
  JWT_PRIVATE_KEY:    z.string().min(1, 'JWT_PRIVATE_KEY est requise'),
  JWT_PUBLIC_KEY:     z.string().min(1, 'JWT_PUBLIC_KEY est requise'),
  JWT_ACCESS_EXPIRY:  z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('30d'),

  // Chiffrement données sensibles
  ENCRYPTION_KEY: z.string().length(64, 'ENCRYPTION_KEY doit faire 64 caractères hex (32 bytes)'),

  // SMS OTP (Twilio)
  TWILIO_ACCOUNT_SID:  z.string().optional(),
  TWILIO_AUTH_TOKEN:   z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),

  // Email transactionnel (Brevo / ex-Sendinblue)
  BREVO_API_KEY:    z.string().optional(),
  BREVO_FROM_EMAIL: z.string().email().default('noreply@bla-app.com'),
  BREVO_FROM_NAME:  z.string().default('BLA Services'),

  // Stockage fichiers (Cloudinary)
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY:    z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Paiements — CinetPay (agrégateur Africa : Wave, Orange Money, MTN, Moov...)
  CINETPAY_API_KEY:        z.string().optional(),
  CINETPAY_SITE_ID:        z.string().optional(),
  CINETPAY_NOTIFY_URL:     z.string().url().optional(),
  CINETPAY_RETURN_URL:     z.string().url().optional(),

  // Paiements — Stripe (cartes bancaires internationales)
  STRIPE_SECRET_KEY:       z.string().optional(),
  STRIPE_WEBHOOK_SECRET:   z.string().optional(),
  STRIPE_PUBLIC_KEY:       z.string().optional(),

  // Paiements — Wave (direct, optionnel si CinetPay insuffisant)
  WAVE_API_KEY:               z.string().optional(),
  WAVE_WEBHOOK_SECRET:        z.string().optional(),

  // IA
  AI_SERVICE_URL:      z.string().url().default('http://localhost:8000'),
  ANTHROPIC_API_KEY:   z.string().optional(),

  // Monitoring
  SENTRY_DSN: z.string().optional(),

  // Admin seed
  ADMIN_EMAIL:    z.string().email().default('admin@bla-app.com'),
  ADMIN_PASSWORD: z.string().min(8).default('BlaAdmin2024!'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables d\'environnement invalides:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

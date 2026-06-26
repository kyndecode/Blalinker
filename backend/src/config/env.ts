/**
 * Validation des variables d'environnement au démarrage.
 * L'application refuse de démarrer si une variable critique est manquante.
 */
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.APP_URL && process.env.APP_UR) {
  process.env.APP_URL = process.env.APP_UR;
}

function normalizeUrl(rawValue: unknown, fallback: string): string {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') return fallback;
  const trimmed = rawValue.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const NULLISH_ENV_VALUES = new Set([
  'not_configured',
  'not-configured',
  'undefined',
  'null',
  'none',
]);

function normalizeOptionalEnvValue(rawValue: unknown): string | undefined {
  if (typeof rawValue !== 'string') return undefined;
  const trimmed = rawValue.trim();
  if (!trimmed) return undefined;
  if (NULLISH_ENV_VALUES.has(trimmed.toLowerCase())) return undefined;
  return trimmed;
}

const optionalStringEnv = () =>
  z.preprocess((value) => normalizeOptionalEnvValue(value), z.string().optional());

const optionalUrlEnv = () =>
  z.preprocess((value) => normalizeOptionalEnvValue(value), z.string().url().optional());

const envSchema = z.object({
  // Application
  NODE_ENV:     z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT:         z.coerce.number().default(3000),
  APP_URL:      z.preprocess((v) => normalizeUrl(v, 'http://localhost:3000'), z.string().url()),
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
  TWILIO_ACCOUNT_SID:  optionalStringEnv(),
  TWILIO_AUTH_TOKEN:   optionalStringEnv(),
  TWILIO_PHONE_NUMBER: optionalStringEnv(),

  // Email transactionnel (Brevo / ex-Sendinblue)
  BREVO_API_KEY:    optionalStringEnv(),
  BREVO_FROM_EMAIL: z.string().email().default('noreply@blalinker.com'),
  BREVO_FROM_NAME:  z.string().default('BLA Services'),

  // Stockage fichiers (Cloudinary)
  CLOUDINARY_CLOUD_NAME: optionalStringEnv(),
  CLOUDINARY_API_KEY:    optionalStringEnv(),
  CLOUDINARY_API_SECRET: optionalStringEnv(),

  // Paiements — CinetPay (agrégateur Africa : Wave, Orange Money, MTN, Moov...)
  CINETPAY_API_KEY:        optionalStringEnv(),
  CINETPAY_SITE_ID:        optionalStringEnv(),
  CINETPAY_SECRET_KEY:     optionalStringEnv(), // Clé secrète pour vérifier le HMAC x-token des webhooks
  CINETPAY_NOTIFY_URL:     optionalUrlEnv(),
  CINETPAY_RETURN_URL:     optionalUrlEnv(),

  // Paiements — Stripe (cartes bancaires internationales)
  STRIPE_SECRET_KEY:       optionalStringEnv(),
  STRIPE_WEBHOOK_SECRET:   optionalStringEnv(),
  STRIPE_PUBLIC_KEY:       optionalStringEnv(),

  // Paiements — Wave (direct, optionnel si CinetPay insuffisant)
  WAVE_API_KEY:               optionalStringEnv(),
  WAVE_WEBHOOK_SECRET:        optionalStringEnv(),

  // Auth sociale
  GOOGLE_CLIENT_ID: optionalStringEnv(),

  // IA
  AI_SERVICE_URL:      z.string().url().default('http://localhost:8000'),
  ANTHROPIC_API_KEY:   optionalStringEnv(),

  // Monitoring
  SENTRY_DSN: optionalStringEnv(),

  // Admin seed — AUCUN mot de passe par défaut (un défaut connu = compte super_admin compromis).
  // Si ADMIN_PASSWORD est absent, le bootstrap admin est simplement ignoré au démarrage.
  ADMIN_EMAIL:    z.string().email().default('admin@blalinker.com'),
  ADMIN_PASSWORD: z.preprocess(
    (value) => normalizeOptionalEnvValue(value),
    z.string().min(8, 'ADMIN_PASSWORD doit faire au moins 8 caractères').optional()
  ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables d\'environnement invalides:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://blalinker.com',
  'https://www.blalinker.com',
  'https://admin.blalinker.com',
];

function normalizeCorsOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export function getCorsOrigins(rawOrigins: string = env.CORS_ORIGIN): string[] {
  const explicitOrigins = rawOrigins
    .split(',')
    .map(normalizeCorsOrigin)
    .filter(Boolean);

  return Array.from(new Set([...DEFAULT_CORS_ORIGINS, ...explicitOrigins]));
}

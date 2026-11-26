import type { Request, Response } from 'express';
import { env } from '../config/env';

export const REFRESH_COOKIE_NAME = 'bla_refresh';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Les clients web demandent le mode cookie via l'en-tête `X-Auth-Mode: cookie`.
 * Dans ce mode, le refresh token est stocké dans un cookie HttpOnly (inaccessible
 * au JavaScript → protégé contre le vol par XSS) et retiré du corps de la réponse.
 * Les autres clients (mobile, intégrations) continuent de recevoir le token dans le body.
 */
export function isCookieAuthMode(req: Request): boolean {
  return String(req.headers['x-auth-mode'] ?? '').toLowerCase() === 'cookie';
}

function cookieOptions() {
  const isProd = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    // Cross-site (front et back sur des domaines différents) → 'none' + Secure en prod.
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    path: '/api/v1/auth',
    maxAge: THIRTY_DAYS_MS,
  };
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, cookieOptions());
}

export function clearRefreshCookie(res: Response): void {
  const { maxAge: _maxAge, ...opts } = cookieOptions();
  res.clearCookie(REFRESH_COOKIE_NAME, opts);
}

/**
 * Lit le refresh token : cookie (web) ou corps de la requête (mobile, administration).
 * Le cookie n'est lu QU'AVEC l'en-tête `X-Auth-Mode: cookie` : un en-tête personnalisé impose
 * une vérification CORS préalable, qu'un site tiers ne peut pas passer. Sans cela, un simple
 * formulaire d'un autre site (cookie SameSite=None) pouvait forcer une rotation du jeton et
 * déconnecter le visiteur.
 */
export function getRefreshToken(req: Request): string | undefined {
  const fromCookie = isCookieAuthMode(req)
    ? (req as Request & { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE_NAME]
    : undefined;
  const fromBody = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
  return fromCookie || fromBody || undefined;
}

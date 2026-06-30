import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../config/logger';

const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Vérifie un token Cloudflare Turnstile.
 * Si TURNSTILE_SECRET n'est pas configuré, la vérification est désactivée (retourne true)
 * → permet d'activer l'anti-bot uniquement quand les clés sont prêtes.
 */
export async function verifyCaptcha(token: string | undefined, ip?: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true; // désactivé
  if (!token) return false;
  try {
    const params = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
    if (ip) params.append('remoteip', ip);
    const res = await axios.post(TURNSTILE_VERIFY, params, { timeout: 8_000 });
    return Boolean((res.data as { success?: boolean })?.success);
  } catch (err) {
    logger.error('Échec vérification captcha', err);
    return false;
  }
}

/**
 * Middleware anti-bot. À placer AVANT la validation Zod (qui retire les champs inconnus).
 * Le client doit envoyer le champ `captchaToken` dans le corps de la requête.
 */
export function captchaGuard(field = 'captchaToken') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = (req.body as Record<string, unknown> | undefined)?.[field];
    const ok = await verifyCaptcha(typeof token === 'string' ? token : undefined, req.ip);
    if (!ok) {
      return res.status(400).json({ error: 'Vérification anti-robot échouée.', code: 'CAPTCHA_FAILED' });
    }
    next();
  };
}

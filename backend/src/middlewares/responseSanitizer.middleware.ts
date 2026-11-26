/**
 * Filet de sécurité des réponses JSON : retire tout champ secret qui aurait
 * échappé aux listes blanches (utils/serializers). Ne remplace pas une sélection
 * explicite des champs : chaque retrait est journalisé comme anomalie à corriger.
 */
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger';

/** Champs qui ne doivent JAMAIS sortir de l'API, quel que soit le destinataire. */
export const SECRET_RESPONSE_KEYS: ReadonlySet<string> = new Set([
  'passwordHash', 'password_hash',
  'mfaSecret', 'mfa_secret',
  'mfaTotpLastStep', 'mfa_totp_last_step',
  'refreshHash', 'refresh_hash',
  'codeHash', 'code_hash',
]);

const MAX_DEPTH = 32;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Copie `value` sans les clés secrètes. Les objets non « simples » (Date, Decimal…)
 * sont conservés tels quels : leur sérialisation JSON ne contient pas de clé.
 */
export function stripSecrets(value: unknown, removed: string[] = [], path = '$', depth = 0): unknown {
  if (depth > MAX_DEPTH) return value;
  if (Array.isArray(value)) {
    return value.map((item, i) => stripSecrets(item, removed, `${path}[${i}]`, depth + 1));
  }
  if (!isPlainObject(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_RESPONSE_KEYS.has(key)) {
      removed.push(`${path}.${key}`);
      continue;
    }
    out[key] = stripSecrets(child, removed, `${path}.${key}`, depth + 1);
  }
  return out;
}

export function responseSanitizer(req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);
  res.json = ((body?: unknown) => {
    const removed: string[] = [];
    const safe = stripSecrets(body, removed);
    if (removed.length > 0) {
      // Seuls les chemins sont journalisés, jamais les valeurs.
      logger.warn('Réponse API : champs secrets retirés (sélection de champs à corriger)', {
        method: req.method,
        route: req.baseUrl + (req.route?.path ?? req.path),
        fields: Array.from(new Set(removed.map((p) => p.replace(/\[\d+\]/g, '[]')))).slice(0, 20),
      });
    }
    return originalJson(safe);
  }) as Response['json'];
  next();
}

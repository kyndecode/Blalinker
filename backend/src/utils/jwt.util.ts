import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { redis } from '../config/redis';
import crypto from 'crypto';

export interface JwtPayload {
  userId: string;
  role: string;
  sessionId: string;
  type?: 'access';
}

export interface RefreshPayload {
  userId: string;
  sessionId: string;
  tokenFamily: string;
  type?: 'refresh';
}

/** Génère un access token (15 min) */
export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign({ ...payload, type: 'access' }, env.JWT_PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn: env.JWT_ACCESS_EXPIRY as jwt.SignOptions['expiresIn'],
  });
}

/** Génère un refresh token (30j) */
export function signRefreshToken(payload: RefreshPayload): string {
  return jwt.sign({ ...payload, type: 'refresh' }, env.JWT_PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn: env.JWT_REFRESH_EXPIRY as jwt.SignOptions['expiresIn'],
  });
}

/** Vérifie un access token (rejette un refresh token présenté comme access) */
export function verifyAccessToken(token: string): JwtPayload {
  const payload = jwt.verify(token, env.JWT_PUBLIC_KEY, {
    algorithms: ['RS256'],
  }) as JwtPayload;
  if (payload.type !== 'access') {
    throw new jwt.JsonWebTokenError('Type de token invalide');
  }
  return payload;
}

/** Vérifie un refresh token (tolère l'absence de type pour les tokens hérités) */
export function verifyRefreshToken(token: string): RefreshPayload {
  const payload = jwt.verify(token, env.JWT_PUBLIC_KEY, {
    algorithms: ['RS256'],
  }) as RefreshPayload;
  if (payload.type && payload.type !== 'refresh') {
    throw new jwt.JsonWebTokenError('Type de token invalide');
  }
  return payload;
}

/** Révoque un access token jusqu'à son expiration naturelle */
export async function revokeToken(token: string): Promise<void> {
  try {
    const decoded = jwt.decode(token) as { exp?: number };
    if (!decoded?.exp) return;
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await redis.setex(`revoked:${token}`, ttl, '1');
    }
  } catch {
    // Ignorer si le token est invalide
  }
}

/** Vérifie si un token est révoqué */
export async function isTokenRevoked(token: string): Promise<boolean> {
  const result = await redis.get(`revoked:${token}`);
  return result !== null;
}

/** Génère un ID de famille pour la rotation des refresh tokens */
export function generateTokenFamily(): string {
  return crypto.randomBytes(16).toString('hex');
}

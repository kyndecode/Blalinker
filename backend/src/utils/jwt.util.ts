import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { redis } from '../config/redis';
import crypto from 'crypto';

export interface JwtPayload {
  userId: string;
  role: string;
  sessionId: string;
}

export interface RefreshPayload {
  userId: string;
  sessionId: string;
  tokenFamily: string;
}

/** Génère un access token (15 min) */
export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn: env.JWT_ACCESS_EXPIRY as jwt.SignOptions['expiresIn'],
  });
}

/** Génère un refresh token (30j) */
export function signRefreshToken(payload: RefreshPayload): string {
  return jwt.sign(payload, env.JWT_PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn: env.JWT_REFRESH_EXPIRY as jwt.SignOptions['expiresIn'],
  });
}

/** Vérifie un access token */
export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_PUBLIC_KEY, {
    algorithms: ['RS256'],
  }) as JwtPayload;
}

/** Vérifie un refresh token */
export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, env.JWT_PUBLIC_KEY, {
    algorithms: ['RS256'],
  }) as RefreshPayload;
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

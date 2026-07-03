// Vérifie la protection anti-confusion de type (un refresh token ne doit pas
// pouvoir servir d'access token, et inversement) — correctif de sécurité B2.

jest.mock('../../src/config/redis', () => ({
  redis: { get: jest.fn().mockResolvedValue(null), setex: jest.fn() },
}));

jest.mock('../../src/config/env', () => {
  const crypto = require('crypto');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    env: {
      NODE_ENV: 'test',
      JWT_PRIVATE_KEY: privateKey,
      JWT_PUBLIC_KEY: publicKey,
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '30d',
      REDIS_URL: 'redis://localhost:6379',
    },
  };
});

import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../src/utils/jwt.util';

describe('jwt.util — claims de type (anti-confusion)', () => {
  it('access token: aller-retour valide + type=access', () => {
    const token = signAccessToken({ userId: 'u1', role: 'client', sessionId: 's1' });
    const payload = verifyAccessToken(token);
    expect(payload.userId).toBe('u1');
    expect(payload.role).toBe('client');
    expect(payload.type).toBe('access');
  });

  it('rejette un refresh token présenté comme access token', () => {
    const refresh = signRefreshToken({ userId: 'u1', sessionId: 's1', tokenFamily: 'f1' });
    expect(() => verifyAccessToken(refresh)).toThrow();
  });

  it('refresh token: aller-retour valide + rejette un access token comme refresh', () => {
    const refresh = signRefreshToken({ userId: 'u1', sessionId: 's1', tokenFamily: 'f1' });
    expect(verifyRefreshToken(refresh).userId).toBe('u1');

    const access = signAccessToken({ userId: 'u1', role: 'client', sessionId: 's1' });
    expect(() => verifyRefreshToken(access)).toThrow();
  });
});

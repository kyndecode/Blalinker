/**
 * Câblage HTTP réel des routes MFA (persistance simulée, aucun envoi réel).
 */
jest.mock('prom-client', () => {
  class Registry {
    contentType = 'text/plain';
    setDefaultLabels() { /* noop */ }
    metrics() { return Promise.resolve(''); }
  }
  return { Registry, collectDefaultMetrics: jest.fn() };
});

jest.mock('../../src/config/database', () => ({
  prisma: { $queryRaw: jest.fn().mockResolvedValue([{ ok: 1 }]) },
}));

jest.mock('../../src/config/redis', () => ({
  redis: {
    ping: jest.fn().mockResolvedValue('PONG'),
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn(),
    on: jest.fn(),
    status: 'ready',
  },
}));

import request from 'supertest';
import { app } from '../../src/app';

describe('Routes MFA — authentification exigée', () => {
  it.each([
    ['get', '/api/v1/auth/mfa/status'],
    ['post', '/api/v1/auth/mfa/totp/setup'],
    ['post', '/api/v1/auth/mfa/totp/activate'],
    ['post', '/api/v1/auth/mfa/recovery-codes'],
    ['post', '/api/v1/admin/team/00000000-0000-0000-0000-000000000000/reset-mfa'],
  ])('%s %s sans jeton → 401', async (method, path) => {
    const res = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[method](path)
      .set('Content-Type', 'application/json')
      .send({});
    expect(res.status).toBe(401);
  });
});

describe('Routes MFA — validation des entrées', () => {
  it('secours e-mail sans tempToken → 422', async () => {
    const res = await request(app).post('/api/v1/auth/login/mfa/email').send({});
    expect(res.status).toBe(422);
  });

  it('code client à 5 chiffres → 422 (règle inchangée)', async () => {
    const res = await request(app).post('/api/v1/auth/login/verify-mfa').send({ tempToken: 't', otpCode: '12345' });
    expect(res.status).toBe(422);
  });

  it('code de récupération mal formé → 422', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login/verify-mfa')
      .send({ tempToken: 't', method: 'recovery', otpCode: 'abc' });
    expect(res.status).toBe(422);
  });

  it('méthode inconnue → 422', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login/verify-mfa')
      .send({ tempToken: 't', method: 'sms', otpCode: '123456' });
    expect(res.status).toBe(422);
  });

  it('format valide mais session de connexion inconnue → 401 (route câblée sur le service)', async () => {
    const res = await request(app).post('/api/v1/auth/login/verify-mfa').send({ tempToken: 'inconnu', otpCode: '123456' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Session MFA expirée');
  });

  it('secours e-mail avec session inconnue → 401', async () => {
    const res = await request(app).post('/api/v1/auth/login/mfa/email').send({ tempToken: 'inconnu' });
    expect(res.status).toBe(401);
  });
});

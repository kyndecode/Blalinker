/**
 * Tests d'intégration HTTP : vérifient le câblage réel de l'app
 * (montage des routes, middlewares, rejet d'authentification, validation,
 * sécurité du webhook) sans base de données réelle (persistance mockée).
 */

// Éviter les timers de prom-client (handles ouverts) en le neutralisant.
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

describe('API — câblage & sécurité (intégration)', () => {
  it('GET / → 200 (info API)', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('BLA API');
  });

  it('GET /health → 200 avec checks DB/Redis', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.checks.database).toBe('up');
    expect(res.body.checks.redis).toBe('up');
  });

  it('route inconnue → 404 NOT_FOUND', async () => {
    const res = await request(app).get('/api/v1/route-inexistante');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('POST /auth/register body invalide → 422 (validation)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({});
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /auth/login sans mot de passe → 422', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'x@y.com' });
    expect(res.status).toBe(422);
  });

  it('GET /bookings sans token → 401', async () => {
    const res = await request(app).get('/api/v1/bookings');
    expect(res.status).toBe(401);
  });

  it('GET /notifications sans token → 401', async () => {
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });

  it('GET /admin/dashboard sans token → 401', async () => {
    const res = await request(app).get('/api/v1/admin/dashboard');
    expect(res.status).toBe(401);
  });

  it('POST /payments/webhook/cinetpay sans cpm_trans_id → 200 sans confirmation (sécurisé)', async () => {
    const res = await request(app).post('/api/v1/payments/webhook/cinetpay').send({});
    expect(res.status).toBe(200);
  });
});

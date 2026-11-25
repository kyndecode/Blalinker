/**
 * Formulaire de contact public — anti-abus (audit du 25/11/2026).
 * Avant : aucun plafond dédié et un accusé de réception envoyé à N'IMPORTE QUELLE adresse
 * saisie → envoi d'e-mails en série à des tiers depuis contact@blalinker.com.
 */
jest.mock('../../src/config/env', () => ({
  env: { NODE_ENV: 'development', ADMIN_EMAIL: 'contact@blalinker.com', TURNSTILE_SECRET: undefined },
}));
jest.mock('../../src/middlewares/security.middleware', () => ({ makeStore: () => undefined })); // compteurs en mémoire
jest.mock('../../src/config/redis', () => ({ redis: { set: jest.fn() } }));
jest.mock('../../src/config/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../../src/config/email', () => ({ sendEmail: jest.fn().mockResolvedValue(true) }));
jest.mock('../../src/config/database', () => ({
  prisma: {
    contactRequest: { create: jest.fn().mockResolvedValue({ id: 'req-1' }) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    notification: { createMany: jest.fn() },
  },
}));
jest.mock('../../src/middlewares/auth.middleware', () => ({ authenticate: (_q: unknown, _s: unknown, n: () => void) => n() }));
jest.mock('../../src/utils/phone.validation', () => ({ isValidE164ForCountry: () => true }));

import express from 'express';
import request from 'supertest';
import { redis } from '../../src/config/redis';
import { sendEmail } from '../../src/config/email';
import { shouldAcknowledge } from '../../src/modules/contact/contact.controller';
import contactRoutes from '../../src/modules/contact/contact.routes';

const set = redis.set as unknown as jest.Mock;
const body = {
  firstName: 'Awa', lastName: 'Kone', email: 'cible@example.test', phone: '+2250700000000',
  countryCode: 'CI', subject: 'other', message: 'Bonjour, une question sur un service.',
};

function app() {
  const a = express();
  a.use(express.json());
  a.use('/contact', contactRoutes);
  return a;
}

beforeEach(() => { jest.clearAllMocks(); });

describe('accusé de réception', () => {
  it('un seul par adresse et par heure (clé hachée, sans l’adresse en clair)', async () => {
    set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    expect(await shouldAcknowledge('Cible@Example.test')).toBe(true);
    expect(await shouldAcknowledge('cible@example.test')).toBe(false);
    const [key, , ex, ttl, nx] = set.mock.calls[0];
    expect(key).toMatch(/^contact_ack:[0-9a-f]{64}$/);
    expect(key).not.toContain('example');
    expect([ex, ttl, nx]).toEqual(['EX', 3600, 'NX']);
    expect(set.mock.calls[1][0]).toBe(key); // casse ignorée
  });

  it('Redis indisponible : accusé envoyé (comportement inchangé)', async () => {
    set.mockRejectedValueOnce(new Error('down'));
    expect(await shouldAcknowledge('x@example.test')).toBe(true);
  });

  it('deuxième message vers la même adresse : demande enregistrée, équipe notifiée, pas de second accusé', async () => {
    set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    const a = app();
    expect((await request(a).post('/contact').send(body)).status).toBe(201);
    expect((await request(a).post('/contact').send(body)).status).toBe(201);
    const toTarget = (sendEmail as jest.Mock).mock.calls.filter(([p]) => p.to === 'cible@example.test');
    const toTeam = (sendEmail as jest.Mock).mock.calls.filter(([p]) => p.to === 'contact@blalinker.com');
    expect(toTarget).toHaveLength(1);
    expect(toTeam).toHaveLength(2);
  });
});

describe('plafond du formulaire public', () => {
  it('5 envois par heure et par IP, puis 429 explicite', async () => {
    set.mockResolvedValue('OK');
    // Module rechargé : compteur neuf, indépendant des envois des tests précédents.
    let freshRoutes: express.Router | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      freshRoutes = require('../../src/modules/contact/contact.routes').default;
    });
    const a = express();
    a.use(express.json());
    a.use('/contact', freshRoutes!);
    for (let i = 0; i < 5; i++) {
      expect((await request(a).post('/contact').send({ ...body, email: `p${i}@example.test` })).status).toBe(201);
    }
    const blocked = await request(a).post('/contact').send(body);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('CONTACT_RATE_LIMIT');
  });
});

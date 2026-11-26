/**
 * Lot 3 — industrialisation de l'administration sur un VRAI PostgreSQL :
 * exports CSV (permissions, contenu, journalisation), historique des connexions,
 * tendances réelles, modération groupée, filtres et tris côté serveur.
 *
 * Ignoré sans TEST_DATABASE_URL ; refuse toute base distante (base locale jetable uniquement).
 */
jest.mock('prom-client', () => {
  class Registry {
    contentType = 'text/plain';
    setDefaultLabels() { /* noop */ }
    metrics() { return Promise.resolve(''); }
  }
  return { Registry, collectDefaultMetrics: jest.fn() };
});

jest.mock('../../src/config/redis', () => ({
  redis: {
    ping: jest.fn().mockResolvedValue('PONG'),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    on: jest.fn(),
    status: 'ready',
  },
}));

jest.mock('../../src/utils/jwt.util', () => ({
  ...jest.requireActual('../../src/utils/jwt.util'),
  verifyAccessToken: (token: string) => {
    const [, userId] = token.split(':');
    return { userId, role: 'unknown' };
  },
  isTokenRevoked: jest.fn().mockResolvedValue(false),
}));

import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { countNotifications } from './notifications.helper';

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

if (url && /supabase\.co|supabase\.com|pooler\.supabase|onrender\.com/i.test(url)) {
  throw new Error('TEST_DATABASE_URL pointe vers un hébergeur distant : refusé (base locale jetable uniquement).');
}

const RUN = `i${Date.now().toString(36)}`;
const HASH = `$2b$12$INSIGHTHASH${RUN}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`;

describeDb('PostgreSQL réel — administration industrialisée (lot 3)', () => {
  let app: Express;
  let prisma: PrismaClient;
  const ids = { superAdmin: '', exporter: '', support: '', moderator: '', client: '', provider: '', category: '', service: '' };
  const auth = (userId: string) => ({ Authorization: `Bearer uid:${userId}` });
  const api = (path: string) => `/api/v1${path}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    jest.resetModules();
    ({ app } = await import('../../src/app'));
    ({ prisma } = await import('../../src/config/database'));
    const mk = (data: Parameters<PrismaClient['user']['create']>[0]['data']) => prisma.user.create({ data, select: { id: true } }).then((u) => u.id);
    ids.superAdmin = await mk({ email: `sa-${RUN}@example.test`, passwordHash: HASH, role: 'super_admin', status: 'active' });
    ids.exporter = await mk({ email: `exp-${RUN}@example.test`, passwordHash: HASH, role: 'admin', status: 'active', permissions: ['exports.run', 'bookings.read'] });
    ids.support = await mk({ email: `sup-${RUN}@example.test`, passwordHash: HASH, role: 'admin', status: 'active', permissions: ['users.read'] });
    ids.moderator = await mk({ email: `mod-${RUN}@example.test`, passwordHash: HASH, role: 'admin', status: 'active', permissions: ['reviews.moderate'] });
    ids.client = await mk({
      email: `cli-${RUN}@example.test`, passwordHash: HASH, role: 'client', status: 'active',
      profile: { create: { firstName: `=Formule${RUN}`, lastName: 'Diop' } },
    });
    ids.provider = await mk({
      email: `pro-${RUN}@example.test`, passwordHash: HASH, role: 'provider', status: 'active',
      profile: { create: { firstName: 'Moussa', lastName: 'Kane', idVerified: true } },
      providerProfile: { create: { businessName: 'Kane Services' } },
    });
    ids.category = (await prisma.category.create({ data: { name: `Jardinage ${RUN}`, slug: `jardinage-${RUN}` } })).id;
    ids.service = (await prisma.providerService.create({ data: { providerId: ids.provider, categoryId: ids.category, title: `Taille de haies ${RUN}`, price: 8000 } })).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const users = Object.entries(ids).filter(([k]) => !['category', 'service'].includes(k)).map(([, v]) => v).filter(Boolean);
    await prisma.review.deleteMany({ where: { reviewerId: { in: users } } });
    await prisma.transaction.deleteMany({ where: { payerId: { in: users } } });
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.booking.deleteMany({ where: { clientId: { in: users } } });
    await prisma.providerService.deleteMany({ where: { providerId: { in: users } } });
    await prisma.category.deleteMany({ where: { id: ids.category } });
    await prisma.userSession.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: users } }, { entityId: { in: users } }] } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  describe('exports CSV', () => {
    beforeAll(async () => {
      await prisma.booking.create({ data: { clientId: ids.client, providerId: ids.provider, serviceId: ids.service, status: 'validated', amount: 8000 } });
    });

    it('double permission : exports.run ET lecture des données concernées', async () => {
      expect((await request(app).get(api('/admin/exports/bookings')).set(auth(ids.support))).status).toBe(403); // pas exports.run
      const users = await request(app).get(api('/admin/exports/users')).set(auth(ids.exporter));
      expect(users.status).toBe(403); // exports.run sans users.read
      expect(users.body.missing).toEqual(['users.read']);
      expect((await request(app).get(api('/admin/exports/inconnu')).set(auth(ids.superAdmin))).status).toBe(404);
    });

    it('réservations : CSV filtré, formules neutralisées, aucune empreinte, journalisé', async () => {
      const res = await request(app).get(api(`/admin/exports/bookings?search=${encodeURIComponent(`Taille de haies ${RUN}`)}`)).set(auth(ids.exporter));
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="bla-bookings-\d{4}-\d{2}-\d{2}\.csv"/);
      const lines = res.text.replace(/^﻿/, '').trim().split('\r\n');
      expect(lines[0]).toBe('id;statut;service;client;prestataire;montant;devise;date_prevue;creee_le;paiement');
      expect(lines).toHaveLength(2);
      // Nom commençant par « = » : préfixé d'une apostrophe (jamais interprété comme formule).
      expect(lines[1]).toContain(`;'=Formule${RUN} Diop;`);
      expect(res.text).not.toContain(HASH);
      const audit = await prisma.auditLog.findFirst({ where: { action: 'admin.export', userId: ids.exporter }, orderBy: { createdAt: 'desc' } });
      expect(audit?.newData).toMatchObject({ dataset: 'bookings', rows: 1, truncated: false });
    });

    it('utilisateurs (super-admin) : colonnes attendues, jamais de mot de passe', async () => {
      const res = await request(app).get(api(`/admin/exports/users?search=${RUN}`)).set(auth(ids.superAdmin));
      expect(res.status).toBe(200);
      expect(res.text).toContain(`cli-${RUN}@example.test`);
      expect(res.text).not.toMatch(/password|\$2b\$/);
    });
  });

  describe('historique des connexions', () => {
    beforeAll(async () => {
      await prisma.auditLog.createMany({
        data: [
          { userId: ids.client, action: 'auth.login.success', entity: 'user', entityId: ids.client, ipAddress: '196.200.10.42', newData: { method: 'password' } },
          { userId: ids.client, action: 'auth.login.failed', entity: 'user', entityId: ids.client, ipAddress: '196.200.10.43', newData: { attempts: 1 } },
        ],
      });
      await prisma.userSession.create({ data: { userId: ids.client, refreshHash: `h-${RUN}`, ipAddress: '196.200.10.42', expiresAt: new Date(Date.now() + 3600_000) } });
    });

    it('lecture avec users.read : IP masquée ; avec audit (super-admin) : IP complète', async () => {
      const masked = await request(app).get(api(`/admin/users/${ids.client}/activity`)).set(auth(ids.support));
      expect(masked.status).toBe(200);
      expect(masked.body.logins).toHaveLength(2);
      expect(masked.body.logins.map((l: { success: boolean }) => l.success).sort()).toEqual([false, true]);
      expect(JSON.stringify(masked.body)).not.toContain('196.200.10.42');
      expect(masked.body.sessions[0].ipAddress).toBe('196.200.10.x');
      expect(masked.body.sessions[0]).not.toHaveProperty('refreshHash');

      const full = await request(app).get(api(`/admin/users/${ids.client}/activity`)).set(auth(ids.superAdmin));
      expect(full.body.sessions[0].ipAddress).toBe('196.200.10.42');
      expect((await request(app).get(api(`/admin/users/${ids.client}/activity`)).set(auth(ids.moderator))).status).toBe(403);
    });
  });

  it('tendances : chiffres calculés en base, 30 jours, variation nulle sans référence', async () => {
    const res = await request(app).get(api('/admin/dashboard/trends')).set(auth(ids.superAdmin));
    expect(res.status).toBe(200);
    expect(res.body.daily).toHaveLength(30);
    const signups = res.body.metrics.find((m: { key: string }) => m.key === 'signups');
    expect(signups.current).toBeGreaterThanOrEqual(2); // client + prestataire créés par ce test
    for (const m of res.body.metrics) {
      if (m.previous === 0) expect(m.deltaPercent).toBeNull();
    }
    const today = res.body.daily[res.body.daily.length - 1];
    expect(today.signups).toBeGreaterThanOrEqual(2);
    expect((await request(app).get(api('/admin/dashboard/trends')).set(auth(ids.support))).status).toBe(403);
  });

  describe('modération groupée', () => {
    let reviewIds: string[] = [];
    beforeAll(async () => {
      const bookings = await Promise.all([5, 3].map(() => prisma.booking.create({
        data: { clientId: ids.client, providerId: ids.provider, serviceId: ids.service, status: 'validated', amount: 8000 },
      })));
      reviewIds = await Promise.all(bookings.map((b, i) => prisma.review.create({
        data: { bookingId: b.id, reviewerId: ids.client, reviewedId: ids.provider, rating: i === 0 ? 5 : 3, comment: 'Avis de test' },
      }).then((r) => r.id)));
    });

    it('publication groupée : notes recalculées, auteurs notifiés, journalisé', async () => {
      const res = await request(app).post(api('/admin/reviews/bulk')).set(auth(ids.moderator)).send({ ids: reviewIds, action: 'approve' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 2, skipped: 0 });
      const profile = await prisma.providerProfile.findUniqueOrThrow({ where: { userId: ids.provider } });
      expect(Number(profile.ratingAverage)).toBe(4);
      expect(profile.ratingCount).toBe(2);
      expect(await countNotifications(prisma, { userId: ids.client, type: 'review.published' }, 2)).toBe(2);
      const again = await request(app).post(api('/admin/reviews/bulk')).set(auth(ids.moderator)).send({ ids: reviewIds, action: 'approve' });
      expect(again.body).toEqual({ updated: 0, skipped: 2 });
    });

    it('refus groupé : motif obligatoire ; 100 éléments maximum', async () => {
      expect((await request(app).post(api('/admin/reviews/bulk')).set(auth(ids.moderator)).send({ ids: reviewIds, action: 'reject' })).status).toBe(422);
      const tooMany = Array.from({ length: 101 }, () => reviewIds[0]);
      expect((await request(app).post(api('/admin/reviews/bulk')).set(auth(ids.moderator)).send({ ids: tooMany, action: 'approve' })).status).toBe(422);
      const res = await request(app).post(api('/admin/reviews/bulk')).set(auth(ids.moderator)).send({ ids: [reviewIds[1]], action: 'reject', reason: 'Hors sujet' });
      expect(res.body.updated).toBe(1);
      const profile = await prisma.providerProfile.findUniqueOrThrow({ where: { userId: ids.provider } });
      expect(profile.ratingCount).toBe(1);
      expect(Number(profile.ratingAverage)).toBe(5);
    });
  });

  it('filtres serveur : prestataires vérifiés, recherche de réservation, journal par auteur', async () => {
    const verified = await request(app).get(api(`/admin/providers?verified=true&search=${RUN}`)).set(auth(ids.superAdmin));
    expect(verified.body.data.map((u: { id: string }) => u.id)).toContain(ids.provider);
    expect(JSON.stringify(verified.body)).not.toMatch(/passwordHash|mfaSecret/);
    const unverified = await request(app).get(api(`/admin/providers?verified=false&search=${RUN}`)).set(auth(ids.superAdmin));
    expect(unverified.body.data.map((u: { id: string }) => u.id)).not.toContain(ids.provider);

    const found = await request(app).get(api(`/admin/bookings?search=${encodeURIComponent(`Taille de haies ${RUN}`)}&sort=amount:asc`)).set(auth(ids.superAdmin));
    expect(found.body.data.length).toBeGreaterThanOrEqual(1);

    const audit = await request(app).get(api(`/admin/audit?userId=${ids.exporter}&action=admin.export`)).set(auth(ids.superAdmin));
    expect(audit.status).toBe(200);
    expect(audit.body.data.every((a: { action: string }) => a.action === 'admin.export')).toBe(true);
  });
});

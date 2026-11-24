/**
 * Lot 0 — non-régression CONFIDENTIALITÉ sur un VRAI PostgreSQL (migrations appliquées).
 *
 * Les requêtes HTTP passent par l'application complète (routes, middlewares,
 * contrôleurs, Prisma). On vérifie dans le corps JSON BRUT qu'aucune empreinte de
 * mot de passe ni donnée personnelle non autorisée n'apparaît.
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

// Jeton de test « uid:<id> » : seul le décodage est simulé, l'utilisateur est relu en base.
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

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

if (url && /supabase\.co|supabase\.com|pooler\.supabase|onrender\.com/i.test(url)) {
  throw new Error('TEST_DATABASE_URL pointe vers un hébergeur distant : refusé (base locale jetable uniquement).');
}

const RUN = Date.now().toString(36);
// Valeurs « sentinelles » : si l'une apparaît dans une réponse non autorisée, le test échoue.
const SECRET = {
  providerHash: `$2b$12$PROVIDERHASH${RUN}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`,
  clientHash: `$2b$12$CLIENTHASH${RUN}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`,
  adminHash: `$2b$12$ADMINHASH${RUN}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`,
  providerEmail: `prestataire-${RUN}@example.test`,
  providerPhone: `+2217${RUN.slice(-8).replace(/\D/g, '1').padEnd(8, '1')}`,
  clientEmail: `client-${RUN}@example.test`,
  clientPhone: `+2257${RUN.slice(-8).replace(/\D/g, '2').padEnd(8, '2')}`,
  providerAddress: `12 rue Secrète ${RUN}, Dakar`,
  clientAddress: `7 avenue Privée ${RUN}, Abidjan`,
  clientIdCard: `https://example.test/kyc/client-${RUN}.pdf`,
  providerIdCard: `https://example.test/kyc/provider-${RUN}.pdf`,
  providerLat: 14.716677,
  providerLng: -17.467686,
};

describeDb('PostgreSQL réel — aucune fuite de données dans les réponses (lot 0)', () => {
  let app: Express;
  let prisma: PrismaClient;
  const ids = {
    provider: '', client: '', other: '', superAdmin: '', support: '', kyc: '',
    category: '', service: '', booking: '', paidBooking: '', review: '', report: '',
  };
  const auth = (userId: string) => ({ Authorization: `Bearer uid:${userId}` });

  /** Corps JSON brut : la recherche porte sur TOUTE la réponse, quelle que soit sa structure. */
  const raw = (res: request.Response) => JSON.stringify(res.body);
  const expectNoSecrets = (res: request.Response) => {
    const body = raw(res);
    for (const hash of [SECRET.providerHash, SECRET.clientHash, SECRET.adminHash]) expect(body).not.toContain(hash);
    expect(body).not.toMatch(/passwordHash|password_hash|mfaSecret|refreshHash|codeHash/);
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    jest.resetModules();
    ({ app } = await import('../../src/app'));
    ({ prisma } = await import('../../src/config/database'));

    const mk = (data: Parameters<PrismaClient['user']['create']>[0]['data']) =>
      prisma.user.create({ data, select: { id: true } }).then((u) => u.id);

    ids.provider = await mk({
      email: SECRET.providerEmail, phone: SECRET.providerPhone, passwordHash: SECRET.providerHash,
      role: 'provider', status: 'active',
      profile: { create: {
        firstName: 'Awa', lastName: 'Ndiaye', city: 'Dakar', country: 'SN', address: SECRET.providerAddress,
        idCardUrl: SECRET.providerIdCard, idVerified: true, dateOfBirth: new Date('1990-05-17'),
        latitude: SECRET.providerLat, longitude: SECRET.providerLng,
      } },
      providerProfile: { create: { businessName: 'Awa Services', hourlyRate: 5000, isAvailable: true } },
    });
    ids.client = await mk({
      email: SECRET.clientEmail, phone: SECRET.clientPhone, passwordHash: SECRET.clientHash,
      role: 'client', status: 'active',
      profile: { create: {
        firstName: 'Koffi', lastName: 'Yao', city: 'Abidjan', country: 'CI', address: SECRET.clientAddress,
        idCardUrl: SECRET.clientIdCard, dateOfBirth: new Date('1985-02-03'),
      } },
    });
    ids.other = await mk({
      email: `autre-${RUN}@example.test`, passwordHash: SECRET.clientHash, role: 'client', status: 'active',
      profile: { create: { firstName: 'Tiers', lastName: 'Externe' } },
    });
    ids.superAdmin = await mk({ email: `sa-${RUN}@example.test`, passwordHash: SECRET.adminHash, role: 'super_admin', status: 'active' });
    ids.support = await mk({
      email: `support-${RUN}@example.test`, passwordHash: SECRET.adminHash, role: 'admin', status: 'active',
      permissions: ['users.read', 'contacts.handle', 'bookings.read', 'reports.handle'],
    });
    ids.kyc = await mk({
      email: `kyc-${RUN}@example.test`, passwordHash: SECRET.adminHash, role: 'admin', status: 'active',
      permissions: ['users.read', 'providers.read', 'providers.verify'],
    });

    ids.category = (await prisma.category.create({ data: { name: `Plomberie ${RUN}`, slug: `plomberie-${RUN}` } })).id;
    ids.service = (await prisma.providerService.create({
      data: { providerId: ids.provider, categoryId: ids.category, title: 'Réparation fuite', price: 15000 },
    })).id;
    ids.booking = (await prisma.booking.create({
      data: { clientId: ids.client, providerId: ids.provider, serviceId: ids.service, status: 'pending', amount: 15000, clientAddress: 'Lieu de la mission' },
    })).id;
    ids.paidBooking = (await prisma.booking.create({
      data: { clientId: ids.client, providerId: ids.provider, serviceId: ids.service, status: 'accepted', amount: 15000 },
    })).id;
    await prisma.transaction.create({
      data: {
        bookingId: ids.paidBooking, payerId: ids.client, payeeId: ids.provider, amount: 15000, commission: 750,
        netAmount: 14250, method: 'wave', status: 'completed', metadata: { providerPayload: 'interne' },
      },
    });
    const doneBooking = await prisma.booking.create({
      data: { clientId: ids.client, providerId: ids.provider, serviceId: ids.service, status: 'validated', amount: 15000 },
    });
    ids.review = (await prisma.review.create({
      data: { bookingId: doneBooking.id, reviewerId: ids.client, reviewedId: ids.provider, rating: 5, comment: 'Travail rapide et soigné, je recommande vivement.' },
    })).id;
    ids.report = (await prisma.report.create({
      data: { reporterId: ids.client, reportedId: ids.provider, reason: 'other', description: 'Test' },
    })).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const users = Object.values({ a: ids.provider, b: ids.client, c: ids.other, d: ids.superAdmin, e: ids.support, f: ids.kyc }).filter(Boolean);
    await prisma.report.deleteMany({ where: { reporterId: { in: users } } });
    await prisma.review.deleteMany({ where: { reviewerId: { in: users } } });
    await prisma.transaction.deleteMany({ where: { payerId: { in: users } } });
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.booking.deleteMany({ where: { clientId: { in: users } } });
    await prisma.providerService.deleteMany({ where: { providerId: { in: users } } });
    await prisma.category.deleteMany({ where: { id: ids.category } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: users } } });
    await prisma.userSession.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  describe('public (sans connexion)', () => {
    it('GET /providers/:id : profil public sans e-mail, téléphone, adresse, pièce ni empreinte', async () => {
      const res = await request(app).get(`/api/v1/providers/${ids.provider}`);
      expect(res.status).toBe(200);
      expectNoSecrets(res);
      const body = raw(res);
      for (const value of [SECRET.providerEmail, SECRET.providerPhone, SECRET.providerAddress, SECRET.providerIdCard]) {
        expect(body).not.toContain(value);
      }
      expect(body).not.toMatch(/"(email|phone|permissions|loginAttempts|lockedUntil|dateOfBirth|idCardUrl)"/);
      expect(res.body.profile).toMatchObject({ firstName: 'Awa', city: 'Dakar', idVerified: true });
      expect(res.body.isVerified).toBe(true);
    });

    it('GET /services et /services/:id : ni contact ni position exacte du prestataire', async () => {
      const list = await request(app).get('/api/v1/services').query({ providerId: ids.provider, lat: 14.7, lng: -17.45, limit: 50 });
      expect(list.status).toBe(200);
      expectNoSecrets(list);
      expect(list.body.data.map((s: { id: string }) => s.id)).toContain(ids.service);
      expect(raw(list)).not.toContain('exactDistanceKm');
      expect(list.body.data[0].provider.latitude).toBe(14.72);
      const one = await request(app).get(`/api/v1/services/${ids.service}`);
      expect(one.status).toBe(200);
      expectNoSecrets(one);
      for (const res of [list, one]) {
        const body = raw(res);
        for (const value of [SECRET.providerEmail, SECRET.providerPhone, SECRET.providerAddress, SECRET.providerIdCard, String(SECRET.providerLat)]) {
          expect(body).not.toContain(value);
        }
      }
    });

    it('GET /providers/search : position arrondie (≈ 1 km), pas d\'adresse', async () => {
      const res = await request(app).get('/api/v1/providers/search').query({ lat: 14.7, lng: -17.45, radius: 20 });
      expect(res.status).toBe(200);
      const row = res.body.data.find((r: { id: string }) => r.id === ids.provider);
      expect(row).toBeDefined();
      expect(row.address).toBeUndefined();
      expect(row.latitude).toBe(14.72);
      expect(row.longitude).toBe(-17.47);
      expect(Number.isInteger(row.distanceKm * 2)).toBe(true); // demi-kilomètre
      expectNoSecrets(res);
    });

    it('GET /site/stats : seuils réels (aucun chiffre sous le seuil) ; /site/testimonials : avis approuvés seulement', async () => {
      const stats = await request(app).get('/api/v1/site/stats');
      expect(stats.status).toBe(200);
      for (const item of stats.body.items) {
        if (item.key === 'verified_providers') expect(item.value).toBeGreaterThanOrEqual(10);
        if (item.key === 'completed_missions') expect(item.value).toBeGreaterThanOrEqual(10);
        if (item.key === 'average_rating') expect(item.count).toBeGreaterThanOrEqual(5);
      }
      const before = await request(app).get('/api/v1/site/testimonials');
      expect(before.body.items.find((t: { id: string }) => t.id === ids.review)).toBeUndefined(); // non approuvé

      await prisma.review.update({ where: { id: ids.review }, data: { isApproved: true, approvedAt: new Date() } });
      const after = await request(app).get('/api/v1/site/testimonials');
      const shown = after.body.items.find((t: { id: string }) => t.id === ids.review);
      expect(shown).toMatchObject({ authorName: 'Koffi Y.', city: 'Abidjan', rating: 5 });
      expectNoSecrets(after);
      expect(raw(after)).not.toContain(SECRET.clientEmail);
    });
  });

  describe('réservations (client ↔ prestataire)', () => {
    it('le prestataire ne reçoit ni l\'e-mail, ni le téléphone, ni la pièce, ni la date de naissance du client', async () => {
      for (const path of ['/api/v1/bookings', `/api/v1/bookings/${ids.booking}`]) {
        const res = await request(app).get(path).set(auth(ids.provider));
        expect(res.status).toBe(200);
        expectNoSecrets(res);
        const body = raw(res);
        for (const value of [SECRET.clientEmail, SECRET.clientPhone, SECRET.clientAddress, SECRET.clientIdCard, '1985-02-03']) {
          expect(body).not.toContain(value);
        }
      }
      const one = await request(app).get(`/api/v1/bookings/${ids.booking}`).set(auth(ids.provider));
      expect(one.body.client).toMatchObject({ firstName: 'Koffi', lastName: 'Yao' });
      expect(one.body.clientAddress).toBe('Lieu de la mission'); // adresse de la MISSION : nécessaire au prestataire
    });

    it('le client ne reçoit ni l\'e-mail ni le téléphone du prestataire ; transaction sans métadonnées', async () => {
      const res = await request(app).get(`/api/v1/bookings/${ids.paidBooking}`).set(auth(ids.client));
      expect(res.status).toBe(200);
      expectNoSecrets(res);
      const body = raw(res);
      for (const value of [SECRET.providerEmail, SECRET.providerPhone, SECRET.providerAddress, SECRET.providerIdCard]) {
        expect(body).not.toContain(value);
      }
      expect(res.body.transaction).toMatchObject({ status: 'completed' });
      expect(res.body.transaction.metadata).toBeUndefined();
    });

    it('un tiers ne voit pas la réservation (404)', async () => {
      const res = await request(app).get(`/api/v1/bookings/${ids.booking}`).set(auth(ids.other));
      expect(res.status).toBe(404);
    });

    it('/providers/me/profile : ses propres données, jamais son empreinte de mot de passe', async () => {
      const res = await request(app).get('/api/v1/providers/me/profile').set(auth(ids.provider));
      expect(res.status).toBe(200);
      expectNoSecrets(res);
      expect(res.body.email).toBe(SECRET.providerEmail);
    });
  });

  describe('transitions atomiques', () => {
    it('10 acceptations SIMULTANÉES de la même réservation → une seule réussit, les autres 409', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, () => request(app).put(`/api/v1/bookings/${ids.booking}/accept`).set(auth(ids.provider))),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(9);
      const row = await prisma.booking.findUniqueOrThrow({ where: { id: ids.booking } });
      expect(row.status).toBe('accepted');
    });

    it('le client ne peut pas accepter (403) ; un tiers ne peut pas annuler (404)', async () => {
      expect((await request(app).put(`/api/v1/bookings/${ids.booking}/accept`).set(auth(ids.client))).status).toBe(403);
      expect((await request(app).put(`/api/v1/bookings/${ids.booking}/cancel`).set(auth(ids.other))).status).toBe(404);
    });

    it('réservation déjà payée : annulation libre-service refusée (409), statut inchangé', async () => {
      const res = await request(app).put(`/api/v1/bookings/${ids.paidBooking}/cancel`).set(auth(ids.client)).send({ reason: 'test' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_ALREADY_PAID');
      const row = await prisma.booking.findUniqueOrThrow({ where: { id: ids.paidBooking } });
      expect(row.status).toBe('accepted');
    });
  });

  describe('administration', () => {
    it('listes admin : coordonnées visibles pour l\'équipe autorisée, jamais d\'empreinte', async () => {
      for (const path of ['/api/v1/admin/users', '/api/v1/admin/bookings', '/api/v1/admin/reviews', '/api/v1/admin/reports', '/api/v1/admin/transactions', '/api/v1/admin/reviews/pending']) {
        const res = await request(app).get(path).query({ limit: 50 }).set(auth(ids.superAdmin));
        expect([path, res.status]).toEqual([path, 200]);
        expectNoSecrets(res);
      }
    });

    it('fiche utilisateur : pièce d\'identité visible avec la permission KYC uniquement', async () => {
      const kyc = await request(app).get(`/api/v1/admin/users/${ids.client}`).set(auth(ids.kyc));
      expect(kyc.status).toBe(200);
      expectNoSecrets(kyc);
      expect(kyc.body.profile.idCardUrl).toBe(SECRET.clientIdCard);

      const support = await request(app).get(`/api/v1/admin/users/${ids.client}`).set(auth(ids.support));
      expect(support.status).toBe(200);
      expectNoSecrets(support);
      expect(raw(support)).not.toContain(SECRET.clientIdCard);
      expect(support.body.profile.dateOfBirth).toBeUndefined();
    });

    it('permissions de lecture appliquées : support sans « paiements » → 403 sur les transactions', async () => {
      expect((await request(app).get('/api/v1/admin/transactions').set(auth(ids.support))).status).toBe(403);
      expect((await request(app).get('/api/v1/admin/dashboard').set(auth(ids.support))).status).toBe(403);
      expect((await request(app).get('/api/v1/admin/users').set(auth(ids.support))).status).toBe(200);
    });

    it('un admin ne voit pas toutes les réservations via /bookings (route client)', async () => {
      const res = await request(app).get('/api/v1/bookings').set(auth(ids.superAdmin));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('suspension d\'un client : sessions fermées et action journalisée ; super_admin non ciblable', async () => {
      await prisma.userSession.create({ data: { userId: ids.other, refreshHash: 'x', expiresAt: new Date(Date.now() + 3600_000) } });
      const res = await request(app).put(`/api/v1/admin/users/${ids.other}/status`).set(auth(ids.superAdmin)).send({ status: 'suspended' });
      expect(res.status).toBe(200);
      expect(await prisma.userSession.count({ where: { userId: ids.other } })).toBe(0);
      const audit = await prisma.auditLog.findFirst({ where: { action: 'admin.user.status', entityId: ids.other }, orderBy: { createdAt: 'desc' } });
      expect(audit?.userId).toBe(ids.superAdmin);
      expect(audit?.oldData).toEqual({ status: 'active' });

      const blocked = await request(app).put(`/api/v1/admin/users/${ids.superAdmin}/status`).set(auth(ids.kyc)).send({ status: 'banned' });
      expect(blocked.status).toBe(403);
    });

    it('validation d\'identité : ne réactive jamais un compte suspendu', async () => {
      const res = await request(app).post(`/api/v1/admin/users/${ids.other}/verify-id`).set(auth(ids.superAdmin)).send({ approved: true });
      expect(res.status).toBe(409); // aucune pièce déposée
      await prisma.profile.update({ where: { userId: ids.other }, data: { idCardUrl: 'https://example.test/kyc/tiers.pdf' } });
      const ok = await request(app).post(`/api/v1/admin/users/${ids.other}/verify-id`).set(auth(ids.superAdmin)).send({ approved: true });
      expect(ok.status).toBe(200);
      expect(ok.body.activated).toBe(false);
      const row = await prisma.user.findUniqueOrThrow({ where: { id: ids.other } });
      expect(row.status).toBe('suspended');
    });

    it('catégories : identifiant URL en double → 409 ; champ non autorisé → 422', async () => {
      const dup = await request(app).post('/api/v1/admin/categories').set(auth(ids.superAdmin)).send({ name: 'Doublon', slug: `plomberie-${RUN}` });
      expect(dup.status).toBe(409);
      const extra = await request(app).put(`/api/v1/admin/categories/${ids.category}`).set(auth(ids.superAdmin)).send({ id: '00000000-0000-0000-0000-000000000000' });
      expect(extra.status).toBe(422);
    });
  });
});

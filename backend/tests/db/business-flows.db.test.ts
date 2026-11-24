/**
 * Lot 1 — parcours métier complets sur un VRAI PostgreSQL (migrations appliquées) :
 * cycle d'une mission, litige et arbitrage, avis et modération, signalements,
 * notifications dans l'application, consultation de la pièce d'identité.
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

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

if (url && /supabase\.co|supabase\.com|pooler\.supabase|onrender\.com/i.test(url)) {
  throw new Error('TEST_DATABASE_URL pointe vers un hébergeur distant : refusé (base locale jetable uniquement).');
}

const RUN = `f${Date.now().toString(36)}`;
const HASH = `$2b$12$FLOWHASH${RUN}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`;
const FUTURE = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();

describeDb('PostgreSQL réel — parcours métier (lot 1)', () => {
  let app: Express;
  let prisma: PrismaClient;
  const ids = {
    client: '', client2: '', provider: '', provider2: '', superAdmin: '', moderator: '', support: '', kyc: '', noPerm: '',
    category: '', service: '', service2: '',
  };
  const auth = (userId: string) => ({ Authorization: `Bearer uid:${userId}` });
  const api = (path: string) => `/api/v1${path}`;
  const notifs = (userId: string, type: string) => prisma.notification.count({ where: { userId, type } });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    jest.resetModules();
    ({ app } = await import('../../src/app'));
    ({ prisma } = await import('../../src/config/database'));

    const mk = (data: Parameters<PrismaClient['user']['create']>[0]['data']) =>
      prisma.user.create({ data, select: { id: true } }).then((u) => u.id);

    ids.client = await mk({
      email: `c1-${RUN}@example.test`, passwordHash: HASH, role: 'client', status: 'active',
      profile: { create: { firstName: 'Mariam', lastName: 'Kone', city: 'Abidjan' } },
    });
    ids.client2 = await mk({
      email: `c2-${RUN}@example.test`, passwordHash: HASH, role: 'client', status: 'active',
      profile: { create: { firstName: 'Ibrahima', lastName: 'Sow' } },
    });
    ids.provider = await mk({
      email: `p1-${RUN}@example.test`, passwordHash: HASH, role: 'provider', status: 'active',
      profile: { create: { firstName: 'Seydou', lastName: 'Traore', idCardUrl: 'https://res.cloudinary.com/demo/image/upload/v17/bla/kyc/p1/piece.jpg' } },
      providerProfile: { create: { businessName: 'Seydou Élec', isAvailable: true } },
    });
    ids.provider2 = await mk({
      email: `p2-${RUN}@example.test`, passwordHash: HASH, role: 'provider', status: 'active',
      profile: { create: { firstName: 'Fatou', lastName: 'Diop' } },
      providerProfile: { create: { businessName: 'Indisponible', isAvailable: false } },
    });
    ids.superAdmin = await mk({ email: `sa-${RUN}@example.test`, passwordHash: HASH, role: 'super_admin', status: 'active' });
    ids.moderator = await mk({
      email: `mod-${RUN}@example.test`, passwordHash: HASH, role: 'admin', status: 'active', permissions: ['reviews.moderate'],
    });
    ids.support = await mk({
      email: `sup-${RUN}@example.test`, passwordHash: HASH, role: 'admin', status: 'active', permissions: ['reports.handle', 'bookings.read'],
    });
    ids.kyc = await mk({
      email: `kyc-${RUN}@example.test`, passwordHash: HASH, role: 'admin', status: 'active', permissions: ['users.read', 'providers.verify'],
    });
    ids.noPerm = await mk({ email: `np-${RUN}@example.test`, passwordHash: HASH, role: 'admin', status: 'active', permissions: ['users.read'] });

    ids.category = (await prisma.category.create({ data: { name: `Électricité ${RUN}`, slug: `electricite-${RUN}` } })).id;
    ids.service = (await prisma.providerService.create({
      data: { providerId: ids.provider, categoryId: ids.category, title: 'Dépannage électrique', price: 20000 },
    })).id;
    ids.service2 = (await prisma.providerService.create({
      data: { providerId: ids.provider2, categoryId: ids.category, title: 'Installation', price: 10000 },
    })).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const users = Object.entries(ids).filter(([k]) => !['category', 'service', 'service2'].includes(k)).map(([, v]) => v).filter(Boolean);
    await prisma.report.deleteMany({ where: { reporterId: { in: users } } });
    await prisma.review.deleteMany({ where: { reviewerId: { in: users } } });
    await prisma.transaction.deleteMany({ where: { payerId: { in: users } } });
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.booking.deleteMany({ where: { clientId: { in: users } } });
    await prisma.providerService.deleteMany({ where: { providerId: { in: users } } });
    await prisma.category.deleteMany({ where: { id: ids.category } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  /** Crée une réservation via l'API (client) et retourne son identifiant. */
  async function book(serviceId = ids.service, providerId = ids.provider, clientId = ids.client): Promise<string> {
    const res = await request(app).post(api('/bookings')).set(auth(clientId))
      .send({ providerId, serviceId, description: 'Panne de courant dans la cuisine', scheduledAt: FUTURE, clientAddress: 'Lieu de mission' });
    expect(res.status).toBe(201);
    return res.body.id;
  }
  const put = (path: string, userId: string, body: object = {}) => request(app).put(api(path)).set(auth(userId)).send(body);

  describe('création de réservation : contrôles de cohérence', () => {
    it('client uniquement, prestataire disponible, date future, pas de doublon en attente', async () => {
      const asProvider = await request(app).post(api('/bookings')).set(auth(ids.provider2))
        .send({ providerId: ids.provider, serviceId: ids.service, description: 'Une demande quelconque' });
      expect(asProvider.status).toBe(403);

      const past = await request(app).post(api('/bookings')).set(auth(ids.client))
        .send({ providerId: ids.provider, serviceId: ids.service, description: 'Une demande dans le passé', scheduledAt: '2020-01-01T10:00:00.000Z' });
      expect(past.status).toBe(422);

      const unavailable = await request(app).post(api('/bookings')).set(auth(ids.client))
        .send({ providerId: ids.provider2, serviceId: ids.service2, description: 'Prestataire indisponible' });
      expect(unavailable.status).toBe(409);
      expect(unavailable.body.code).toBe('PROVIDER_UNAVAILABLE');

      const first = await book(ids.service, ids.provider, ids.client2);
      const dup = await request(app).post(api('/bookings')).set(auth(ids.client2))
        .send({ providerId: ids.provider, serviceId: ids.service, description: 'Même demande une seconde fois' });
      expect(dup.status).toBe(409);
      expect(dup.body.bookingId).toBe(first);
      expect(await notifs(ids.provider, 'booking.created')).toBeGreaterThanOrEqual(1);
    });
  });

  describe('cycle complet d\'une mission', () => {
    it('acceptation → démarrage → fin → validation, avec notification de la contrepartie à chaque étape', async () => {
      const id = await book();
      expect((await put(`/bookings/${id}/start`, ids.provider)).status).toBe(409); // pas encore acceptée
      expect((await put(`/bookings/${id}/accept`, ids.client)).status).toBe(403); // le client n'accepte pas
      expect((await put(`/bookings/${id}/accept`, ids.provider)).status).toBe(200);
      expect((await put(`/bookings/${id}/start`, ids.provider)).status).toBe(200);
      expect((await put(`/bookings/${id}/complete`, ids.provider)).status).toBe(200);

      // Paiement enregistré : la validation libère les fonds (escrow).
      await prisma.transaction.create({
        data: { bookingId: id, payerId: ids.client, payeeId: ids.provider, amount: 20000, commission: 1000, netAmount: 19000, method: 'wave', status: 'completed', paidAt: new Date() },
      });
      expect((await put(`/bookings/${id}/validate`, ids.provider)).status).toBe(403);
      const validated = await put(`/bookings/${id}/validate`, ids.client);
      expect(validated.status).toBe(200);
      expect(validated.body.status).toBe('validated');
      const tx = await prisma.transaction.findUniqueOrThrow({ where: { bookingId: id } });
      expect(tx.releasedAt).not.toBeNull();

      for (const type of ['booking.accepted', 'booking.started', 'booking.completed']) {
        expect(await prisma.notification.count({ where: { userId: ids.client, type, data: { path: ['bookingId'], equals: id } } })).toBe(1);
      }
      expect(await prisma.notification.count({ where: { userId: ids.provider, type: 'booking.validated', data: { path: ['bookingId'], equals: id } } })).toBe(1);
      // L'auteur d'une action n'est jamais notifié de sa propre action.
      expect(await prisma.notification.count({ where: { userId: ids.provider, type: 'booking.accepted' } })).toBe(0);
    });

    it('refus par le prestataire ; annulation par le client avec motif', async () => {
      const a = await book(ids.service, ids.provider, ids.client);
      const rejected = await put(`/bookings/${a}/reject`, ids.provider);
      expect(rejected.status).toBe(200);
      expect(rejected.body.status).toBe('rejected');

      const b = await book(ids.service, ids.provider, ids.client);
      const cancelled = await put(`/bookings/${b}/cancel`, ids.client, { reason: 'Changement de programme' });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.cancellationReason).toBe('Changement de programme');
      expect(await prisma.notification.count({ where: { userId: ids.provider, type: 'booking.cancelled', data: { path: ['bookingId'], equals: b } } })).toBe(1);
    });
  });

  describe('litige', () => {
    it('le client signale un problème : litige + signalement atomiques, puis arbitrage par l\'équipe', async () => {
      const id = await book();
      await put(`/bookings/${id}/accept`, ids.provider);
      await put(`/bookings/${id}/start`, ids.provider);
      await put(`/bookings/${id}/complete`, ids.provider);

      expect((await put(`/bookings/${id}/dispute`, ids.provider, { reason: 'other', description: 'Le prestataire ne peut pas' })).status).toBe(403);
      expect((await put(`/bookings/${id}/dispute`, ids.client, { reason: 'other', description: 'court' })).status).toBe(422);

      const disputed = await put(`/bookings/${id}/dispute`, ids.client, { reason: 'no_show', description: 'Travail non terminé, prises toujours hors service' });
      expect(disputed.status).toBe(200);
      expect(disputed.body.status).toBe('disputed');
      expect(await prisma.report.count({ where: { bookingId: id, status: 'pending' } })).toBe(1);
      expect(await notifs(ids.provider, 'booking.disputed')).toBeGreaterThanOrEqual(1);
      expect(await notifs(ids.support, 'report.created')).toBeGreaterThanOrEqual(1);
      expect(await notifs(ids.moderator, 'report.created')).toBe(0); // permission non détenue

      // Plus de validation client ni de second litige une fois en litige.
      expect((await put(`/bookings/${id}/validate`, ids.client)).status).toBe(409);
      expect((await put(`/bookings/${id}/dispute`, ids.client, { reason: 'other', description: 'Second signalement identique' })).status).toBe(409);

      const noPerm = await request(app).post(api(`/admin/bookings/${id}/resolve-dispute`)).set(auth(ids.moderator)).send({ outcome: 'validate', note: 'Décision test' });
      expect(noPerm.status).toBe(403);
      const badBody = await request(app).post(api(`/admin/bookings/${id}/resolve-dispute`)).set(auth(ids.support)).send({ outcome: 'refund', note: 'x' });
      expect(badBody.status).toBe(422);

      const resolved = await request(app).post(api(`/admin/bookings/${id}/resolve-dispute`)).set(auth(ids.support))
        .send({ outcome: 'cancel', note: 'Mission non réalisée, constat des deux parties' });
      expect(resolved.status).toBe(200);
      expect(resolved.body.status).toBe('cancelled');
      expect(resolved.body.refundRequired).toBe(false);
      expect(await prisma.report.count({ where: { bookingId: id, status: 'resolved' } })).toBe(1);
      expect(await notifs(ids.client, 'booking.dispute_resolved')).toBeGreaterThanOrEqual(1);
      const audit = await prisma.auditLog.findFirst({ where: { action: 'admin.booking.resolve_dispute', entityId: id } });
      expect(audit?.userId).toBe(ids.support);

      const again = await request(app).post(api(`/admin/bookings/${id}/resolve-dispute`)).set(auth(ids.support)).send({ outcome: 'validate', note: 'Seconde décision' });
      expect(again.status).toBe(409);
    });
  });

  describe('avis et modération', () => {
    let bookingId = '';
    let reviewId = '';

    it('avis possible uniquement après la mission, une seule fois (même en envois simultanés)', async () => {
      bookingId = await book();
      const early = await request(app).post(api('/reviews')).set(auth(ids.client)).send({ bookingId, rating: 5, comment: 'Trop tôt' });
      expect(early.status).toBe(409);
      await put(`/bookings/${bookingId}/accept`, ids.provider);
      await put(`/bookings/${bookingId}/start`, ids.provider);
      await put(`/bookings/${bookingId}/complete`, ids.provider);

      const other = await request(app).post(api('/reviews')).set(auth(ids.client2)).send({ bookingId, rating: 1 });
      expect(other.status).toBe(404);

      const payload = { bookingId, rating: 4, comment: 'Intervention efficace, prestataire ponctuel et courtois.' };
      const results = await Promise.all(Array.from({ length: 5 }, () => request(app).post(api('/reviews')).set(auth(ids.client)).send(payload)));
      const statuses = results.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(4);
      reviewId = results.find((r) => r.status === 201)!.body.review.id;
      expect(results.find((r) => r.status === 201)!.body.review.status).toBe('pending');
    });

    it('non publié tant qu\'il n\'est pas approuvé ; le prestataire ne peut pas encore répondre', async () => {
      const pub = await request(app).get(api(`/providers/${ids.provider}/reviews`));
      expect(pub.status).toBe(200);
      expect(pub.body.data.map((r: { id: string }) => r.id)).not.toContain(reviewId);
      const early = await put(`/reviews/${reviewId}/respond`, ids.provider, { response: 'Merci beaucoup !' });
      expect(early.status).toBe(409);
    });

    it('approbation → publié, note recalculée, notifications ; réponse publique du prestataire', async () => {
      expect((await put(`/admin/reviews/${reviewId}/approve`, ids.noPerm)).status).toBe(403);
      const ok = await put(`/admin/reviews/${reviewId}/approve`, ids.moderator);
      expect(ok.status).toBe(200);
      const profile = await prisma.providerProfile.findUniqueOrThrow({ where: { userId: ids.provider } });
      expect(Number(profile.ratingAverage)).toBe(4);
      expect(profile.ratingCount).toBe(1);
      expect(await notifs(ids.client, 'review.published')).toBe(1);
      expect(await notifs(ids.provider, 'review.received')).toBe(1);

      expect((await put(`/reviews/${reviewId}/respond`, ids.provider, { response: 'Merci pour votre confiance.' })).status).toBe(200);

      const pub = await request(app).get(api(`/providers/${ids.provider}/reviews`));
      const row = pub.body.data.find((r: { id: string }) => r.id === reviewId);
      expect(row).toMatchObject({ rating: 4, reviewerName: 'Mariam K.', response: 'Merci pour votre confiance.' });
      expect(JSON.stringify(pub.body)).not.toMatch(/reviewerId|reviewedId|approvedBy|bookingId|flagReason|aiScore/);
    });

    it('refus motivé : avis masqué (conservé), note recalculée, auteur notifié', async () => {
      expect((await put(`/admin/reviews/${reviewId}/reject`, ids.moderator, { reason: 'x' })).status).toBe(422);
      const res = await put(`/admin/reviews/${reviewId}/reject`, ids.moderator, { reason: 'Contenu hors sujet' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Avis dépublié');
      const row = await prisma.review.findUniqueOrThrow({ where: { id: reviewId } });
      expect(row).toMatchObject({ isApproved: false, isFlagged: true, flagReason: 'Contenu hors sujet' });
      const profile = await prisma.providerProfile.findUniqueOrThrow({ where: { userId: ids.provider } });
      expect(profile.ratingCount).toBe(0);
      expect(await notifs(ids.client, 'review.rejected')).toBe(1);

      const filtered = await request(app).get(api('/admin/reviews?status=rejected')).set(auth(ids.moderator));
      expect(filtered.body.data.map((r: { id: string }) => r.id)).toContain(reviewId);
      expect((await request(app).get(api('/admin/reviews?status=nimporte')).set(auth(ids.moderator))).status).toBe(422);

      const mine = await request(app).get(api('/reviews/me')).set(auth(ids.client));
      expect(mine.body.data.find((r: { id: string }) => r.id === reviewId).status).toBe('rejected');
    });
  });

  describe('signalements', () => {
    it('réservation citée obligatoirement partagée ; pas de doublon en cours ; équipe notifiée', async () => {
      const foreign = (await prisma.booking.create({
        data: { clientId: ids.client2, providerId: ids.provider, serviceId: ids.service, status: 'accepted', amount: 20000 },
      })).id;
      const notShared = await request(app).post(api('/reports')).set(auth(ids.client))
        .send({ reportedId: ids.provider, bookingId: foreign, reason: 'other', description: 'Réservation qui ne me concerne pas' });
      expect(notShared.status).toBe(404);

      const ok = await request(app).post(api('/reports')).set(auth(ids.client))
        .send({ reportedId: ids.provider, reason: 'harassment', description: 'Messages insistants' });
      expect(ok.status).toBe(201);
      expect(ok.body.report.reportedName).toBe('Seydou T.');
      const dup = await request(app).post(api('/reports')).set(auth(ids.client))
        .send({ reportedId: ids.provider, reason: 'other' });
      expect(dup.status).toBe(409);

      const asAdminTarget = await request(app).post(api('/reports')).set(auth(ids.client)).send({ reportedId: ids.superAdmin, reason: 'other' });
      expect(asAdminTarget.status).toBe(404);

      const done = await request(app).patch(api(`/admin/reports/${ok.body.report.id}`)).set(auth(ids.support)).send({ status: 'dismissed' });
      expect(done.status).toBe(200);
      expect(await notifs(ids.client, 'report.updated')).toBeGreaterThanOrEqual(1);
    });
  });

  describe('notifications', () => {
    it('chacun ne lit et ne marque que les siennes', async () => {
      const list = await request(app).get(api('/notifications')).set(auth(ids.client));
      expect(list.status).toBe(200);
      expect(list.body.unreadCount).toBeGreaterThan(0);
      const one = list.body.data[0];
      expect(one.data.link).toMatch(/^\//);

      expect((await request(app).patch(api(`/notifications/${one.id}/read`)).set(auth(ids.client2))).status).toBe(404);
      expect((await request(app).patch(api(`/notifications/${one.id}/read`)).set(auth(ids.client))).status).toBe(200);
      expect((await request(app).patch(api('/notifications/read-all')).set(auth(ids.client))).status).toBe(200);
      const after = await request(app).get(api('/notifications')).set(auth(ids.client));
      expect(after.body.unreadCount).toBe(0);
    });
  });

  describe('pièce d\'identité (KYC)', () => {
    it('consultation réservée à la permission KYC et journalisée ; refus motivé obligatoire', async () => {
      expect((await request(app).get(api(`/admin/users/${ids.provider}/id-document`)).set(auth(ids.noPerm))).status).toBe(403);
      const res = await request(app).get(api(`/admin/users/${ids.provider}/id-document`)).set(auth(ids.kyc));
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.protectedDelivery).toBe(false); // ancien document public : à migrer (script)
      expect(await prisma.auditLog.count({ where: { action: 'admin.kyc.view_document', entityId: ids.provider, userId: ids.kyc } })).toBe(1);
      expect((await request(app).get(api(`/admin/users/${ids.client}/id-document`)).set(auth(ids.kyc))).status).toBe(404);

      const noReason = await request(app).post(api(`/admin/users/${ids.provider}/verify-id`)).set(auth(ids.kyc)).send({ approved: false });
      expect(noReason.status).toBe(422);
      const rejected = await request(app).post(api(`/admin/users/${ids.provider}/verify-id`)).set(auth(ids.kyc))
        .send({ approved: false, comment: 'Document illisible' });
      expect(rejected.status).toBe(200);
      expect(await notifs(ids.provider, 'kyc.rejected')).toBe(1);
    });
  });

  it('GET /site/config : uniquement des booléens de capacité', async () => {
    const res = await request(app).get(api('/site/config'));
    expect(res.status).toBe(200);
    expect(res.body.onlinePayment).toEqual(expect.objectContaining({ available: expect.any(Boolean), simulated: expect.any(Boolean) }));
    expect(JSON.stringify(res.body)).not.toMatch(/key|secret|site_id/i);
  });
});

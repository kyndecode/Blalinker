const prismaMock = {
  user: { count: jest.fn() },
  booking: { count: jest.fn() },
  review: { aggregate: jest.fn(), findMany: jest.fn() },
};
const redisMock = { get: jest.fn(), setex: jest.fn() };

jest.mock('../../src/config/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/config/redis', () => ({ redis: redisMock }));

import type { Request, Response } from 'express';
import {
  PUBLIC_STATS_THRESHOLDS,
  computePublicStats,
  computeTestimonials,
  shortName,
  siteController,
} from '../../src/modules/site/site.controller';

function mockCounts(providers: number, missions: number, reviews: number, avg: number | null) {
  prismaMock.user.count.mockResolvedValue(providers);
  prismaMock.booking.count.mockResolvedValue(missions);
  prismaMock.review.aggregate.mockResolvedValue({ _avg: { rating: avg }, _count: { _all: reviews } });
}

function mockRes() {
  const res = { statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string> };
  return Object.assign(res, {
    status(code: number) { res.statusCode = code; return this; },
    json(body: unknown) { res.body = body; return this; },
    set(k: string, v: string) { res.headers[k] = v; return this; },
  }) as unknown as Response & typeof res;
}

beforeEach(() => jest.clearAllMocks());

describe('indicateurs publics : uniquement réels, masqués sous le seuil', () => {
  it('aucune donnée suffisante → liste vide (la section est masquée)', async () => {
    mockCounts(3, 2, 1, 5);
    await expect(computePublicStats()).resolves.toEqual([]);
  });

  it('chaque indicateur apparaît dès son seuil atteint, avec la valeur exacte de la base', async () => {
    mockCounts(PUBLIC_STATS_THRESHOLDS.verifiedProviders, 57, PUBLIC_STATS_THRESHOLDS.ratedReviews, 4.6666);
    await expect(computePublicStats()).resolves.toEqual([
      { key: 'verified_providers', value: 10 },
      { key: 'completed_missions', value: 57 },
      { key: 'average_rating', value: 4.7, count: 5 },
    ]);
  });

  it('ne compte que les prestataires actifs, non supprimés et à identité vérifiée', async () => {
    mockCounts(0, 0, 0, null);
    await computePublicStats();
    expect(prismaMock.user.count).toHaveBeenCalledWith({
      where: { role: 'provider', status: 'active', deletedAt: null, profile: { is: { idVerified: true } } },
    });
    expect(prismaMock.booking.count).toHaveBeenCalledWith({ where: { status: { in: ['completed', 'validated'] } } });
    expect(prismaMock.review.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { isApproved: true } }));
  });
});

describe('témoignages : avis réels approuvés uniquement', () => {
  it('filtre les avis approuvés, non signalés, notés 4+ et de comptes actifs', async () => {
    prismaMock.review.findMany.mockResolvedValue([]);
    await computeTestimonials();
    expect(prismaMock.review.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        isApproved: true,
        isFlagged: false,
        rating: { gte: 4 },
        reviewer: { status: 'active', deletedAt: null },
      }),
    }));
  });

  it('garde au plus 3 avis assez détaillés ; nom abrégé, pas de nom complet', async () => {
    const row = (id: string, comment: string) => ({
      id, rating: 5, comment, createdAt: new Date('2026-11-01'),
      reviewer: { profile: { firstName: 'Aïcha', lastName: 'Traoré', city: 'Bamako' } },
    });
    prismaMock.review.findMany.mockResolvedValue([
      row('court', 'Bien.'),
      row('a', 'Travail rapide et très soigné, je recommande.'),
      row('b', 'Ponctuel, aimable et efficace. Merci beaucoup !'),
      row('c', 'Excellent prestataire, prix conforme au devis annoncé.'),
      row('d', 'Encore un avis détaillé qui ne sera pas affiché.'),
    ]);
    const items = await computeTestimonials();
    expect(items.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(items[0]).toMatchObject({ authorName: 'Aïcha T.', city: 'Bamako', rating: 5 });
    expect(JSON.stringify(items)).not.toContain('Traoré');
  });

  it('shortName', () => {
    expect(shortName('Awa', 'Ndiaye')).toBe('Awa N.');
    expect(shortName('Awa', '')).toBe('Awa');
    expect(shortName('', 'Ndiaye')).toBe('Client vérifié');
  });
});

describe('cache Redis : jamais bloquant', () => {
  it('Redis indisponible → calcul direct, réponse 200', async () => {
    redisMock.get.mockRejectedValue(new Error('down'));
    redisMock.setex.mockRejectedValue(new Error('down'));
    mockCounts(0, 0, 0, null);
    const res = mockRes();
    await siteController.stats({} as Request, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });

  it('valeur en cache → aucune requête en base', async () => {
    redisMock.get.mockResolvedValue(JSON.stringify([{ key: 'completed_missions', value: 12 }]));
    const res = mockRes();
    await siteController.stats({} as Request, res);
    expect(res.body).toEqual({ items: [{ key: 'completed_missions', value: 12 }] });
    expect(prismaMock.booking.count).not.toHaveBeenCalled();
  });

  it('base indisponible → 503 sans chiffre inventé', async () => {
    redisMock.get.mockResolvedValue(null);
    prismaMock.user.count.mockRejectedValue(new Error('db down'));
    prismaMock.booking.count.mockResolvedValue(0);
    prismaMock.review.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } });
    const res = mockRes();
    await siteController.stats({} as Request, res);
    expect(res.statusCode).toBe(503);
  });
});

describe('GET /site/health : état vérifiable de l’extérieur', () => {
  it('indique si le stockage de fichiers (Cloudinary) est configuré, sans exposer de valeur', async () => {
    Object.assign(prismaMock, { $queryRaw: jest.fn().mockResolvedValue([1]) });
    Object.assign(redisMock, { ping: jest.fn().mockResolvedValue('PONG') });
    const res = mockRes();
    await siteController.health({} as Request, res);
    expect(res.statusCode).toBe(200);
    const expected = Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
    expect(res.body).toEqual({ status: 'ok', checks: { database: true, cache: true, storage: expected } });
    // Uniquement des booléens : aucune valeur de configuration n'est renvoyée.
    expect(Object.values((res.body as { checks: Record<string, unknown> }).checks).every((v) => typeof v === 'boolean')).toBe(true);
  });
});

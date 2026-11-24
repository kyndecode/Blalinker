/**
 * Lot 4 — recherche tolérante aux fautes, suggestions et recommandations sur un VRAI
 * PostgreSQL (extension pg_trgm installée par la migration initiale).
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

import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

if (url && /supabase\.co|supabase\.com|pooler\.supabase|onrender\.com/i.test(url)) {
  throw new Error('TEST_DATABASE_URL pointe vers un hébergeur distant : refusé (base locale jetable uniquement).');
}

const RUN = `s${Date.now().toString(36)}`;
const HASH = `$2b$12$SEARCHHASH${RUN}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`;

describeDb('PostgreSQL réel — recherche intelligente (lot 4)', () => {
  let app: Express;
  let prisma: PrismaClient;
  const ids: Record<string, string> = {};
  const api = (path: string) => `/api/v1${path}`;
  const providerIds = (res: request.Response) => res.body.data.map((i: { provider: { id: string } }) => i.provider.id);

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    jest.resetModules();
    ({ app } = await import('../../src/app'));
    ({ prisma } = await import('../../src/config/database'));

    const cat = async (key: string, name: string, slug: string, parentId?: string) => {
      ids[key] = (await prisma.category.create({ data: { name, slug: `${slug}-${RUN}`, parentId } })).id;
    };
    await cat('plomberie', 'Plomberie', 'plomberie');
    await cat('sanitaire', 'Sanitaire', 'sanitaire', ids.plomberie);
    await cat('electricite', 'Électricité', 'electricite');
    await cat('beaute', 'Beauté', 'beaute');

    const provider = async (key: string, city: string, lat: number, lng: number, services: Array<[string, string, number]>, status: 'active' | 'suspended' = 'active') => {
      ids[key] = (await prisma.user.create({
        data: {
          email: `${key}-${RUN}@example.test`, phone: `+999${Math.floor(Math.random() * 1e8)}`, passwordHash: HASH, role: 'provider', status,
          profile: { create: { firstName: key, lastName: 'Test', city, latitude: lat, longitude: lng, address: `Adresse privée ${RUN}` } },
          providerProfile: { create: { businessName: `${key} services`, ratingAverage: 4, isAvailable: true } },
          services: { create: services.map(([title, catKey, price]) => ({ title, categoryId: ids[catKey], price })) },
        },
        select: { id: true },
      })).id;
    };
    await provider('plombierA', 'Abidjan', 5.35, -4.0, [['Plomberie sanitaire', 'plomberie', 15000]]);
    await provider('plombierB', 'Abidjan', 5.36, -4.01, [['Réparation de fuites', 'sanitaire', 12000]]);
    await provider('electricien', 'Dakar', 14.7, -17.45, [['Électricité bâtiment', 'electricite', 20000]]);
    await provider('coiffeuse', 'Thiès', 14.79, -16.93, [['Coiffure à domicile', 'beaute', 5000]]);
    await provider('suspendu', 'Abidjan', 5.35, -4.0, [['Plomberie express', 'plomberie', 9000]], 'suspended');
  });

  afterAll(async () => {
    if (!prisma) return;
    const users = ['plombierA', 'plombierB', 'electricien', 'coiffeuse', 'suspendu'].map((k) => ids[k]).filter(Boolean);
    await prisma.providerService.deleteMany({ where: { providerId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.category.deleteMany({ where: { slug: { endsWith: RUN } } });
    await prisma.$disconnect();
  });

  it('faute de frappe et accents : « plombrie », « electricite » trouvés', async () => {
    const typo = await request(app).get(api('/search?q=plombrie'));
    expect(typo.status).toBe(200);
    expect(providerIds(typo)).toEqual(expect.arrayContaining([ids.plombierA]));
    const accents = await request(app).get(api('/search?q=electricite'));
    expect(providerIds(accents)).toContain(ids.electricien);
    const partial = await request(app).get(api('/search?q=coif'));
    expect(providerIds(partial)).toContain(ids.coiffeuse);
  });

  it('jamais de prestataire suspendu ni de donnée de contact', async () => {
    const res = await request(app).get(api('/search?q=plomberie'));
    expect(providerIds(res)).not.toContain(ids.suspendu);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/@example\.test|\+999|Adresse privée|passwordHash|\$2b\$/);
    // Position arrondie (~1 km)
    const item = res.body.data.find((i: { provider: { id: string } }) => i.provider.id === ids.plombierA);
    expect(item.provider.latitude).toBe(5.35);
  });

  it('catégorie (avec sous-catégories) et ville tolérante', async () => {
    const byCat = await request(app).get(api(`/search?category=plomberie-${RUN}`));
    expect(providerIds(byCat)).toEqual(expect.arrayContaining([ids.plombierA, ids.plombierB]));
    expect(providerIds(byCat)).not.toContain(ids.electricien);
    const byCity = await request(app).get(api('/search?city=abidjn'));
    const found = providerIds(byCity);
    expect(found).toEqual(expect.arrayContaining([ids.plombierA, ids.plombierB]));
    expect(found).not.toContain(ids.electricien);
  });

  it('rayon géographique et tri par distance', async () => {
    const res = await request(app).get(api('/search?lat=5.35&lng=-4.0&radiusKm=10&sort=distance'));
    const found = providerIds(res);
    expect(found).toEqual(expect.arrayContaining([ids.plombierA, ids.plombierB]));
    expect(found).not.toContain(ids.electricien);
    const ours = res.body.data.filter((i: { provider: { id: string } }) => [ids.plombierA, ids.plombierB].includes(i.provider.id));
    expect(ours[0].distanceKm).toBeLessThanOrEqual(ours[1].distanceKm);
  });

  it('validation : lat sans lng, tri inconnu → 422 ; recherche sans résultat → liste vide', async () => {
    expect((await request(app).get(api('/search?lat=5'))).status).toBe(422);
    expect((await request(app).get(api('/search?sort=prix'))).status).toBe(422);
    const none = await request(app).get(api('/search?q=zzqxwvkj'));
    expect(none.status).toBe(200);
    expect(none.body.data).toEqual([]);
    expect(none.body).toHaveProperty('didYouMean');
  });

  it('suggestions : catégories, services, villes ; 2 caractères minimum', async () => {
    const res = await request(app).get(api('/search/suggest?q=plomb'));
    expect(res.status).toBe(200);
    expect(res.body.categories.map((c: { name: string }) => c.name)).toContain('Plomberie');
    expect(res.body.services.map((s: { title: string }) => s.title)).toContain('Plomberie sanitaire');
    const cities = await request(app).get(api('/search/suggest?q=abidj'));
    expect(cities.body.cities.map((c: { city: string }) => c.city)).toContain('Abidjan');
    expect(JSON.stringify(cities.body)).not.toMatch(/@example\.test|\+999/);
    expect((await request(app).get(api('/search/suggest?q=a'))).status).toBe(422);
  });

  it('recommandations : même catégorie, même ville en premier, jamais lui-même ni un compte suspendu', async () => {
    const res = await request(app).get(api(`/providers/${ids.plombierA}/similar`));
    expect(res.status).toBe(200);
    const recos = res.body.items.map((i: { id: string }) => i.id);
    expect(recos).not.toContain(ids.plombierA);
    expect(recos).not.toContain(ids.suspendu);
    expect(recos).not.toContain(ids.coiffeuse);
    expect(JSON.stringify(res.body)).not.toMatch(/@example\.test|\+999|Adresse privée/);
    expect((await request(app).get(api('/providers/pas-un-id/similar'))).status).toBe(404);
  });
});

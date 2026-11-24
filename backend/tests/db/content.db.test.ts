/**
 * Lot 2 — contenus administrables sur un VRAI PostgreSQL (migrations appliquées) :
 * pages, FAQ, annonces, paramètres, pays, médias, catégories. Vérifie les permissions,
 * la validation serveur, la publication (brouillon invisible) et la journalisation.
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

const RUN = `c${Date.now().toString(36)}`;
const HASH = `$2b$12$CONTENTHASH${RUN}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`;
// Codes pays fictifs (« X? » réservés à l'usage privé par l'ISO 3166) : aucun marché réel présupposé.
const CC = `X${String.fromCharCode(65 + (Date.now() % 26))}`;

describeDb('PostgreSQL réel — contenus administrables (lot 2)', () => {
  let app: Express;
  let prisma: PrismaClient;
  const ids = { editor: '', settings: '', support: '', superAdmin: '' };
  const auth = (userId: string) => ({ Authorization: `Bearer uid:${userId}` });
  const api = (path: string) => `/api/v1${path}`;
  const slug = `page-${RUN}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    jest.resetModules();
    ({ app } = await import('../../src/app'));
    ({ prisma } = await import('../../src/config/database'));
    const mk = (email: string, role: 'admin' | 'super_admin', permissions: string[] = []) =>
      prisma.user.create({ data: { email, passwordHash: HASH, role, status: 'active', permissions }, select: { id: true } }).then((u) => u.id);
    ids.editor = await mk(`edit-${RUN}@example.test`, 'admin', ['content.manage']);
    ids.settings = await mk(`set-${RUN}@example.test`, 'admin', ['settings.manage']);
    ids.support = await mk(`sup-${RUN}@example.test`, 'admin', ['contacts.handle']);
    ids.superAdmin = await mk(`sa-${RUN}@example.test`, 'super_admin');
  });

  afterAll(async () => {
    if (!prisma) return;
    const users = Object.values(ids).filter(Boolean);
    await prisma.contentPage.deleteMany({ where: { slug: { startsWith: 'page-c' } } });
    await prisma.faqItem.deleteMany({ where: { question: { contains: RUN } } });
    await prisma.announcement.deleteMany({ where: { message: { contains: RUN } } });
    await prisma.siteSetting.deleteMany({ where: { updatedById: { in: users } } });
    await prisma.country.deleteMany({ where: { code: CC } });
    await prisma.category.deleteMany({ where: { slug: { contains: RUN } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it('permissions : contenu → content.manage ; paramètres et pays → settings.manage', async () => {
    expect((await request(app).get(api('/admin/content/pages')).set(auth(ids.support))).status).toBe(403);
    expect((await request(app).get(api('/admin/content/pages')).set(auth(ids.settings))).status).toBe(403);
    expect((await request(app).get(api('/admin/content/pages')).set(auth(ids.editor))).status).toBe(200);
    expect((await request(app).get(api('/admin/settings')).set(auth(ids.editor))).status).toBe(403);
    expect((await request(app).get(api('/admin/countries')).set(auth(ids.editor))).status).toBe(403);
    expect((await request(app).get(api('/admin/settings')).set(auth(ids.settings))).status).toBe(200);
    expect((await request(app).get(api('/admin/content/faq'))).status).toBe(401);
  });

  describe('pages', () => {
    let pageId = '';

    it('brouillon invisible sur le site, publication visible sans recompilation', async () => {
      const created = await request(app).post(api('/admin/content/pages')).set(auth(ids.editor))
        .send({ slug, title: 'Mentions de test', body: '## Éditeur\n\nBLA Services, texte **publié**.' });
      expect(created.status).toBe(201);
      expect(created.body.status).toBe('draft');
      pageId = created.body.id;

      expect((await request(app).get(api(`/site/pages/${slug}?locale=fr`))).status).toBe(404);

      const published = await request(app).put(api(`/admin/content/pages/${pageId}`)).set(auth(ids.editor)).send({ status: 'published' });
      expect(published.status).toBe(200);
      expect(published.body.publishedAt).not.toBeNull();

      const pub = await request(app).get(api(`/site/pages/${slug}?locale=fr`));
      expect(pub.status).toBe(200);
      expect(pub.body).toMatchObject({ slug, title: 'Mentions de test', locale: 'fr' });
      expect(pub.body).not.toHaveProperty('updatedById');
      expect(pub.body).not.toHaveProperty('status');
      expect((await request(app).get(api(`/site/pages/${slug}?locale=en`))).status).toBe(404);
    });

    it('validation : doublon slug+langue 409, champ inconnu 422, slug invalide 422', async () => {
      const dup = await request(app).post(api('/admin/content/pages')).set(auth(ids.editor)).send({ slug, title: 'Doublon', body: 'x' });
      expect(dup.status).toBe(409);
      const extra = await request(app).put(api(`/admin/content/pages/${pageId}`)).set(auth(ids.editor)).send({ updatedById: ids.support });
      expect(extra.status).toBe(422);
      const badSlug = await request(app).post(api('/admin/content/pages')).set(auth(ids.editor)).send({ slug: '../etc', title: 'Titre', body: 'x' });
      expect(badSlug.status).toBe(422);
      const badLocale = await request(app).post(api('/admin/content/pages')).set(auth(ids.editor)).send({ slug: `${slug}-b`, locale: 'de', title: 'Titre', body: 'x' });
      expect(badLocale.status).toBe(422);
    });

    it('dépublication puis suppression : contenu conservé dans le journal d’audit', async () => {
      await request(app).put(api(`/admin/content/pages/${pageId}`)).set(auth(ids.editor)).send({ status: 'unpublished' });
      expect((await request(app).get(api(`/site/pages/${slug}`))).status).toBe(404);
      const del = await request(app).delete(api(`/admin/content/pages/${pageId}`)).set(auth(ids.editor));
      expect(del.status).toBe(200);
      const audit = await prisma.auditLog.findFirst({ where: { action: 'admin.content.page.delete', entityId: pageId } });
      expect((audit?.oldData as { body?: string })?.body).toContain('texte **publié**');
      expect((await request(app).delete(api(`/admin/content/pages/${pageId}`)).set(auth(ids.editor))).status).toBe(404);
    });
  });

  it('FAQ : seules les questions publiées de la langue demandée sont servies', async () => {
    const mk = (body: object) => request(app).post(api('/admin/content/faq')).set(auth(ids.editor)).send(body);
    expect((await mk({ question: `Question publiée ${RUN} ?`, answer: 'Réponse', status: 'published', sortOrder: 2 })).status).toBe(201);
    expect((await mk({ question: `Brouillon ${RUN} ?`, answer: 'Réponse', status: 'draft' })).status).toBe(201);
    expect((await mk({ locale: 'en', question: `English ${RUN} ?`, answer: 'Answer', status: 'published' })).status).toBe(201);
    expect((await mk({ question: 'Non', answer: '' })).status).toBe(422);

    const fr = await request(app).get(api('/site/faq?locale=fr'));
    const questions = fr.body.items.map((i: { question: string }) => i.question);
    expect(questions).toContain(`Question publiée ${RUN} ?`);
    expect(questions).not.toContain(`Brouillon ${RUN} ?`);
    expect(questions).not.toContain(`English ${RUN} ?`);
  });

  describe('annonces', () => {
    const mk = (body: object) => request(app).post(api('/admin/content/announcements')).set(auth(ids.editor)).send(body);

    it('validation : lien dangereux et fenêtre incohérente refusés', async () => {
      expect((await mk({ message: `Lien ${RUN}`, linkUrl: 'javascript:alert(1)' })).status).toBe(422);
      expect((await mk({ message: `Lien ${RUN}`, linkUrl: '//evil.example' })).status).toBe(422);
      expect((await mk({ message: `Fenêtre ${RUN}`, startsAt: '2027-01-02T00:00:00.000Z', endsAt: '2027-01-01T00:00:00.000Z' })).status).toBe(422);
    });

    it('diffusion : publiée, dans sa fenêtre, langue et pays correspondants', async () => {
      const day = 24 * 3600_000;
      expect((await mk({ message: `Active ${RUN}`, status: 'published', linkUrl: '/help' })).status).toBe(201);
      expect((await mk({ message: `Expirée ${RUN}`, status: 'published', endsAt: new Date(Date.now() - day).toISOString() })).status).toBe(201);
      expect((await mk({ message: `Future ${RUN}`, status: 'published', startsAt: new Date(Date.now() + day).toISOString() })).status).toBe(201);
      expect((await mk({ message: `Brouillon ${RUN}`, status: 'draft' })).status).toBe(201);
      expect((await mk({ message: `Pays ${RUN}`, status: 'published', countryCode: CC })).status).toBe(201);

      const plain = (await request(app).get(api('/site/announcements?locale=fr'))).body.items.map((a: { message: string }) => a.message);
      expect(plain).toContain(`Active ${RUN}`);
      for (const hidden of ['Expirée', 'Future', 'Brouillon', 'Pays']) expect(plain).not.toContain(`${hidden} ${RUN}`);
      const local = (await request(app).get(api(`/site/announcements?locale=fr&country=${CC}`))).body.items.map((a: { message: string }) => a.message);
      expect(local).toContain(`Pays ${RUN}`);
    });
  });

  describe('paramètres et pays', () => {
    it('clé inconnue ou valeur invalide refusées ; valeur globale publiée', async () => {
      const put = (body: object) => request(app).put(api('/admin/settings')).set(auth(ids.settings)).send(body);
      expect((await put({ key: 'admin.password', value: 'x' })).status).toBe(422);
      expect((await put({ key: 'contact.email', value: 'pas-un-email' })).status).toBe(422);
      expect((await put({ key: 'social.facebook', value: 'http://facebook.com/x' })).status).toBe(422);
      expect((await put({ key: 'home.heroTitle', value: { de: 'Hallo' } })).status).toBe(422);
      const ok = await put({ key: 'contact.email', value: 'Contact@BlaLinker.com' });
      expect(ok.status).toBe(200);
      expect(ok.body.value).toBe('contact@blalinker.com');

      const pub = await request(app).get(api('/site/settings'));
      expect(pub.body.values['contact.email']).toBe('contact@blalinker.com');
      const audit = await prisma.auditLog.findFirst({ where: { action: 'admin.settings.upsert', userId: ids.settings } });
      expect(audit).not.toBeNull();
    });

    it('valeur propre à un pays : pays obligatoire, surcharge la valeur globale', async () => {
      const put = (body: object) => request(app).put(api('/admin/settings')).set(auth(ids.settings)).send(body);
      expect((await put({ key: 'contact.phone', scope: CC, value: '+000 11 22 33' })).status).toBe(422); // pays inconnu
      const country = await request(app).post(api('/admin/countries')).set(auth(ids.settings))
        .send({ code: CC, name: `Pays test ${RUN}`, dialCode: '+999', currency: 'xof', isActive: false });
      expect(country.status).toBe(201);
      expect(country.body.currency).toBe('XOF');
      expect((await request(app).post(api('/admin/countries')).set(auth(ids.settings)).send({ code: CC, name: 'Doublon', dialCode: '+999', currency: 'XOF' })).status).toBe(409);

      await put({ key: 'contact.phone', value: '+111 00 00 00' });
      expect((await put({ key: 'contact.phone', scope: CC, value: '+999 12 34 56' })).status).toBe(200);
      expect((await request(app).get(api('/site/settings'))).body.values['contact.phone']).toBe('+111 00 00 00');
      expect((await request(app).get(api(`/site/settings?country=${CC}`))).body.values['contact.phone']).toBe('+999 12 34 56');

      // Pays inactif : absent de la liste publique ; activé : présent.
      expect((await request(app).get(api('/site/countries'))).body.items.map((c: { code: string }) => c.code)).not.toContain(CC);
      await request(app).put(api(`/admin/countries/${CC}`)).set(auth(ids.settings)).send({ isActive: true });
      expect((await request(app).get(api('/site/countries'))).body.items.map((c: { code: string }) => c.code)).toContain(CC);

      // Pays utilisé (paramètre, annonce) : suppression refusée.
      const del = await request(app).delete(api(`/admin/countries/${CC}`)).set(auth(ids.settings));
      expect(del.status).toBe(409);
      expect(del.body.usage.settings).toBeGreaterThan(0);

      // Retour à la valeur par défaut.
      expect((await request(app).delete(api(`/admin/settings/contact.phone?scope=${CC}`)).set(auth(ids.settings))).status).toBe(200);
      expect((await request(app).get(api(`/site/settings?country=${CC}`))).body.values['contact.phone']).toBe('+111 00 00 00');
    });
  });

  it('médiathèque : stockage non configuré → 503 explicite ; liste vide', async () => {
    const res = await request(app).post(api('/admin/media')).set(auth(ids.editor)).attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('STORAGE_UNAVAILABLE');
    expect((await request(app).get(api('/admin/media')).set(auth(ids.editor))).status).toBe(200);
  });

  it('catégories : suppression refusée si utilisée, acceptée et journalisée sinon', async () => {
    const parent = await request(app).post(api('/admin/categories')).set(auth(ids.superAdmin)).send({ name: 'Parent test', slug: `parent-${RUN}` });
    expect(parent.status).toBe(201);
    const child = await request(app).post(api('/admin/categories')).set(auth(ids.superAdmin)).send({ name: 'Enfant test', slug: `enfant-${RUN}`, parentId: parent.body.id });
    expect(child.status).toBe(201);
    const blocked = await request(app).delete(api(`/admin/categories/${parent.body.id}`)).set(auth(ids.superAdmin));
    expect(blocked.status).toBe(409);
    expect(blocked.body.usage.children).toBe(1);
    expect((await request(app).delete(api(`/admin/categories/${child.body.id}`)).set(auth(ids.superAdmin))).status).toBe(200);
    expect((await request(app).delete(api(`/admin/categories/${parent.body.id}`)).set(auth(ids.superAdmin))).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'admin.category.delete', userId: ids.superAdmin } })).toBe(2);
  });
});

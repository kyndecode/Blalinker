/**
 * Parcours RÉELS d'authentification et de données, de bout en bout, sur PostgreSQL :
 * vrais jetons JWT (clés générées pour le test), Redis en mémoire, e-mail simulé qui
 * capture le code (aucun envoi réel). Utilise le jeu de diagnostic (3 lignes max par table).
 *
 * Ignoré sans TEST_DATABASE_URL ; refuse toute base distante (base locale jetable uniquement).
 */
import { generateKeyPairSync } from 'node:crypto';

const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
process.env.JWT_PRIVATE_KEY = keys.privateKey;
process.env.JWT_PUBLIC_KEY = keys.publicKey;

jest.mock('prom-client', () => {
  class Registry {
    contentType = 'text/plain';
    setDefaultLabels() { /* noop */ }
    metrics() { return Promise.resolve(''); }
  }
  return { Registry, collectDefaultMetrics: jest.fn() };
});

// Redis en mémoire (codes temporaires, délai entre deux codes, révocation des jetons).
jest.mock('../../src/config/redis', () => {
  const store = new Map<string, { value: string; expiresAt: number }>();
  const alive = (k: string) => {
    const e = store.get(k);
    if (!e) return undefined;
    if (e.expiresAt && e.expiresAt < Date.now()) { store.delete(k); return undefined; }
    return e;
  };
  const redis = {
    status: 'ready',
    on: jest.fn(),
    ping: jest.fn(async () => 'PONG'),
    get: jest.fn(async (k: string) => alive(k)?.value ?? null),
    set: jest.fn(async (k: string, v: string, ...args: unknown[]) => {
      const exIndex = args.findIndex((a) => String(a).toUpperCase() === 'EX');
      const nx = args.some((a) => String(a).toUpperCase() === 'NX');
      if (nx && alive(k)) return null;
      store.set(k, { value: String(v), expiresAt: exIndex >= 0 ? Date.now() + Number(args[exIndex + 1]) * 1000 : 0 });
      return 'OK';
    }),
    setex: jest.fn(async (k: string, ttl: number, v: string) => { store.set(k, { value: String(v), expiresAt: Date.now() + ttl * 1000 }); return 'OK'; }),
    del: jest.fn(async (...k: string[]) => { k.flat().forEach((x) => store.delete(x)); return 1; }),
    ttl: jest.fn(async (k: string) => { const e = alive(k); return e ? (e.expiresAt ? Math.ceil((e.expiresAt - Date.now()) / 1000) : -1) : -2; }),
    exists: jest.fn(async (k: string) => (alive(k) ? 1 : 0)),
    incr: jest.fn(async (k: string) => { const n = Number(alive(k)?.value ?? 0) + 1; store.set(k, { value: String(n), expiresAt: alive(k)?.expiresAt ?? 0 }); return n; }),
    expire: jest.fn(async (k: string, ttl: number) => { const e = alive(k); if (e) e.expiresAt = Date.now() + ttl * 1000; return 1; }),
  };
  return { redis };
});

// E-mail simulé : on capture le code envoyé ; `failNext` simule une panne Brevo.
const mailbox: Array<{ to: string; html: string }> = [];
let failNext = false;
jest.mock('../../src/config/email', () => {
  const actual = jest.requireActual('../../src/config/email');
  return {
    ...actual,
    sendEmail: jest.fn(async (payload: { to: string; html: string }) => {
      if (failNext) { failNext = false; return false; }
      mailbox.push({ to: payload.to, html: payload.html });
      return true;
    }),
  };
});

import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createDiagnosticDataset, removeDiagnosticDataset, assertLocalDatabase, DIAG_DOMAIN, type DiagnosticIds } from '../../scripts/diagnostic-dataset';

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

if (url && /supabase\.co|supabase\.com|pooler\.supabase|onrender\.com/i.test(url)) {
  throw new Error('TEST_DATABASE_URL pointe vers un hébergeur distant : refusé (base locale jetable uniquement).');
}

const RUN = `a${Date.now().toString(36)}`;
const PASSWORD = 'Diag-Mot2Passe-Local';
const lastCode = (to: string) => {
  const mail = [...mailbox].reverse().find((m) => m.to === to);
  return mail ? /\b(\d{6})\b/.exec(mail.html.replace(/<[^>]+>/g, ' '))?.[1] : undefined;
};

describeDb('PostgreSQL réel — authentification et données de bout en bout', () => {
  let app: Express;
  let prisma: PrismaClient;
  let ids: DiagnosticIds;
  let adminId = '';
  const api = (p: string) => `/api/v1${p}`;
  const clientEmail = `client${RUN}@${DIAG_DOMAIN}`;
  const providerBEmail = `prestataire-b${RUN}@${DIAG_DOMAIN}`;
  const adminEmail = `admin${RUN}@${DIAG_DOMAIN}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    jest.resetModules();
    ({ app } = await import('../../src/app'));
    ({ prisma } = await import('../../src/config/database'));
    const hash = await bcrypt.hash(PASSWORD, 10);
    ids = await createDiagnosticDataset(prisma, hash, RUN);
    adminId = (await prisma.user.create({
      data: { email: adminEmail, passwordHash: hash, role: 'super_admin', status: 'active', mfaEnabled: true },
      select: { id: true },
    })).id;
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    await removeDiagnosticDataset(prisma, RUN);
    if (adminId) {
      await prisma.auditLog.deleteMany({ where: { userId: adminId } });
      await prisma.otpCode.deleteMany({ where: { userId: adminId } });
      await prisma.userSession.deleteMany({ where: { userId: adminId } });
      await prisma.user.deleteMany({ where: { id: adminId } });
    }
    await prisma.$disconnect();
  }, 60_000);

  it('jeu de diagnostic : refusé sur une base distante, 3 lignes max par table', async () => {
    expect(() => assertLocalDatabase('postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:5432/postgres')).toThrow();
    expect(() => assertLocalDatabase('postgresql://u:p@db.example.com:5432/x')).toThrow();
    expect(() => assertLocalDatabase('postgresql://u:p@localhost:54329/x')).not.toThrow();
    expect(ids.categories).toHaveLength(3);
    expect(ids.services).toHaveLength(3);
  });

  it('données visibles sur le site public : catégories, recherche, fiche prestataire (sans donnée de contact)', async () => {
    const cats = await request(app).get(api('/categories'));
    expect(cats.body.map((c: { slug: string }) => c.slug)).toEqual(expect.arrayContaining([`diag-plomberie-${RUN}`]));
    const search = await request(app).get(api(`/search?category=diag-plomberie-${RUN}`));
    expect(search.status).toBe(200);
    expect(search.body.data.map((s: { provider: { id: string } }) => s.provider.id)).toContain(ids.providerA);
    const profile = await request(app).get(api(`/providers/${ids.providerA}`));
    expect(profile.status).toBe(200);
    expect(JSON.stringify(profile.body)).not.toMatch(/@diagnostic\.invalid|passwordHash/);
    const reviews = await request(app).get(api(`/providers/${ids.providerA}/reviews`));
    expect(reviews.body.data).toHaveLength(1);
  });

  describe('client : mot de passe + code e-mail', () => {
    let refreshToken = '';
    let accessToken = '';

    it('connexion : UN seul code envoyé même si l’utilisateur reclique, code reçu accepté', async () => {
      const first = await request(app).post(api('/auth/login')).send({ email: clientEmail, password: PASSWORD });
      expect(first.status).toBe(200);
      expect(first.body.mfaRequired).toBe(true);
      const code = lastCode(clientEmail);
      expect(code).toMatch(/^\d{6}$/);

      // Deuxième clic dans les 45 s : pas de nouveau code (avant : un nouveau code invalidait le premier).
      const second = await request(app).post(api('/auth/login')).send({ email: clientEmail, password: PASSWORD });
      expect(second.status).toBe(200);
      expect(mailbox.filter((m) => m.to === clientEmail)).toHaveLength(1);
      expect(await prisma.otpCode.count({ where: { userId: ids.client, purpose: 'login', usedAt: null, expiresAt: { gt: new Date() } } })).toBe(1);

      const wrong = await request(app).post(api('/auth/login/verify-mfa')).send({ tempToken: second.body.tempToken, otpCode: '000000' });
      expect(wrong.status).toBe(422);

      const ok = await request(app).post(api('/auth/login/verify-mfa')).send({ tempToken: second.body.tempToken, otpCode: code });
      expect(ok.status).toBe(200);
      expect(ok.body.user.role).toBe('client');
      accessToken = ok.body.accessToken;
      refreshToken = ok.body.refreshToken;
      expect(accessToken).toBeTruthy();
      expect(refreshToken).toBeTruthy();

      const audit = await prisma.auditLog.findFirst({ where: { userId: ids.client, action: 'auth.login.success' }, orderBy: { createdAt: 'desc' } });
      expect((audit?.newData as { method?: string })?.method).toBe('mfa_email');
    });

    it('accès à son compte, refusé à l’administration', async () => {
      const me = await request(app).get(api('/users/me')).set('Authorization', `Bearer ${accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body).not.toHaveProperty('permissions');
      expect((await request(app).get(api('/admin/dashboard')).set('Authorization', `Bearer ${accessToken}`)).status).toBe(403);
    });

    it('renouvellement : rotation ; requête concurrente avec l’ancien jeton → 409 (plus de déconnexion générale)', async () => {
      const r1 = await request(app).post(api('/auth/refresh-token')).send({ refreshToken });
      expect(r1.status).toBe(200);
      const race = await request(app).post(api('/auth/refresh-token')).send({ refreshToken });
      expect(race.status).toBe(409);
      // La nouvelle session reste valable (avant : toutes les sessions étaient fermées).
      const r2 = await request(app).post(api('/auth/refresh-token')).send({ refreshToken: r1.body.refreshToken });
      expect(r2.status).toBe(200);
      accessToken = r2.body.accessToken;
      refreshToken = r2.body.refreshToken;
    });

    // Seconde session (autre appareil) sans repasser par un code e-mail (délai entre deux codes).
    const newSession = async () => {
      const { AuthService } = await import('../../src/modules/auth/auth.service');
      const svc = new AuthService() as unknown as {
        _generateTokens: (id: string, role: string, ctx: { method: string; ip?: string; silent?: boolean }) => Promise<{ accessToken: string; refreshToken: string }>;
      };
      return svc._generateTokens(ids.client, 'client', { method: 'password', ip: '10.0.0.2', silent: true });
    };
    const sessionIdOf = (refresh: string) => (JSON.parse(Buffer.from(refresh.split('.')[1], 'base64url').toString()) as { sessionId: string }).sessionId;

    it('déconnexion : session fermée, ancien jeton d’accès refusé, autres appareils intacts', async () => {
      const other = await newSession();
      const out = await request(app).post(api('/auth/logout')).set('Authorization', `Bearer ${accessToken}`).send({ refreshToken });
      expect(out.status).toBe(200);
      expect(out.body.sessionsClosed).toBe(1);
      // L'ancien jeton d'accès ne permet plus d'utiliser l'API.
      expect((await request(app).get(api('/users/me')).set('Authorization', `Bearer ${accessToken}`)).status).toBe(401);
      // Son jeton de renouvellement est refusé, simplement (pas de fermeture de tous les appareils).
      const after = await request(app).post(api('/auth/refresh-token')).send({ refreshToken });
      expect(after.status).toBe(401);
      expect(after.body.code).toBe('SESSION_CLOSED');
      const stillOk = await request(app).post(api('/auth/refresh-token')).send({ refreshToken: other.refreshToken });
      expect(stillOk.status).toBe(200);
      await request(app).post(api('/auth/logout')).send({ refreshToken: stillOk.body.refreshToken });
    });

    it('déconnexion du site par cookie, même avec un jeton d’accès expiré ; un formulaire d’un autre site ne ferme rien', async () => {
      const s = await newSession();
      const cookie = `bla_refresh=${s.refreshToken}`;
      // Requête d'un autre site (formulaire) : pas d'en-tête X-Auth-Mode → rien n'est fermé ni effacé.
      const forged = await request(app).post(api('/auth/logout')).set('Cookie', cookie);
      expect(forged.status).toBe(200);
      expect(forged.body.sessionsClosed).toBe(0);
      expect(forged.headers['set-cookie']).toBeUndefined();
      expect(await prisma.userSession.count({ where: { id: sessionIdOf(s.refreshToken) } })).toBe(1);
      // Site : cookie + en-tête, jeton d'accès périmé (avant : 401 et session laissée ouverte).
      const out = await request(app).post(api('/auth/logout'))
        .set('Cookie', cookie).set('X-Auth-Mode', 'cookie').set('Authorization', 'Bearer jeton.expire.invalide');
      expect(out.status).toBe(200);
      expect(out.body.sessionsClosed).toBe(1);
      expect(String(out.headers['set-cookie'])).toMatch(/bla_refresh=;/);
      expect(await prisma.userSession.count({ where: { id: sessionIdOf(s.refreshToken) } })).toBe(0);
      const reuse = await request(app).post(api('/auth/refresh-token')).set('Cookie', cookie).set('X-Auth-Mode', 'cookie');
      expect(reuse.status).toBe(401);
      // Idempotent : une seconde déconnexion ne provoque aucune erreur.
      expect((await request(app).post(api('/auth/logout')).set('Cookie', cookie).set('X-Auth-Mode', 'cookie')).status).toBe(200);
    });

    it('compte suspendu : session existante refusée par l’API et au renouvellement, puis fermée', async () => {
      const s = await newSession();
      await prisma.user.update({ where: { id: ids.client }, data: { status: 'suspended' } });
      try {
        const me = await request(app).get(api('/users/me')).set('Authorization', `Bearer ${s.accessToken}`);
        expect(me.status).toBe(403);
        expect(me.body.code).toBe('ACCOUNT_SUSPENDED');
        const refreshed = await request(app).post(api('/auth/refresh-token')).send({ refreshToken: s.refreshToken });
        expect(refreshed.status).toBe(403);
        expect(refreshed.body.code).toBe('ACCOUNT_SUSPENDED');
        expect(await prisma.userSession.count({ where: { id: sessionIdOf(s.refreshToken) } })).toBe(0);
      } finally {
        await prisma.user.update({ where: { id: ids.client }, data: { status: 'active' } });
      }
    });
  });

  it('panne d’envoi e-mail : 503 explicite et aucun code non reçu ne reste valable', async () => {
    failNext = true;
    const res = await request(app).post(api('/auth/login')).send({ email: providerBEmail, password: PASSWORD });
    expect(res.status).toBe(503);
    expect(await prisma.otpCode.count({ where: { userId: ids.providerB, usedAt: null, expiresAt: { gt: new Date() } } })).toBe(0);
  });

  it('code expiré refusé ; compte suspendu refusé', async () => {
    const login = await request(app).post(api('/auth/login')).send({ email: providerBEmail, password: PASSWORD });
    expect(login.status).toBe(200);
    const code = lastCode(providerBEmail);
    await prisma.otpCode.updateMany({ where: { userId: ids.providerB }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await request(app).post(api('/auth/login/verify-mfa')).send({ tempToken: login.body.tempToken, otpCode: code });
    expect(expired.status).toBe(422);

    await prisma.user.update({ where: { id: ids.providerB }, data: { status: 'suspended' } });
    const suspended = await request(app).post(api('/auth/login')).send({ email: providerBEmail, password: PASSWORD });
    expect(suspended.status).toBe(403);
  });

  it('super-administrateur : code e-mail puis accès à l’administration et permissions complètes', async () => {
    const login = await request(app).post(api('/auth/login')).send({ email: adminEmail, password: PASSWORD });
    expect(login.status).toBe(200);
    const ok = await request(app).post(api('/auth/login/verify-mfa')).send({ tempToken: login.body.tempToken, otpCode: lastCode(adminEmail) });
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe('super_admin');
    const dash = await request(app).get(api('/admin/dashboard')).set('Authorization', `Bearer ${ok.body.accessToken}`);
    expect(dash.status).toBe(200);
    // Un seul super-administrateur créé par ce test : aucun doublon par le démarrage.
    expect(await prisma.user.count({ where: { email: adminEmail } })).toBe(1);
  });
});

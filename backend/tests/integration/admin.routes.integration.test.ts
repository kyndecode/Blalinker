/**
 * Lot 0 — routes d'administration : permissions de LECTURE appliquées côté serveur,
 * garde-fous des actions sensibles, validation des données (persistance simulée).
 */
jest.mock('prom-client', () => {
  class Registry {
    contentType = 'text/plain';
    setDefaultLabels() { /* noop */ }
    metrics() { return Promise.resolve(''); }
  }
  return { Registry, collectDefaultMetrics: jest.fn() };
});

type Row = { id: string; role: string; status: string; permissions: string[]; mfaTotpEnabledAt: null };
const USERS: Record<string, Row> = {};
const user = (id: string, role: string, permissions: string[] = [], status = 'active') => {
  USERS[id] = { id, role, status, permissions, mfaTotpEnabledAt: null };
};

const prismaMock = {
  $queryRaw: jest.fn().mockResolvedValue([{ ok: 1 }]),
  $transaction: jest.fn(),
  user: {
    findFirst: jest.fn(async ({ where }: { where: { id?: string; role?: { in: string[] } } }) => {
      const row = where.id ? USERS[where.id] : undefined;
      if (!row) return null;
      if (where.role?.in && !where.role.in.includes(row.role)) return null;
      return { ...row, profile: row.role === 'client' ? { idCardUrl: null, idVerified: false } : null };
    }),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  userSession: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
  profile: { update: jest.fn().mockResolvedValue({}) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  category: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
};

jest.mock('../../src/config/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/config/redis', () => ({
  redis: { ping: jest.fn().mockResolvedValue('PONG'), get: jest.fn().mockResolvedValue(null), setex: jest.fn(), on: jest.fn(), status: 'ready' },
}));
jest.mock('../../src/utils/jwt.util', () => ({
  ...jest.requireActual('../../src/utils/jwt.util'),
  verifyAccessToken: (token: string) => ({ userId: token.split(':')[1], role: 'unknown' }),
  isTokenRevoked: jest.fn().mockResolvedValue(false),
}));

import request from 'supertest';
import { Prisma } from '@prisma/client';
import { app } from '../../src/app';

const SUPER = '00000000-0000-4000-8000-000000000001';
const NOBODY = '00000000-0000-4000-8000-000000000002';
const SUPPORT = '00000000-0000-4000-8000-000000000003';
const TEAM_MANAGER = '00000000-0000-4000-8000-000000000004';
const CLIENT = '00000000-0000-4000-8000-000000000005';
const OTHER_ADMIN = '00000000-0000-4000-8000-000000000006';
user(SUPER, 'super_admin');
user(NOBODY, 'admin', []);
user(SUPPORT, 'admin', ['users.read', 'users.suspend', 'providers.verify', 'categories.manage']);
user(TEAM_MANAGER, 'admin', ['admins.manage']);
user(CLIENT, 'client');
user(OTHER_ADMIN, 'admin', ['users.read']);

const as = (id: string) => ({ Authorization: `Bearer uid:${id}` });

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prismaMock));
});

describe('lecture admin : chaque liste exige sa permission', () => {
  it.each([
    ['/api/v1/admin/dashboard', 'stats.read'],
    ['/api/v1/admin/users', 'users.read'],
    [`/api/v1/admin/users/${CLIENT}`, 'users.read'],
    ['/api/v1/admin/providers', 'providers.read'],
    ['/api/v1/admin/bookings', 'bookings.read'],
    ['/api/v1/admin/reviews', 'reviews.moderate'],
    ['/api/v1/admin/reviews/pending', 'reviews.moderate'],
    ['/api/v1/admin/reports', 'reports.handle'],
    ['/api/v1/admin/contacts', 'contacts.handle'],
    ['/api/v1/admin/transactions', 'payments.read'],
    ['/api/v1/admin/categories', 'categories.manage'],
    ['/api/v1/admin/payouts', 'payments.read'],
    ['/api/v1/admin/audit', 'audit.read'],
  ])('GET %s sans « %s » → 403', async (path, permission) => {
    const res = await request(app).get(path).set(as(NOBODY));
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'FORBIDDEN', missing: [permission] });
  });

  it('un client n’accède à aucune route admin', async () => {
    expect((await request(app).get('/api/v1/admin/users').set(as(CLIENT))).status).toBe(403);
  });

  it('le super administrateur franchit le contrôle de permission', async () => {
    const res = await request(app).get('/api/v1/admin/users').set(as(SUPER));
    expect(res.status).not.toBe(403);
  });
});

describe('statut d’un utilisateur : garde-fous', () => {
  it('statut inconnu → 422', async () => {
    const res = await request(app).put(`/api/v1/admin/users/${CLIENT}/status`).set(as(SUPPORT)).send({ status: 'root' });
    expect(res.status).toBe(422);
  });

  it('cible administrateur → 403 (gestion via l’équipe)', async () => {
    const res = await request(app).put(`/api/v1/admin/users/${SUPER}/status`).set(as(SUPPORT)).send({ status: 'banned' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ADMIN_TARGET_FORBIDDEN');
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('son propre compte → 400', async () => {
    const res = await request(app).put(`/api/v1/admin/users/${SUPPORT}/status`).set(as(SUPPORT)).send({ status: 'active' });
    expect(res.status).toBe(400);
  });

  it('compte inexistant → 404', async () => {
    const res = await request(app).put('/api/v1/admin/users/00000000-0000-4000-8000-0000000000ff/status').set(as(SUPPORT)).send({ status: 'suspended' });
    expect(res.status).toBe(404);
  });

  it('suspension d’un client → sessions fermées et journal avec l’ancien statut', async () => {
    const res = await request(app).put(`/api/v1/admin/users/${CLIENT}/status`).set(as(SUPPORT)).send({ status: 'suspended', reason: 'fraude' });
    expect(res.status).toBe(200);
    expect(res.body.sessionsRevoked).toBe(true);
    expect(prismaMock.userSession.deleteMany).toHaveBeenCalledWith({ where: { userId: CLIENT } });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: SUPPORT,
        action: 'admin.user.status',
        entityId: CLIENT,
        oldData: { status: 'active' },
        newData: expect.objectContaining({ status: 'suspended', reason: 'fraude', result: 'success' }),
      }),
    });
  });
});

describe('vérification d’identité', () => {
  it('sans pièce déposée → 409, rien n’est modifié', async () => {
    const res = await request(app).post(`/api/v1/admin/users/${CLIENT}/verify-id`).set(as(SUPPORT)).send({ approved: true });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ID_DOCUMENT_MISSING');
    expect(prismaMock.profile.update).not.toHaveBeenCalled();
  });

  it('décision absente → 422', async () => {
    const res = await request(app).post(`/api/v1/admin/users/${CLIENT}/verify-id`).set(as(SUPPORT)).send({});
    expect(res.status).toBe(422);
  });
});

describe('catégories : données validées', () => {
  it('identifiant URL invalide → 422', async () => {
    const res = await request(app).post('/api/v1/admin/categories').set(as(SUPPORT)).send({ name: 'Plomberie', slug: 'Plomberie Générale!' });
    expect(res.status).toBe(422);
    expect(prismaMock.category.create).not.toHaveBeenCalled();
  });

  it('champ non autorisé (id, createdAt…) → 422 : plus de données brutes en base', async () => {
    const res = await request(app).put(`/api/v1/admin/categories/${CLIENT}`).set(as(SUPPORT)).send({ name: 'Ok', createdAt: '2020-01-01' });
    expect(res.status).toBe(422);
    expect(prismaMock.category.update).not.toHaveBeenCalled();
  });

  it('identifiant URL déjà pris → 409', async () => {
    prismaMock.category.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    const res = await request(app).post('/api/v1/admin/categories').set(as(SUPPORT)).send({ name: 'Plomberie', slug: 'plomberie' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SLUG_TAKEN');
  });

  it('création valide → 201 et journalisée', async () => {
    prismaMock.category.create.mockResolvedValueOnce({ id: 'c1', name: 'Plomberie', slug: 'plomberie' });
    const res = await request(app).post('/api/v1/admin/categories').set(as(SUPPORT)).send({ name: 'Plomberie', slug: 'plomberie', iconUrl: '🔧' });
    expect(res.status).toBe(201);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'admin.category.create', entityId: 'c1' }) });
  });
});

describe('équipe : déconnexion forcée et auto-modification', () => {
  it('un admin ne peut pas déconnecter un super administrateur', async () => {
    const res = await request(app).post(`/api/v1/admin/team/${SUPER}/force-logout`).set(as(TEAM_MANAGER));
    expect(res.status).toBe(403);
    expect(prismaMock.userSession.deleteMany).not.toHaveBeenCalled();
  });

  it('la déconnexion forcée ne vise que l’équipe (client → 404)', async () => {
    const res = await request(app).post(`/api/v1/admin/team/${CLIENT}/force-logout`).set(as(TEAM_MANAGER));
    expect(res.status).toBe(404);
  });

  it('déconnexion forcée d’un membre → sessions fermées', async () => {
    const res = await request(app).post(`/api/v1/admin/team/${OTHER_ADMIN}/force-logout`).set(as(TEAM_MANAGER));
    expect(res.status).toBe(200);
    expect(prismaMock.userSession.deleteMany).toHaveBeenCalledWith({ where: { userId: OTHER_ADMIN } });
  });

  it('modifier ses propres droits ou son statut → 400', async () => {
    const res = await request(app).patch(`/api/v1/admin/team/${TEAM_MANAGER}`).set(as(TEAM_MANAGER)).send({ status: 'active' });
    expect(res.status).toBe(400);
  });
});

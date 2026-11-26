/**
 * Création du premier super-administrateur : jamais de doublon.
 * Scénario réel du 23/11/2026 : le compte a été renommé en base en
 * contact@blalinker.com alors que ADMIN_EMAIL (Render) vaut encore une autre
 * adresse et que ADMIN_PASSWORD est défini. L'ancienne logique aurait créé un
 * second super-administrateur au redémarrage suivant.
 */
jest.mock('../../src/config/env', () => ({
  env: {
    ADMIN_EMAIL: 'ancienne.adresse@gmail.com',
    ADMIN_PASSWORD: 'un-mot-de-passe-de-test',
  },
}));

jest.mock('../../src/config/database', () => ({
  prisma: { user: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() } },
}));

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('bcryptjs', () => ({ hash: jest.fn().mockResolvedValue('$2b$12$hash') }));

import { env } from '../../src/config/env';
import { prisma } from '../../src/config/database';
import { logger } from '../../src/config/logger';
import { ensureBootstrapAdmin } from '../../src/config/bootstrapAdmin';

const mockUser = prisma.user as jest.Mocked<typeof prisma.user>;
const mutableEnv = env as unknown as { ADMIN_EMAIL: string; ADMIN_PASSWORD?: string };

beforeEach(() => {
  jest.clearAllMocks();
  mutableEnv.ADMIN_EMAIL = 'ancienne.adresse@gmail.com';
  mutableEnv.ADMIN_PASSWORD = 'un-mot-de-passe-de-test';
});

describe('ensureBootstrapAdmin', () => {
  it("ne crée rien si un super-administrateur actif existe, même si ADMIN_EMAIL ne correspond pas à son adresse", async () => {
    (mockUser.findFirst as jest.Mock).mockResolvedValue({ id: 'super-1' });

    await expect(ensureBootstrapAdmin()).resolves.toBe('skipped_active_super_admin');

    expect(mockUser.findFirst).toHaveBeenCalledWith({
      where: { role: 'super_admin', status: 'active', deletedAt: null },
      select: { id: true },
    });
    expect(mockUser.findUnique).not.toHaveBeenCalled();
    expect(mockUser.create).not.toHaveBeenCalled();
  });

  it('ne crée rien sans ADMIN_PASSWORD', async () => {
    (mockUser.findFirst as jest.Mock).mockResolvedValue(null);
    mutableEnv.ADMIN_PASSWORD = undefined;

    await expect(ensureBootstrapAdmin()).resolves.toBe('skipped_no_password');
    expect(mockUser.create).not.toHaveBeenCalled();
  });

  it("ne modifie ni n'élève un compte existant qui utilise déjà ADMIN_EMAIL", async () => {
    (mockUser.findFirst as jest.Mock).mockResolvedValue(null);
    (mockUser.findUnique as jest.Mock).mockResolvedValue({ id: 'client-1' });

    await expect(ensureBootstrapAdmin()).resolves.toBe('skipped_email_in_use');
    expect(mockUser.create).not.toHaveBeenCalled();
  });

  it('crée le premier super-administrateur (MFA actif) quand aucun n’existe', async () => {
    (mockUser.findFirst as jest.Mock).mockResolvedValue(null);
    (mockUser.findUnique as jest.Mock).mockResolvedValue(null);
    (mockUser.create as jest.Mock).mockResolvedValue({ id: 'new' });
    mutableEnv.ADMIN_EMAIL = '  Contact@BlaLinker.com ';

    await expect(ensureBootstrapAdmin()).resolves.toBe('created');

    const data = (mockUser.create as jest.Mock).mock.calls[0][0].data;
    expect(data).toMatchObject({ email: 'contact@blalinker.com', role: 'super_admin', status: 'active', mfaEnabled: true });
    expect(data.passwordHash).toBe('$2b$12$hash');
  });

  it('deux démarrages simultanés : la contrainte d’unicité (P2002) est traitée sans erreur', async () => {
    (mockUser.findFirst as jest.Mock).mockResolvedValue(null);
    (mockUser.findUnique as jest.Mock).mockResolvedValue(null);
    (mockUser.create as jest.Mock).mockRejectedValue(Object.assign(new Error('Unique'), { code: 'P2002' }));

    await expect(ensureBootstrapAdmin()).resolves.toBe('skipped_email_in_use');
  });

  it("n'écrit jamais l'adresse complète dans les journaux", async () => {
    (mockUser.findFirst as jest.Mock).mockResolvedValue(null);
    (mockUser.findUnique as jest.Mock).mockResolvedValue({ id: 'client-1' });

    await ensureBootstrapAdmin();

    const logs = JSON.stringify([(logger.warn as jest.Mock).mock.calls, (logger.info as jest.Mock).mock.calls]);
    expect(logs).not.toContain('ancienne.adresse@gmail.com');
    expect(logs).toContain('an***@gmail.com');
  });
});

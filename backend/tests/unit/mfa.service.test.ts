/**
 * Phase 3b — service TOTP des administrateurs.
 * Vecteurs officiels RFC 6238 (annexe B, SHA-1), chiffrement du secret, anti-rejeu
 * (y compris validations simultanées), codes de récupération à usage unique.
 * Prisma, Redis, e-mail et audit sont simulés.
 */
jest.mock('../../src/config/env', () => ({
  env: { NODE_ENV: 'test', ENCRYPTION_KEY: 'a'.repeat(64), ADMIN_TOTP_REQUIRED: false },
}));

jest.mock('../../src/config/database', () => {
  const prisma: Record<string, unknown> = {
    user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    mfaRecoveryCode: { count: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn(), updateMany: jest.fn() },
    userSession: { deleteMany: jest.fn() },
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});

jest.mock('../../src/config/redis', () => ({
  redis: { setex: jest.fn(), get: jest.fn(), del: jest.fn() },
}));

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../src/config/email', () => ({ sendEmail: jest.fn().mockResolvedValue(true) }));
jest.mock('../../src/utils/audit.util', () => ({ writeAudit: jest.fn().mockResolvedValue(undefined) }));
jest.mock('bcryptjs', () => ({ compare: jest.fn().mockResolvedValue(true) }));

import bcrypt from 'bcryptjs';
import { Secret, TOTP } from 'otpauth';
import { prisma } from '../../src/config/database';
import { redis } from '../../src/config/redis';
import { logger } from '../../src/config/logger';
import { writeAudit } from '../../src/utils/audit.util';
import { encrypt, decrypt } from '../../src/utils/encryption.util';
import {
  MfaService,
  matchTotpStep,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
  TOTP_ISSUER,
} from '../../src/modules/auth/mfa.service';

const service = new MfaService();
const userMock = prisma.user as unknown as Record<string, jest.Mock>;
const codesMock = (prisma as unknown as { mfaRecoveryCode: Record<string, jest.Mock> }).mfaRecoveryCode;
const redisMock = redis as unknown as Record<string, jest.Mock>;

// RFC 6238, annexe B : secret ASCII « 12345678901234567890 » (SHA-1).
const RFC_SECRET = Secret.fromLatin1('12345678901234567890').base32;
const freshCode = (base32: string, timestamp = Date.now()) =>
  new TOTP({ secret: Secret.fromBase32(base32), algorithm: 'SHA1', digits: 6, period: 30 }).generate({ timestamp });

const admin = {
  id: 'admin-1',
  email: 'contact@blalinker.com',
  role: 'super_admin',
  status: 'active',
  passwordHash: '$2b$12$x',
  mfaTotpEnabledAt: null as Date | null,
  deletedAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  (bcrypt.compare as jest.Mock).mockResolvedValue(true);
});

describe('TOTP — conformité RFC 6238', () => {
  // Codes à 8 chiffres de la RFC ; un code à 6 chiffres en est les 6 derniers.
  it.each([
    [59, '94287082', 1],
    [1111111109, '07081804', 37037036],
    [1111111111, '14050471', 37037037],
    [1234567890, '89005924', 41152263],
    [2000000000, '69279037', 66666666],
  ])('t=%i s : code %s accepté, période %i', (seconds, rfc8, step) => {
    expect(matchTotpStep(RFC_SECRET, rfc8.slice(-6), seconds * 1000)).toBe(step);
  });

  it('tolère une période de décalage (±30 s), pas deux', () => {
    const now = 1_800_000_000_000;
    expect(matchTotpStep(RFC_SECRET, freshCode(RFC_SECRET, now - 30_000), now)).not.toBeNull();
    expect(matchTotpStep(RFC_SECRET, freshCode(RFC_SECRET, now + 30_000), now)).not.toBeNull();
    expect(matchTotpStep(RFC_SECRET, freshCode(RFC_SECRET, now - 90_000), now)).toBeNull();
  });

  it('refuse un format invalide', () => {
    expect(matchTotpStep(RFC_SECRET, '12345')).toBeNull();
    expect(matchTotpStep(RFC_SECRET, 'abcdef')).toBeNull();
  });
});

describe('codes de récupération', () => {
  it('10 codes uniques au format XXXXX-XXXXX, sans caractère ambigu', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  });

  it('hachage stable, insensible à la casse et au tiret, jamais égal au code', () => {
    expect(normalizeRecoveryCode('abcde-fghjk')).toBe('ABCDEFGHJK');
    expect(hashRecoveryCode('abcde-fghjk')).toBe(hashRecoveryCode('ABCDEFGHJK'));
    expect(hashRecoveryCode('ABCDEFGHJK')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode('ABCDEFGHJK')).not.toContain('ABCDEFGHJK');
  });

  it('consommation atomique : true une seule fois', async () => {
    codesMock.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(service.consumeRecoveryCode('admin-1', 'ABCDE-FGHJK')).resolves.toBe(true);
    await expect(service.consumeRecoveryCode('admin-1', 'ABCDE-FGHJK')).resolves.toBe(false);
    expect(codesMock.updateMany).toHaveBeenCalledWith({
      where: { userId: 'admin-1', codeHash: hashRecoveryCode('ABCDEFGHJK'), usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('format incorrect : refusé sans requête', async () => {
    await expect(service.consumeRecoveryCode('admin-1', 'ABC')).resolves.toBe(false);
    expect(codesMock.updateMany).not.toHaveBeenCalled();
  });
});

describe('configuration (setup) et activation', () => {
  it('setup : mot de passe vérifié, secret provisoire CHIFFRÉ dans Redis, QR code compatible', async () => {
    userMock.findUnique.mockResolvedValue(admin);

    const out = await service.beginTotpSetup('admin-1', 'mot-de-passe', '1.2.3.4');

    const [key, ttl, stored] = redisMock.setex.mock.calls[0];
    expect(key).toBe('mfa_setup:admin-1');
    expect(ttl).toBe(600);
    const base32 = out.manualEntryKey.replace(/ /g, '');
    expect(stored).not.toContain(base32);
    expect(decrypt(stored)).toBe(base32);
    expect(out.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(out.otpauthUrl).toContain(`issuer=${encodeURIComponent(TOTP_ISSUER)}`);
    expect(out.otpauthUrl).toContain('algorithm=SHA1');
    expect(out.otpauthUrl).toContain('digits=6');
    expect(out.otpauthUrl).toContain('period=30');
    expect(out.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(JSON.stringify((logger.info as jest.Mock).mock.calls)).not.toContain(base32);
  });

  it('setup : mauvais mot de passe → 403 PASSWORD_MISMATCH, aucun secret créé', async () => {
    userMock.findUnique.mockResolvedValue(admin);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(service.beginTotpSetup('admin-1', 'faux', '1.2.3.4')).rejects.toMatchObject({ status: 403, code: 'PASSWORD_MISMATCH' });
    expect(redisMock.setex).not.toHaveBeenCalled();
  });

  it('setup : réservé aux administrateurs', async () => {
    userMock.findUnique.mockResolvedValue({ ...admin, role: 'client' });
    await expect(service.beginTotpSetup('admin-1', 'x')).rejects.toMatchObject({ status: 403 });
  });

  it('setup : déjà configurée → 409 (le secret n’est jamais renvoyé)', async () => {
    userMock.findUnique.mockResolvedValue({ ...admin, mfaTotpEnabledAt: new Date() });
    await expect(service.beginTotpSetup('admin-1', 'x')).rejects.toMatchObject({ status: 409, code: 'TOTP_ALREADY_ENABLED' });
    expect(redisMock.setex).not.toHaveBeenCalled();
  });

  it('activation : premier code exigé ; secret stocké chiffré ; 10 codes de récupération hachés', async () => {
    const base32 = new Secret({ size: 20 }).base32;
    redisMock.get.mockResolvedValue(encrypt(base32));
    redisMock.del.mockResolvedValue(1);
    userMock.updateMany.mockResolvedValue({ count: 1 });
    userMock.findUnique.mockResolvedValue({ email: 'contact@blalinker.com' });

    const out = await service.activateTotp('admin-1', freshCode(base32), '1.2.3.4');

    expect(out.recoveryCodes).toHaveLength(10);
    const update = userMock.updateMany.mock.calls[0][0];
    expect(update.where).toMatchObject({ id: 'admin-1', mfaTotpEnabledAt: null });
    expect(update.data.mfaSecret).not.toContain(base32);
    expect(decrypt(update.data.mfaSecret)).toBe(base32);
    expect(update.data.mfaEnabled).toBe(true);
    const stored = codesMock.createMany.mock.calls[0][0].data.map((r: { codeHash: string }) => r.codeHash);
    expect(stored).toEqual(out.recoveryCodes.map(hashRecoveryCode));
    expect(JSON.stringify(stored)).not.toContain(out.recoveryCodes[0]);
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.mfa.totp_enabled' }));
  });

  it('activation : code faux → 422, configuration conservée pour un nouvel essai', async () => {
    const base32 = new Secret({ size: 20 }).base32;
    redisMock.get.mockResolvedValue(encrypt(base32));

    await expect(service.activateTotp('admin-1', '000000')).rejects.toMatchObject({ status: 422 });
    expect(redisMock.del).not.toHaveBeenCalled();
    expect(userMock.updateMany).not.toHaveBeenCalled();
  });

  it('activation : configuration expirée → 410', async () => {
    redisMock.get.mockResolvedValue(null);
    await expect(service.activateTotp('admin-1', '123456')).rejects.toMatchObject({ status: 410 });
  });

  it('activation simultanée : la seconde est refusée (409)', async () => {
    const base32 = new Secret({ size: 20 }).base32;
    redisMock.get.mockResolvedValue(encrypt(base32));
    redisMock.del.mockResolvedValue(0); // la configuration a déjà été consommée

    await expect(service.activateTotp('admin-1', freshCode(base32))).rejects.toMatchObject({ status: 409 });
    expect(userMock.updateMany).not.toHaveBeenCalled();
  });
});

describe('vérification à la connexion (anti-rejeu)', () => {
  const base32 = new Secret({ size: 20 }).base32;
  const candidate = { id: 'admin-1', mfaSecret: encrypt(base32) };

  it('code valide : accepté par mise à jour conditionnelle de la dernière période', async () => {
    userMock.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.verifyTotp(candidate, freshCode(base32))).resolves.toBe(true);

    const call = userMock.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({
      id: 'admin-1',
      OR: [{ mfaTotpLastStep: null }, { mfaTotpLastStep: { lt: expect.any(Number) } }],
    });
  });

  it('même code rejoué (période déjà acceptée) : refusé', async () => {
    userMock.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.verifyTotp(candidate, freshCode(base32))).resolves.toBe(false);
  });

  it('validations SIMULTANÉES du même code : une seule réussit', async () => {
    // Simulation fidèle de la mise à jour conditionnelle (atomique en PostgreSQL).
    let lastStep: number | null = null;
    userMock.updateMany.mockImplementation(async ({ where, data }) => {
      const condition = where.OR[1].mfaTotpLastStep.lt;
      if (lastStep === null || lastStep < condition) {
        lastStep = data.mfaTotpLastStep;
        return { count: 1 };
      }
      return { count: 0 };
    });
    const code = freshCode(base32);

    const results = await Promise.all([1, 2, 3, 4, 5].map(() => service.verifyTotp(candidate, code)));

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('code invalide : refusé sans écriture', async () => {
    await expect(service.verifyTotp(candidate, '000000')).resolves.toBe(false);
    expect(userMock.updateMany).not.toHaveBeenCalled();
  });

  it('secret illisible : erreur explicite, le MFA n’est JAMAIS désactivé', async () => {
    await expect(service.verifyTotp({ id: 'admin-1', mfaSecret: 'pas:un:secret' }, '123456')).rejects.toMatchObject({
      status: 503,
      code: 'MFA_SECRET_UNREADABLE',
    });
    expect(userMock.update).not.toHaveBeenCalled();
    expect(userMock.updateMany).not.toHaveBeenCalled();
  });
});

describe('état et réinitialisation', () => {
  it('administrateur sans application : configuration demandée', async () => {
    userMock.findUnique.mockResolvedValue({ role: 'super_admin', mfaEnabled: true, mfaTotpEnabledAt: null });
    await expect(service.getStatus('admin-1')).resolves.toMatchObject({ totpEnabled: false, setupRequired: true });
  });

  it('client : jamais de configuration demandée', async () => {
    userMock.findUnique.mockResolvedValue({ role: 'client', mfaEnabled: true, mfaTotpEnabledAt: null });
    await expect(service.getStatus('client-1')).resolves.toMatchObject({ setupRequired: false });
  });

  it('réinitialisation : secret et codes effacés, sessions fermées, MFA conservé, audit', async () => {
    userMock.findUnique.mockResolvedValue({ id: 'admin-2', email: 'membre@blalinker.com' });

    await service.resetTotp('admin-2', { actorId: 'admin-1', ip: '1.2.3.4', via: 'admin.team' });

    expect(userMock.update).toHaveBeenCalledWith({
      where: { id: 'admin-2' },
      data: { mfaSecret: null, mfaTotpEnabledAt: null, mfaTotpLastStep: null, mfaEnabled: true },
    });
    expect(codesMock.deleteMany).toHaveBeenCalledWith({ where: { userId: 'admin-2' } });
    expect((prisma as unknown as { userSession: Record<string, jest.Mock> }).userSession.deleteMany)
      .toHaveBeenCalledWith({ where: { userId: 'admin-2' } });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.mfa.totp_reset', userId: 'admin-1' }));
  });
});

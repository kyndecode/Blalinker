/**
 * Garanties MFA vérifiées sur un VRAI PostgreSQL (migrations appliquées).
 *
 * Ignoré tant que TEST_DATABASE_URL n'est pas défini. Ne JAMAIS le faire pointer
 * vers une base de production : le test crée puis supprime ses propres comptes.
 * Exemple (base locale jetable) :
 *   TEST_DATABASE_URL=postgresql://user:pass@localhost:54329/bla_test npx jest tests/db
 */
import { PrismaClient } from '@prisma/client';
import { Secret, TOTP } from 'otpauth';

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

if (url && /supabase\.co|supabase\.com|pooler\.supabase|onrender\.com/i.test(url)) {
  throw new Error('TEST_DATABASE_URL pointe vers un hébergeur distant : refusé (base locale jetable uniquement).');
}

describeDb('PostgreSQL réel — garanties MFA', () => {
  let prisma: PrismaClient;
  const created: string[] = [];

  const newAdmin = async (suffix: string) => {
    const user = await prisma.user.create({
      data: {
        email: `mfa-db-${suffix}-${Date.now()}@example.test`,
        passwordHash: 'not-a-real-hash',
        role: 'super_admin',
        status: 'active',
      },
    });
    created.push(user.id);
    return user;
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    if (created.length) {
      await prisma.mfaRecoveryCode.deleteMany({ where: { userId: { in: created } } });
      await prisma.user.deleteMany({ where: { id: { in: created } } });
    }
    await prisma.$disconnect();
  });

  it('migration appliquée : colonnes et table présentes', async () => {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name IN ('mfa_secret', 'mfa_totp_enabled_at', 'mfa_totp_last_step')`;
    expect(columns.map((c) => c.column_name).sort()).toEqual(['mfa_secret', 'mfa_totp_enabled_at', 'mfa_totp_last_step']);
    await expect(prisma.mfaRecoveryCode.count()).resolves.toBeGreaterThanOrEqual(0);
  });

  it('anti-rejeu : 10 validations SIMULTANÉES de la même période → une seule acceptée', async () => {
    const admin = await newAdmin('replay');
    const step = 60_000_000;
    const accept = (s: number) =>
      prisma.user.updateMany({
        where: { id: admin.id, OR: [{ mfaTotpLastStep: null }, { mfaTotpLastStep: { lt: s } }] },
        data: { mfaTotpLastStep: s },
      });

    const results = await Promise.all(Array.from({ length: 10 }, () => accept(step)));
    expect(results.filter((r) => r.count === 1)).toHaveLength(1);

    await expect(accept(step)).resolves.toEqual({ count: 0 });     // même période rejouée
    await expect(accept(step - 1)).resolves.toEqual({ count: 0 }); // période antérieure
    await expect(accept(step + 1)).resolves.toEqual({ count: 1 }); // période suivante
  });

  it('code de récupération : 10 consommations SIMULTANÉES → une seule', async () => {
    const admin = await newAdmin('recovery');
    await prisma.mfaRecoveryCode.create({ data: { userId: admin.id, codeHash: 'a'.repeat(64) } });

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        prisma.mfaRecoveryCode.updateMany({
          where: { userId: admin.id, codeHash: 'a'.repeat(64), usedAt: null },
          data: { usedAt: new Date() },
        }),
      ),
    );
    expect(results.filter((r) => r.count === 1)).toHaveLength(1);
  });

  it('unicité (utilisateur, code) et suppression en cascade', async () => {
    const admin = await newAdmin('cascade');
    await prisma.mfaRecoveryCode.create({ data: { userId: admin.id, codeHash: 'b'.repeat(64) } });
    await expect(
      prisma.mfaRecoveryCode.create({ data: { userId: admin.id, codeHash: 'b'.repeat(64) } }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await prisma.user.delete({ where: { id: admin.id } });
    created.splice(created.indexOf(admin.id), 1);
    await expect(prisma.mfaRecoveryCode.count({ where: { userId: admin.id } })).resolves.toBe(0);
  });

  it('service réel (verifyTotp) : secret chiffré en base, 5 validations simultanées → une seule', async () => {
    const admin = await newAdmin('service');
    // Le service utilise le client Prisma de l'application : on le dirige vers la base de test.
    process.env.DATABASE_URL = url;
    jest.resetModules();
    const { encrypt } = await import('../../src/utils/encryption.util');
    const { mfaService } = await import('../../src/modules/auth/mfa.service');
    const appDb = (await import('../../src/config/database')).prisma;

    const base32 = new Secret({ size: 20 }).base32;
    await prisma.user.update({
      where: { id: admin.id },
      data: { mfaSecret: encrypt(base32), mfaTotpEnabledAt: new Date(), mfaTotpLastStep: null },
    });
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(stored.mfaSecret).not.toContain(base32);

    const code = new TOTP({ secret: Secret.fromBase32(base32), algorithm: 'SHA1', digits: 6, period: 30 }).generate();
    const results = await Promise.all(Array.from({ length: 5 }, () => mfaService.verifyTotp(stored, code)));
    expect(results.filter(Boolean)).toHaveLength(1);
    await expect(mfaService.verifyTotp(stored, code)).resolves.toBe(false); // rejoué plus tard

    await appDb.$disconnect();
  });
});

/**
 * Phase 3b — connexion avec double authentification.
 * - Clients / prestataires / admins sans TOTP : comportement STRICTEMENT inchangé.
 * - Admins avec TOTP : code de l'application, secours e-mail (adresse du compte,
 *   délai et plafond), codes de récupération, plafond d'essais, verrouillage.
 */
jest.mock('../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    JWT_ACCESS_EXPIRY: '15m',
    JWT_REFRESH_EXPIRY: '30d',
    ENCRYPTION_KEY: 'a'.repeat(64),
    MFA_ENABLED: true,
    ADMIN_TOTP_REQUIRED: false,
  },
}));

jest.mock('../../src/config/database', () => ({
  prisma: {
    user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    userSession: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    otpCode: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
    mfaRecoveryCode: { count: jest.fn().mockResolvedValue(9) },
  },
}));

jest.mock('../../src/config/redis', () => ({
  redis: {
    get: jest.fn(), set: jest.fn(), setex: jest.fn(), del: jest.fn(),
    incr: jest.fn(), expire: jest.fn(), ttl: jest.fn(),
  },
}));

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../src/config/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
  emailTemplates: {
    otpRegister: jest.fn().mockReturnValue({ subject: 'OTP', html: '<p>x</p>' }),
    otpLogin: jest.fn().mockReturnValue({ subject: 'OTP', html: '<p>x</p>' }),
    otpPasswordReset: jest.fn().mockReturnValue({ subject: 'OTP', html: '<p>x</p>' }),
  },
}));

jest.mock('../../src/utils/sms.util', () => ({
  sendSMS: jest.fn().mockResolvedValue(true),
  isSmsConfigured: jest.fn().mockReturnValue(false),
}));

jest.mock('../../src/utils/audit.util', () => ({ writeAudit: jest.fn().mockResolvedValue(undefined) }));

jest.mock('../../src/utils/jwt.util', () => ({
  signAccessToken: jest.fn().mockReturnValue('mock-access-token'),
  signRefreshToken: jest.fn().mockReturnValue('mock-refresh-token'),
  verifyRefreshToken: jest.fn(),
  revokeToken: jest.fn(),
  generateTokenFamily: jest.fn().mockReturnValue('temp-token'),
}));

jest.mock('../../src/utils/otp.util', () => ({
  generateOTP: jest.fn().mockReturnValue('123456'),
  hashOTP: jest.fn().mockResolvedValue('$2b$10$hashed'),
  verifyOTP: jest.fn().mockResolvedValue(true),
  otpExpiresAt: jest.fn().mockReturnValue(new Date(Date.now() + 600_000)),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$h'),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/modules/auth/mfa.service', () => ({
  ...jest.requireActual('../../src/modules/auth/mfa.service'),
  mfaService: { verifyTotp: jest.fn(), consumeRecoveryCode: jest.fn() },
}));

import { prisma } from '../../src/config/database';
import { redis } from '../../src/config/redis';
import { sendEmail } from '../../src/config/email';
import { writeAudit } from '../../src/utils/audit.util';
import { verifyOTP } from '../../src/utils/otp.util';
import { mfaService } from '../../src/modules/auth/mfa.service';
import { AuthService, MFA_MAX_ATTEMPTS_PER_LOGIN } from '../../src/modules/auth/auth.service';

const auth = new AuthService();
const userMock = prisma.user as unknown as Record<string, jest.Mock>;
const otpMock = prisma.otpCode as unknown as Record<string, jest.Mock>;
const r = redis as unknown as Record<string, jest.Mock>;
const mfa = mfaService as unknown as Record<string, jest.Mock>;

const base = {
  passwordHash: '$2b$12$h',
  status: 'active',
  deletedAt: null,
  lockedUntil: null,
  loginAttempts: 0,
  mfaEnabled: true,
  phone: null,
};
const client = { ...base, id: 'client-1', email: 'client@example.com', role: 'client', mfaSecret: null, mfaTotpEnabledAt: null };
const adminNoTotp = { ...base, id: 'admin-0', email: 'contact@blalinker.com', role: 'super_admin', mfaSecret: null, mfaTotpEnabledAt: null };
const adminTotp = { ...adminNoTotp, id: 'admin-1', mfaSecret: 'iv:tag:data', mfaTotpEnabledAt: new Date('2026-11-24') };

const session = (userId: string) => JSON.stringify({ userId, ip: '1.2.3.4' });

beforeEach(() => {
  jest.clearAllMocks();
  (sendEmail as jest.Mock).mockResolvedValue(true);
  (verifyOTP as jest.Mock).mockResolvedValue(true);
  otpMock.create.mockResolvedValue({});
  otpMock.deleteMany.mockResolvedValue({ count: 0 });
  otpMock.findFirst.mockResolvedValue({ id: 'otp-1', attempts: 0, codeHash: 'h' });
  (prisma.userSession.create as jest.Mock).mockResolvedValue({ id: 'session-1' });
  r.setex.mockResolvedValue('OK');
  r.set.mockResolvedValue('OK');
  r.incr.mockResolvedValue(1);
  r.del.mockResolvedValue(1);
});

describe('login() — réponses', () => {
  it('client : réponse et envoi OTP identiques à avant (aucun nouveau champ)', async () => {
    userMock.findFirst.mockResolvedValue(client);

    const res = await auth.login({ email: client.email, password: 'x' }, '1.2.3.4');

    expect(Object.keys(res).sort()).toEqual(['mfaRequired', 'tempToken', 'user']);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect((sendEmail as jest.Mock).mock.calls[0][0].to).toBe(client.email);
  });

  it('admin sans application : OTP e-mail comme avant (transition sans blocage)', async () => {
    userMock.findFirst.mockResolvedValue(adminNoTotp);

    const res = await auth.login({ email: adminNoTotp.email, password: 'x' }, '1.2.3.4');

    expect(res).not.toHaveProperty('mfaMethod');
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('admin avec application : code TOTP demandé, AUCUN e-mail envoyé', async () => {
    userMock.findFirst.mockResolvedValue(adminTotp);

    const res = await auth.login({ email: adminTotp.email, password: 'x' }, '1.2.3.4');

    expect(res).toMatchObject({ mfaRequired: true, mfaMethod: 'totp', mfaMethods: ['totp', 'email', 'recovery'] });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(otpMock.create).not.toHaveBeenCalled();
  });
});

describe('verifyMfa() — clients inchangés', () => {
  it('sans méthode : OTP e-mail validé comme avant', async () => {
    r.get.mockResolvedValue(session('client-1'));
    userMock.findUnique.mockResolvedValue(client);

    const res = await auth.verifyMfa('temp-token', '123456');

    expect(res).toHaveProperty('accessToken');
    expect(mfa.verifyTotp).not.toHaveBeenCalled();
  });

  it('un client ne peut pas utiliser les méthodes réservées aux admins', async () => {
    r.get.mockResolvedValue(session('client-1'));
    userMock.findUnique.mockResolvedValue(client);

    await expect(auth.verifyMfa('temp-token', '123456', 'totp')).rejects.toMatchObject({ status: 400 });
    await expect(auth.verifyMfa('temp-token', 'ABCDE-FGHJK', 'recovery')).rejects.toMatchObject({ status: 400 });
  });
});

describe('verifyMfa() — administrateur avec application', () => {
  beforeEach(() => {
    r.get.mockImplementation(async (key: string) => (key.startsWith('mfa_temp:') ? session('admin-1') : null));
    userMock.findUnique.mockResolvedValue(adminTotp);
  });

  it('code de l’application valide : connexion, audit', async () => {
    mfa.verifyTotp.mockResolvedValue(true);

    const res = await auth.verifyMfa('temp-token', '654321', 'totp');

    expect(res).toHaveProperty('accessToken');
    expect(mfa.verifyTotp).toHaveBeenCalledWith(adminTotp, '654321');
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.mfa.login_totp' }));
    expect(r.del).toHaveBeenCalledWith('mfa_temp:temp-token');
  });

  it('code faux ou rejoué : 422, échec compté (verrouillage du compte à 5)', async () => {
    mfa.verifyTotp.mockResolvedValue(false);

    await expect(auth.verifyMfa('temp-token', '654321', 'totp')).rejects.toMatchObject({ status: 422 });
    expect(userMock.update).toHaveBeenCalledWith({ where: { id: 'admin-1' }, data: { loginAttempts: 1 } });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.mfa.totp_failed' }));
  });

  it(`plus de ${MFA_MAX_ATTEMPTS_PER_LOGIN} essais : 429 et tentative de connexion annulée`, async () => {
    r.incr.mockResolvedValue(MFA_MAX_ATTEMPTS_PER_LOGIN + 1);

    await expect(auth.verifyMfa('temp-token', '654321', 'totp')).rejects.toMatchObject({ status: 429 });
    expect(mfa.verifyTotp).not.toHaveBeenCalled();
    expect(r.del).toHaveBeenCalledWith('mfa_temp:temp-token');
  });

  it('compte verrouillé : 423 sans vérifier le code', async () => {
    userMock.findUnique.mockResolvedValue({ ...adminTotp, lockedUntil: new Date(Date.now() + 600_000) });

    await expect(auth.verifyMfa('temp-token', '654321', 'totp')).rejects.toMatchObject({ status: 423 });
    expect(mfa.verifyTotp).not.toHaveBeenCalled();
  });

  it('code de récupération valide : connexion, audit et alerte e-mail', async () => {
    mfa.consumeRecoveryCode.mockResolvedValue(true);

    await auth.verifyMfa('temp-token', 'ABCDE-FGHJK', 'recovery');

    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.mfa.login_recovery' }));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'contact@blalinker.com' }));
  });

  it('code e-mail sans demande préalable de secours : refusé', async () => {
    await expect(auth.verifyMfa('temp-token', '123456', 'email')).rejects.toMatchObject({ status: 400 });
  });

  it('code e-mail après demande de secours : accepté', async () => {
    r.get.mockImplementation(async (key: string) =>
      key.startsWith('mfa_temp:') ? session('admin-1') : key.startsWith('mfa_email_fallback:') ? '1' : null);

    const res = await auth.verifyMfa('temp-token', '123456', 'email');

    expect(res).toHaveProperty('accessToken');
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.mfa.login_email' }));
  });
});

describe('requestMfaEmailFallback() — secours « pas accès à mon application »', () => {
  beforeEach(() => {
    r.get.mockResolvedValue(session('admin-1'));
    userMock.findUnique.mockResolvedValue(adminTotp);
  });

  it("envoie le code à l'adresse DU COMPTE uniquement, adresse masquée dans la réponse", async () => {
    const res = await auth.requestMfaEmailFallback('temp-token', '1.2.3.4');

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect((sendEmail as jest.Mock).mock.calls[0][0].to).toBe('contact@blalinker.com');
    expect(res).toEqual({ message: 'Code envoyé par e-mail.', sentTo: 'co***@blalinker.com', cooldownSeconds: 60, expiresInMinutes: 10 });
    expect(r.set).toHaveBeenCalledWith('mfa_email_cd:admin-1', '1', 'EX', 60, 'NX');
    expect(r.setex).toHaveBeenCalledWith('mfa_email_fallback:temp-token', 600, '1');
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.mfa.email_fallback_requested' }));
  });

  it('nouvelle demande avant 60 s : 429 avec délai restant, aucun e-mail', async () => {
    r.set.mockResolvedValue(null);
    r.ttl.mockResolvedValue(42);

    await expect(auth.requestMfaEmailFallback('temp-token', '1.2.3.4')).rejects.toMatchObject({ status: 429, retryAfter: 42 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('plus de 5 demandes dans l’heure : 429, aucun e-mail', async () => {
    r.incr.mockResolvedValue(6);

    await expect(auth.requestMfaEmailFallback('temp-token', '1.2.3.4')).rejects.toMatchObject({ status: 429, code: 'MFA_EMAIL_HOURLY_LIMIT' });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('compte sans adresse e-mail valide : 409, aucun envoi', async () => {
    userMock.findUnique.mockResolvedValue({ ...adminTotp, email: 'adresse-invalide' });

    await expect(auth.requestMfaEmailFallback('temp-token', '1.2.3.4')).rejects.toMatchObject({ status: 409, code: 'MFA_EMAIL_UNAVAILABLE' });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('réservé aux comptes avec application (un client a déjà reçu son code)', async () => {
    userMock.findUnique.mockResolvedValue(client);
    await expect(auth.requestMfaEmailFallback('temp-token', '1.2.3.4')).rejects.toMatchObject({ status: 400 });
  });

  it('session de connexion expirée : 401', async () => {
    r.get.mockResolvedValue(null);
    await expect(auth.requestMfaEmailFallback('temp-token', '1.2.3.4')).rejects.toMatchObject({ status: 401 });
  });

  it('échec Brevo : 503, et le délai de 60 s est levé pour permettre un nouvel essai', async () => {
    r.ttl.mockResolvedValue(-2); // aucun délai en cours (isolation du test précédent)
    (sendEmail as jest.Mock).mockResolvedValue(false);

    await expect(auth.requestMfaEmailFallback('temp-token', '1.2.3.4')).rejects.toMatchObject({ status: 503 });
    expect(r.del).toHaveBeenCalledWith('mfa_email_cd:admin-1');
    expect(r.setex).not.toHaveBeenCalledWith('mfa_email_fallback:temp-token', 600, '1');
  });
});

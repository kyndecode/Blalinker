/**
 * Phase 3a — canaux OTP (e-mail prioritaire, SMS seulement s'il est configuré),
 * journaux sans données personnelles, et durcissement de la connexion Google.
 * Aucun appel réel : Brevo, Twilio, Prisma, Redis et Google sont simulés.
 */
jest.mock('../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    JWT_ACCESS_EXPIRY: '15m',
    JWT_REFRESH_EXPIRY: '30d',
    ENCRYPTION_KEY: 'a'.repeat(64),
    BREVO_FROM_EMAIL: 'contact@blalinker.com',
    BREVO_FROM_NAME: 'BLA Services',
    ADMIN_EMAIL: 'contact@blalinker.com',
    MFA_ENABLED: true,
    GOOGLE_CLIENT_ID: undefined as string | undefined,
  },
}));

jest.mock('../../src/config/database', () => ({
  prisma: {
    user: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    userSession: { create: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    otpCode: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
    profile: { upsert: jest.fn() },
    providerProfile: { upsert: jest.fn() },
  },
}));

jest.mock('../../src/config/redis', () => ({
  redis: { set: jest.fn(), get: jest.fn(), del: jest.fn(), setex: jest.fn() },
}));

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../src/config/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
  emailTemplates: {
    otpRegister: jest.fn().mockReturnValue({ subject: 'OTP', html: '<p>test</p>' }),
    otpLogin: jest.fn().mockReturnValue({ subject: 'OTP', html: '<p>test</p>' }),
    otpPasswordReset: jest.fn().mockReturnValue({ subject: 'OTP', html: '<p>test</p>' }),
  },
}));

jest.mock('../../src/utils/sms.util', () => ({
  sendSMS: jest.fn().mockResolvedValue(true),
  isSmsConfigured: jest.fn().mockReturnValue(false),
}));

jest.mock('../../src/utils/jwt.util', () => ({
  signAccessToken: jest.fn().mockReturnValue('mock-access-token'),
  signRefreshToken: jest.fn().mockReturnValue('mock-refresh-token'),
  verifyRefreshToken: jest.fn(),
  revokeToken: jest.fn().mockResolvedValue(undefined),
  generateTokenFamily: jest.fn().mockReturnValue('mock-family'),
}));

jest.mock('../../src/utils/otp.util', () => ({
  generateOTP: jest.fn().mockReturnValue('123456'),
  hashOTP: jest.fn().mockResolvedValue('$2b$10$hashed'),
  verifyOTP: jest.fn().mockResolvedValue(true),
  otpExpiresAt: jest.fn().mockReturnValue(new Date(Date.now() + 600_000)),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$rotated-hash'),
  compare: jest.fn().mockResolvedValue(true),
}));

import axios from 'axios';
import { env } from '../../src/config/env';
import { prisma } from '../../src/config/database';
import { logger } from '../../src/config/logger';
import { sendEmail } from '../../src/config/email';
import { sendSMS, isSmsConfigured } from '../../src/utils/sms.util';
import { AuthService } from '../../src/modules/auth/auth.service';

const authService = new AuthService();
const mockUser = prisma.user as jest.Mocked<typeof prisma.user>;
const mockOtp = prisma.otpCode as jest.Mocked<typeof prisma.otpCode>;
const mutableEnv = env as unknown as { NODE_ENV: string; GOOGLE_CLIENT_ID?: string };

const EMAIL = 'awa.ndiaye@example.com';
const PHONE = '+221771234567';

const pendingUser = {
  id: 'user-1',
  email: EMAIL,
  phone: PHONE,
  role: 'client',
  status: 'pending',
  deletedAt: null,
};

/** Tout ce qui a été écrit dans les journaux, sérialisé. */
function allLogs(): string {
  const l = logger as unknown as Record<'info' | 'warn' | 'error' | 'debug', jest.Mock>;
  return JSON.stringify([l.info.mock.calls, l.warn.mock.calls, l.error.mock.calls, l.debug.mock.calls]);
}

beforeEach(() => {
  jest.clearAllMocks();
  (isSmsConfigured as jest.Mock).mockReturnValue(false);
  (sendEmail as jest.Mock).mockResolvedValue(true);
  (mockOtp.create as jest.Mock).mockResolvedValue({});
  (mockOtp.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
  (prisma.userSession.create as jest.Mock).mockResolvedValue({ id: 'session-1' });
  mutableEnv.NODE_ENV = 'test';
  mutableEnv.GOOGLE_CLIENT_ID = undefined;
});

describe('OTP — canaux de distribution', () => {
  it("SMS non configuré : Twilio n'est jamais appelé et l'OTP part par e-mail", async () => {
    (mockUser.findFirst as jest.Mock).mockResolvedValue(pendingUser);

    await authService.resendOtp(undefined, EMAIL, 'registration', '127.0.0.1');

    expect(sendSMS).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect((sendEmail as jest.Mock).mock.calls[0][0].to).toBe(EMAIL);
  });

  it('SMS configuré : comportement inchangé (SMS + e-mail)', async () => {
    (isSmsConfigured as jest.Mock).mockReturnValue(true);
    (mockUser.findFirst as jest.Mock).mockResolvedValue(pendingUser);

    await authService.resendOtp(undefined, EMAIL, 'registration', '127.0.0.1');

    expect(sendSMS).toHaveBeenCalledWith(PHONE, 'otp_register', ['123456']);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("e-mail en échec et SMS non configuré : 503 OTP_DELIVERY_FAILED, journaux sans donnée personnelle", async () => {
    (mockUser.findFirst as jest.Mock).mockResolvedValue(pendingUser);
    (sendEmail as jest.Mock).mockResolvedValue(false);

    await expect(authService.resendOtp(undefined, EMAIL, 'registration', '127.0.0.1')).rejects.toMatchObject({
      status: 503,
      code: 'OTP_DELIVERY_FAILED',
      message: 'Aucun canal OTP disponible. Utilisez un email valide ou contactez le support.',
    });
    expect(logger.error).toHaveBeenCalledWith(
      'OTP non délivré : aucun canal disponible',
      expect.objectContaining({ email: 'échec', sms: 'non configuré' }),
    );
    expect(allLogs()).not.toContain(EMAIL);
    expect(allLogs()).not.toContain(PHONE);
  });

  it('compte sans e-mail et SMS non configuré : 503 sans appel à Twilio', async () => {
    (mockUser.findFirst as jest.Mock).mockResolvedValue({ ...pendingUser, email: null });

    await expect(authService.resendOtp(PHONE, undefined, 'registration', '127.0.0.1')).rejects.toMatchObject({
      status: 503,
    });
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it('mot de passe oublié : réponse générique inchangée même si l’envoi échoue', async () => {
    (mockUser.findFirst as jest.Mock).mockResolvedValue({ ...pendingUser, status: 'active' });
    (sendEmail as jest.Mock).mockResolvedValue(false);

    const result = await authService.forgotPassword(undefined, EMAIL, '127.0.0.1');

    expect(result).toEqual({ message: 'Si un compte correspond, un code de réinitialisation a été envoyé.' });
    expect(logger.error).toHaveBeenCalledWith('Échec envoi OTP de réinitialisation', expect.any(Object));
  });

  it('mot de passe oublié : envoi à l’adresse du compte', async () => {
    (mockUser.findFirst as jest.Mock).mockResolvedValue({ ...pendingUser, status: 'active' });

    await authService.forgotPassword(undefined, EMAIL, '127.0.0.1');

    expect((sendEmail as jest.Mock).mock.calls[0][0].to).toBe(EMAIL);
  });
});

describe('Connexion Google — durcissement', () => {
  const googlePayload = (overrides: Record<string, unknown> = {}) => ({
    data: {
      aud: 'bla-client-id.apps.googleusercontent.com',
      iss: 'https://accounts.google.com',
      sub: 'google-sub-1',
      exp: String(Math.floor(Date.now() / 1000) + 3600),
      email: EMAIL,
      email_verified: 'true',
      given_name: 'Awa',
      family_name: 'Ndiaye',
      ...overrides,
    },
  });
  const input = { idToken: 'x'.repeat(40), role: 'client' as const, countryCode: 'SN' };

  let axiosGet: jest.SpyInstance;
  beforeEach(() => {
    axiosGet = jest.spyOn(axios, 'get').mockResolvedValue(googlePayload());
  });
  afterEach(() => axiosGet.mockRestore());

  it.each(['admin', 'super_admin'])('refuse un compte %s (contournement du mot de passe et du MFA)', async (role) => {
    (mockUser.findFirst as jest.Mock).mockResolvedValue({ ...pendingUser, role, status: 'active' });

    await expect(authService.googleLogin(input, '127.0.0.1')).rejects.toMatchObject({
      status: 403,
      code: 'GOOGLE_LOGIN_ADMIN_FORBIDDEN',
    });
    expect(mockUser.update).not.toHaveBeenCalled();
  });

  it('ne réactive pas un compte suspendu', async () => {
    (mockUser.findFirst as jest.Mock).mockResolvedValue({ ...pendingUser, status: 'suspended' });

    await expect(authService.googleLogin(input, '127.0.0.1')).rejects.toMatchObject({ status: 403 });
    expect(mockUser.update).not.toHaveBeenCalled();
  });

  it('refuse toujours un compte banni', async () => {
    (mockUser.findFirst as jest.Mock).mockResolvedValue({ ...pendingUser, status: 'banned' });

    await expect(authService.googleLogin(input, '127.0.0.1')).rejects.toMatchObject({ status: 403 });
    expect(mockUser.update).not.toHaveBeenCalled();
  });

  it('compte actif : connexion sans changement de statut', async () => {
    const active = { ...pendingUser, status: 'active' };
    (mockUser.findFirst as jest.Mock).mockResolvedValue(active);
    (mockUser.update as jest.Mock).mockResolvedValue(active);

    const result = await authService.googleLogin(input, '127.0.0.1');

    expect(result.mfaRequired).toBe(false);
    const data = (mockUser.update as jest.Mock).mock.calls[0][0].data;
    expect(data).not.toHaveProperty('status');
    expect(data).not.toHaveProperty('passwordHash');
  });

  it('compte en attente : activé avec renouvellement du mot de passe local', async () => {
    (mockUser.findFirst as jest.Mock).mockResolvedValue(pendingUser);
    (mockUser.update as jest.Mock).mockResolvedValue({ ...pendingUser, status: 'active' });

    await authService.googleLogin(input, '127.0.0.1');

    const data = (mockUser.update as jest.Mock).mock.calls[0][0].data;
    expect(data.status).toBe('active');
    expect(data.passwordHash).toBe('$2b$12$rotated-hash');
    expect(mockOtp.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', purpose: 'registration', usedAt: null },
    });
  });

  it('production sans GOOGLE_CLIENT_ID : refus 503 sans interroger Google', async () => {
    mutableEnv.NODE_ENV = 'production';

    await expect(authService.googleLogin(input, '127.0.0.1')).rejects.toMatchObject({
      status: 503,
      code: 'GOOGLE_LOGIN_NOT_CONFIGURED',
    });
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('jeton émis pour une autre application (audience différente) : refusé', async () => {
    mutableEnv.GOOGLE_CLIENT_ID = 'bla-client-id.apps.googleusercontent.com';
    axiosGet.mockResolvedValue(googlePayload({ aud: 'autre-application.apps.googleusercontent.com' }));

    await expect(authService.googleLogin(input, '127.0.0.1')).rejects.toMatchObject({ status: 401 });
    expect(mockUser.findFirst).not.toHaveBeenCalled();
  });

  it('jeton expiré : refusé', async () => {
    axiosGet.mockResolvedValue(googlePayload({ exp: String(Math.floor(Date.now() / 1000) - 10) }));

    await expect(authService.googleLogin(input, '127.0.0.1')).rejects.toMatchObject({ status: 401 });
  });

  it('adresse Google non vérifiée : refusée', async () => {
    axiosGet.mockResolvedValue(googlePayload({ email_verified: 'false' }));

    await expect(authService.googleLogin(input, '127.0.0.1')).rejects.toMatchObject({ status: 401 });
  });
});

// ─── Mocks déclarés avant tout import (Jest les hisse automatiquement) ────────

jest.mock('../../src/config/env', () => ({
  env: {
    NODE_ENV:        'test',
    PORT:            3000,
    APP_URL:         'http://localhost:3000',
    CORS_ORIGIN:     'http://localhost:5173',
    DATABASE_URL:    'postgresql://test:test@localhost:5432/test',
    REDIS_URL:       'redis://localhost:6379',
    JWT_PRIVATE_KEY: 'test-private-key',
    JWT_PUBLIC_KEY:  'test-public-key',
    JWT_ACCESS_EXPIRY:  '15m',
    JWT_REFRESH_EXPIRY: '30d',
    ENCRYPTION_KEY:  'a'.repeat(64),
    BREVO_FROM_EMAIL: 'noreply@bla-app.com',
    BREVO_FROM_NAME:  'BLA Services',
    ADMIN_EMAIL:     'admin@bla-app.com',
    ADMIN_PASSWORD:  'BlaAdmin2024!',
    AI_SERVICE_URL:  'http://localhost:8000',
  },
}));

jest.mock('../../src/config/database', () => ({
  prisma: {
    user:        { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    userSession: { create: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    otpCode:     { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
  },
}));

jest.mock('../../src/config/redis', () => ({
  redis: { set: jest.fn(), get: jest.fn(), del: jest.fn(), setex: jest.fn() },
}));

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../src/config/email', () => ({
  sendEmail:      jest.fn().mockResolvedValue(undefined),
  emailTemplates: {
    otpRegister:      jest.fn().mockReturnValue({ subject: 'OTP', html: '<p>test</p>' }),
    otpLogin:         jest.fn().mockReturnValue({ subject: 'OTP', html: '<p>test</p>' }),
    otpPasswordReset: jest.fn().mockReturnValue({ subject: 'OTP', html: '<p>test</p>' }),
  },
}));

jest.mock('../../src/utils/sms.util', () => ({
  sendSMS: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/utils/jwt.util', () => ({
  signAccessToken:     jest.fn().mockReturnValue('mock-access-token'),
  signRefreshToken:    jest.fn().mockReturnValue('mock-refresh-token'),
  verifyRefreshToken:  jest.fn(),
  revokeToken:         jest.fn().mockResolvedValue(undefined),
  generateTokenFamily: jest.fn().mockReturnValue('mock-family'),
}));

jest.mock('../../src/utils/otp.util', () => ({
  generateOTP:  jest.fn().mockReturnValue('123456'),
  hashOTP:      jest.fn().mockResolvedValue('$2b$10$hashed'),
  verifyOTP:    jest.fn().mockResolvedValue(true),
  otpExpiresAt: jest.fn().mockReturnValue(new Date(Date.now() + 600_000)),
}));

jest.mock('bcryptjs', () => ({
  hash:    jest.fn().mockResolvedValue('$2b$12$hashed-password'),
  compare: jest.fn().mockResolvedValue(true),
}));

// ─── Imports ───────────────────────────────────────────────────────────────────
import { prisma }      from '../../src/config/database';
import { redis }       from '../../src/config/redis';
import { AuthService } from '../../src/modules/auth/auth.service';

const authService = new AuthService();

// Helpers pour les casts
const mockUser    = prisma.user        as jest.Mocked<typeof prisma.user>;
const mockSession = prisma.userSession as jest.Mocked<typeof prisma.userSession>;
const mockOtp     = prisma.otpCode     as jest.Mocked<typeof prisma.otpCode>;
const mockRedis   = redis              as jest.Mocked<typeof redis>;

// ─── Données de test ───────────────────────────────────────────────────────────
const USER_ID   = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SESSION_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const fakeUser = {
  id:           USER_ID,
  phone:        '+221770000000',
  email:        'client@example.com',
  passwordHash: '$2b$12$hashed-password',
  role:         'client' as const,
  status:       'active' as const,
  mfaEnabled:   false,
  deletedAt:    null,
  lockedUntil:  null,
  loginAttempts: 0,
};

const fakeOtp = {
  id:        'otp-id',
  userId:    USER_ID,
  codeHash:  '$2b$10$hashed',
  purpose:   'registration' as const,
  expiresAt: new Date(Date.now() + 600_000),
  usedAt:    null,
  attempts:  0,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuthService', () => {

  beforeEach(() => jest.clearAllMocks());

  // ─── register() ────────────────────────────────────────────
  describe('register()', () => {
    const input = { phone: '+221770000000', email: 'new@test.com', password: 'Secret123!', role: 'client' as const };

    it('crée le compte et retourne un message de confirmation', async () => {
      (mockUser.findFirst as jest.Mock).mockResolvedValue(null);
      (mockUser.create   as jest.Mock).mockResolvedValue({ id: USER_ID, role: 'client' });
      (mockOtp.create    as jest.Mock).mockResolvedValue({});

      const result = await authService.register(input, '127.0.0.1');

      expect(result.message).toMatch(/Compte créé/);
      expect(mockUser.create).toHaveBeenCalledTimes(1);
    });

    it('lève 409 si téléphone déjà utilisé', async () => {
      (mockUser.findFirst as jest.Mock).mockResolvedValue({ ...fakeUser, phone: input.phone });

      await expect(authService.register(input, '127.0.0.1'))
        .rejects.toMatchObject({ status: 409 });

      expect(mockUser.create).not.toHaveBeenCalled();
    });

    it('lève 409 si email déjà utilisé', async () => {
      (mockUser.findFirst as jest.Mock).mockResolvedValue({ ...fakeUser, phone: null, email: input.email });

      await expect(authService.register(input, '127.0.0.1'))
        .rejects.toMatchObject({ status: 409 });
    });
  });

  // ─── login() ───────────────────────────────────────────────
  describe('login()', () => {
    const credentials = { phone: '+221770000000', password: 'Secret123!' };

    it('retourne les tokens JWT si MFA désactivé', async () => {
      (mockUser.findFirst as jest.Mock).mockResolvedValue({ ...fakeUser, mfaEnabled: false });
      (mockUser.update   as jest.Mock).mockResolvedValue(fakeUser);
      (mockSession.create as jest.Mock).mockResolvedValue({ id: SESSION_ID });

      const result = await authService.login(credentials, '127.0.0.1');

      expect(result.mfaRequired).toBe(false);
      expect(result).toHaveProperty('accessToken');
    });

    it('retourne mfaRequired=true si MFA activé', async () => {
      (mockUser.findFirst as jest.Mock).mockResolvedValue({ ...fakeUser, mfaEnabled: true });
      (mockUser.update   as jest.Mock).mockResolvedValue(fakeUser);
      (mockOtp.create    as jest.Mock).mockResolvedValue({});
      (mockRedis.setex   as jest.Mock).mockResolvedValue('OK');

      const result = await authService.login(credentials, '127.0.0.1');

      expect(result.mfaRequired).toBe(true);
      expect(result).toHaveProperty('tempToken');
    });

    it('lève 401 si utilisateur introuvable', async () => {
      (mockUser.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(authService.login(credentials, '127.0.0.1'))
        .rejects.toMatchObject({ status: 401 });
    });

    it('lève 401 si mot de passe incorrect', async () => {
      (mockUser.findFirst as jest.Mock).mockResolvedValue(fakeUser);
      const bcrypt = require('bcryptjs');
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);
      (mockUser.update as jest.Mock).mockResolvedValue(fakeUser);

      await expect(authService.login(credentials, '127.0.0.1'))
        .rejects.toMatchObject({ status: 401 });
    });

    it('lève 423 si compte verrouillé', async () => {
      const lockedUser = { ...fakeUser, lockedUntil: new Date(Date.now() + 30 * 60_000) };
      (mockUser.findFirst as jest.Mock).mockResolvedValue(lockedUser);

      await expect(authService.login(credentials, '127.0.0.1'))
        .rejects.toMatchObject({ status: 423 });
    });
  });

  // ─── verifyRegistration() ──────────────────────────────────
  describe('verifyRegistration()', () => {
    it('active le compte et retourne les tokens si OTP correct', async () => {
      (mockUser.findFirst  as jest.Mock).mockResolvedValue({ ...fakeUser, status: 'pending' });
      (mockOtp.findFirst   as jest.Mock).mockResolvedValue(fakeOtp);
      (mockOtp.update      as jest.Mock).mockResolvedValue({});
      (mockUser.update     as jest.Mock).mockResolvedValue({ ...fakeUser, status: 'active' });
      (mockSession.create  as jest.Mock).mockResolvedValue({ id: SESSION_ID });

      const result = await authService.verifyRegistration(fakeUser.phone, undefined, '123456');

      expect(result).toHaveProperty('accessToken');
      expect(mockUser.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'active' }) })
      );
    });

    it('lève 404 si utilisateur introuvable', async () => {
      (mockUser.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(authService.verifyRegistration('+221770000000', undefined, '000000'))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ─── refreshTokens() ───────────────────────────────────────
  describe('refreshTokens()', () => {
    it('lève 401 si refresh token invalide', async () => {
      const { verifyRefreshToken } = require('../../src/utils/jwt.util');
      (verifyRefreshToken as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Token expiré');
      });

      await expect(authService.refreshTokens('invalid-token'))
        .rejects.toMatchObject({ status: 401 });
    });

    it('lève 401 si session introuvable (token volé)', async () => {
      const { verifyRefreshToken } = require('../../src/utils/jwt.util');
      (verifyRefreshToken as jest.Mock).mockReturnValueOnce({ userId: USER_ID, sessionId: SESSION_ID });
      (mockSession.findFirst as jest.Mock).mockResolvedValue(null);
      (mockSession.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

      await expect(authService.refreshTokens('stolen-token'))
        .rejects.toMatchObject({ status: 401 });
    });
  });
});

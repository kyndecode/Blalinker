jest.mock('../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3000,
    APP_URL: 'http://localhost:3000',
    CORS_ORIGIN: 'http://localhost:5173',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_PRIVATE_KEY: 'test-private-key',
    JWT_PUBLIC_KEY: 'test-public-key',
    JWT_ACCESS_EXPIRY: '15m',
    JWT_REFRESH_EXPIRY: '30d',
    ENCRYPTION_KEY: 'a'.repeat(64),
    BREVO_FROM_EMAIL: 'noreply@bla-app.com',
    BREVO_FROM_NAME: 'BLA Services',
    ADMIN_EMAIL: 'admin@bla-app.com',
    ADMIN_PASSWORD: 'BlaAdmin2024!',
    AI_SERVICE_URL: 'http://localhost:8000',
  },
}));

jest.mock('../../src/config/database', () => ({
  prisma: {
    user: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    userSession: {
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    otpCode: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
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
  hash: jest.fn().mockResolvedValue('$2b$12$hashed-password'),
  compare: jest.fn().mockResolvedValue(true),
}));

import { prisma } from '../../src/config/database';
import { redis } from '../../src/config/redis';
import { AuthService } from '../../src/modules/auth/auth.service';

const authService = new AuthService();

const mockUser = prisma.user as jest.Mocked<typeof prisma.user>;
const mockSession = prisma.userSession as jest.Mocked<typeof prisma.userSession>;
const mockOtp = prisma.otpCode as jest.Mocked<typeof prisma.otpCode>;
const mockRedis = redis as jest.Mocked<typeof redis>;

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SESSION_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const fakeUser = {
  id: USER_ID,
  phone: '+221770000000',
  email: 'client@example.com',
  passwordHash: '$2b$12$hashed-password',
  role: 'client' as const,
  status: 'active' as const,
  mfaEnabled: false,
  deletedAt: null,
  lockedUntil: null,
  loginAttempts: 0,
};

const fakeOtp = {
  id: 'otp-id',
  userId: USER_ID,
  codeHash: '$2b$10$hashed',
  purpose: 'registration' as const,
  expiresAt: new Date(Date.now() + 600_000),
  usedAt: null,
  attempts: 0,
};

describe('AuthService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('register()', () => {
    const input = {
      firstName: 'Awa',
      lastName: 'Ndiaye',
      countryCode: 'SN',
      phone: '+221770000000',
      email: 'new@test.com',
      password: 'Secret123!',
      role: 'client' as const,
    };

    it('creates account and sends OTP', async () => {
      (mockUser.findFirst as jest.Mock).mockResolvedValue(null);
      (mockUser.create as jest.Mock).mockResolvedValue({ id: USER_ID, role: 'client' });
      (mockOtp.create as jest.Mock).mockResolvedValue({});

      const result = await authService.register(input, '127.0.0.1');

      expect(result.message).toMatch(/Compte/);
      expect(mockUser.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          phone: input.phone,
          email: input.email,
          role: 'client',
          profile: {
            create: {
              firstName: input.firstName,
              lastName: input.lastName,
              country: input.countryCode,
            },
          },
        }),
      }));
    });

    it('throws 409 if phone already exists', async () => {
      (mockUser.findFirst as jest.Mock).mockResolvedValue({ ...fakeUser, phone: input.phone });

      await expect(authService.register(input, '127.0.0.1')).rejects.toMatchObject({ status: 409 });
      expect(mockUser.create).not.toHaveBeenCalled();
    });

    it('throws 409 if email already exists', async () => {
      (mockUser.findFirst as jest.Mock).mockResolvedValue({ ...fakeUser, phone: null, email: input.email });

      await expect(authService.register(input, '127.0.0.1')).rejects.toMatchObject({ status: 409 });
      expect(mockUser.create).not.toHaveBeenCalled();
    });

    it('resends OTP when existing account is pending', async () => {
      (mockUser.findFirst as jest.Mock).mockResolvedValue({ ...fakeUser, status: 'pending' });
      (mockOtp.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
      (mockOtp.create as jest.Mock).mockResolvedValue({});

      const result = await authService.register(input, '127.0.0.1');

      expect(result.message).toMatch(/OTP/);
      expect(mockUser.create).not.toHaveBeenCalled();
      expect(mockOtp.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: USER_ID,
            purpose: 'registration',
            usedAt: null,
          }),
        })
      );
      expect(mockOtp.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('login()', () => {
    const credentials = { phone: '+221770000000', password: 'Secret123!' };

    it('returns tokens when MFA disabled', async () => {
      (mockUser.findFirst as jest.Mock).mockResolvedValue({ ...fakeUser, mfaEnabled: false });
      (mockUser.update as jest.Mock).mockResolvedValue(fakeUser);
      (mockSession.create as jest.Mock).mockResolvedValue({ id: SESSION_ID });

      const result = await authService.login(credentials, '127.0.0.1');

      expect(result.mfaRequired).toBe(false);
      expect(result).toHaveProperty('accessToken');
    });

    it('returns mfaRequired when MFA enabled', async () => {
      (mockUser.findFirst as jest.Mock).mockResolvedValue({ ...fakeUser, mfaEnabled: true });
      (mockUser.update as jest.Mock).mockResolvedValue(fakeUser);
      (mockOtp.create as jest.Mock).mockResolvedValue({});
      (mockRedis.setex as jest.Mock).mockResolvedValue('OK');

      const result = await authService.login(credentials, '127.0.0.1');

      expect(result.mfaRequired).toBe(true);
      expect(result).toHaveProperty('tempToken');
    });

    it('throws 401 when user is not found', async () => {
      (mockUser.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(authService.login(credentials, '127.0.0.1')).rejects.toMatchObject({ status: 401 });
    });

    it('throws 401 when password is wrong', async () => {
      (mockUser.findFirst as jest.Mock).mockResolvedValue(fakeUser);
      const bcrypt = require('bcryptjs');
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);
      (mockUser.update as jest.Mock).mockResolvedValue(fakeUser);

      await expect(authService.login(credentials, '127.0.0.1')).rejects.toMatchObject({ status: 401 });
    });

    it('throws 423 when account is locked', async () => {
      const lockedUser = { ...fakeUser, lockedUntil: new Date(Date.now() + 30 * 60_000) };
      (mockUser.findFirst as jest.Mock).mockResolvedValue(lockedUser);

      await expect(authService.login(credentials, '127.0.0.1')).rejects.toMatchObject({ status: 423 });
    });
  });

  describe('verifyRegistration()', () => {
    it('activates user and returns tokens with valid OTP', async () => {
      (mockUser.findFirst as jest.Mock).mockResolvedValue({ ...fakeUser, status: 'pending' });
      (mockOtp.findFirst as jest.Mock).mockResolvedValue(fakeOtp);
      (mockOtp.update as jest.Mock).mockResolvedValue({});
      (mockUser.update as jest.Mock).mockResolvedValue({ ...fakeUser, status: 'active' });
      (mockSession.create as jest.Mock).mockResolvedValue({ id: SESSION_ID });

      const result = await authService.verifyRegistration(fakeUser.phone, undefined, '123456');

      expect(result).toHaveProperty('accessToken');
      expect(mockUser.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'active' }) })
      );
    });

    it('throws 404 when user is not found', async () => {
      (mockUser.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(authService.verifyRegistration('+221770000000', undefined, '000000'))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  describe('resendOtp()', () => {
    it('sends a new OTP for pending account', async () => {
      (mockUser.findFirst as jest.Mock).mockResolvedValue({ ...fakeUser, status: 'pending' });
      (mockOtp.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
      (mockOtp.create as jest.Mock).mockResolvedValue({});

      const result = await authService.resendOtp(fakeUser.phone, undefined, 'registration', '127.0.0.1');

      expect(result.message).toMatch(/Nouveau code/);
      expect(mockOtp.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ userId: USER_ID, purpose: 'registration' }),
      }));
      expect(mockOtp.create).toHaveBeenCalledTimes(1);
    });

    it('throws 409 when account is already active', async () => {
      (mockUser.findFirst as jest.Mock).mockResolvedValue({ ...fakeUser, status: 'active' });

      await expect(authService.resendOtp(fakeUser.phone, undefined, 'registration', '127.0.0.1'))
        .rejects.toMatchObject({ status: 409 });

      expect(mockOtp.create).not.toHaveBeenCalled();
    });

    it('throws 404 when user is not found', async () => {
      (mockUser.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(authService.resendOtp('+221790000000', undefined, 'registration', '127.0.0.1'))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  describe('refreshTokens()', () => {
    it('throws 401 on invalid refresh token', async () => {
      const { verifyRefreshToken } = require('../../src/utils/jwt.util');
      (verifyRefreshToken as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Token expiré');
      });

      await expect(authService.refreshTokens('invalid-token')).rejects.toMatchObject({ status: 401 });
    });

    it('throws 401 when session is missing', async () => {
      const { verifyRefreshToken } = require('../../src/utils/jwt.util');
      (verifyRefreshToken as jest.Mock).mockReturnValueOnce({ userId: USER_ID, sessionId: SESSION_ID });
      (mockSession.findFirst as jest.Mock).mockResolvedValue(null);
      (mockSession.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

      await expect(authService.refreshTokens('stolen-token')).rejects.toMatchObject({ status: 401 });
    });
  });
});

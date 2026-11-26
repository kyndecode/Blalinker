/**
 * Garde ADMIN_TOTP_REQUIRED : sans effet par défaut ; une fois activé, un admin
 * sans application d'authentification est refusé sur /admin (403 MFA_SETUP_REQUIRED).
 */
jest.mock('../../src/config/env', () => ({ env: { ADMIN_TOTP_REQUIRED: false } }));
jest.mock('../../src/config/database', () => ({ prisma: { user: { findFirst: jest.fn() } } }));
jest.mock('../../src/config/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('../../src/utils/jwt.util', () => ({ verifyAccessToken: jest.fn(), isTokenRevoked: jest.fn() }));
jest.mock('../../src/middlewares/security.middleware', () => ({ makeStore: () => undefined }));

import type { Request, Response } from 'express';
import { env } from '../../src/config/env';
import { requireAdminTotpWhenEnforced } from '../../src/middlewares/auth.middleware';

const mutableEnv = env as unknown as { ADMIN_TOTP_REQUIRED: boolean };

function run(user: Request['user']) {
  const next = jest.fn();
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  requireAdminTotpWhenEnforced({ user } as Request, res, next);
  return { next, res: res as unknown as { status: jest.Mock; json: jest.Mock } };
}

const adminWithout = { id: 'a', role: 'super_admin', status: 'active', permissions: [], totpEnabled: false };

afterEach(() => { mutableEnv.ADMIN_TOTP_REQUIRED = false; });

describe('requireAdminTotpWhenEnforced', () => {
  it('par défaut (variable absente) : aucun effet', () => {
    const { next, res } = run(adminWithout);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('activé : admin sans application → 403 MFA_SETUP_REQUIRED', () => {
    mutableEnv.ADMIN_TOTP_REQUIRED = true;
    const { next, res } = run(adminWithout);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'MFA_SETUP_REQUIRED' }));
  });

  it('activé : admin avec application → accès', () => {
    mutableEnv.ADMIN_TOTP_REQUIRED = true;
    const { next } = run({ ...adminWithout, totpEnabled: true });
    expect(next).toHaveBeenCalled();
  });
});

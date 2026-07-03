// Vérifie le middleware RBAC requirePermission + les presets de rôles.
import type { Request, Response } from 'express';
import { requirePermission } from '../../src/middlewares/auth.middleware';
import { PERMISSIONS, presetPermissions, sanitizePermissions } from '../../src/config/permissions';

function makeCtx(user?: { role: string; permissions: string[] }) {
  const req = { user } as unknown as Request;
  let statusCode = 200;
  const res = {} as Record<string, unknown>;
  res.status = (code: number) => { statusCode = code; return res; };
  res.json = () => res;
  const next = jest.fn();
  return { req, res: res as unknown as Response, next, getStatus: () => statusCode };
}

describe('requirePermission (RBAC)', () => {
  it('laisse passer un super_admin sans permission explicite', () => {
    const { req, res, next } = makeCtx({ role: 'super_admin', permissions: [] });
    requirePermission(PERMISSIONS.USERS_DELETE)(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('refuse (403) un admin sans la permission requise', () => {
    const { req, res, next, getStatus } = makeCtx({ role: 'admin', permissions: [] });
    requirePermission(PERMISSIONS.USERS_SUSPEND)(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(getStatus()).toBe(403);
  });

  it('laisse passer un admin qui possède la permission', () => {
    const { req, res, next } = makeCtx({ role: 'admin', permissions: [PERMISSIONS.USERS_SUSPEND] });
    requirePermission(PERMISSIONS.USERS_SUSPEND)(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('refuse (401) sans utilisateur authentifié', () => {
    const { req, res, next, getStatus } = makeCtx(undefined);
    requirePermission(PERMISSIONS.STATS_READ)(req, res, next);
    expect(getStatus()).toBe(401);
  });

  it('exige TOUTES les permissions listées', () => {
    const { req, res, next, getStatus } = makeCtx({ role: 'admin', permissions: [PERMISSIONS.PAYMENTS_READ] });
    requirePermission(PERMISSIONS.PAYMENTS_READ, PERMISSIONS.PAYMENTS_REFUND)(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(getStatus()).toBe(403);
  });
});

describe('presets de rôles', () => {
  it('sanitizePermissions ne garde que les permissions connues', () => {
    expect(sanitizePermissions(['users.read', 'bogus', 123, 'payments.refund']))
      .toEqual(['users.read', 'payments.refund']);
  });

  it('presetPermissions retourne les droits du rôle, [] si inconnu', () => {
    expect(presetPermissions('auditor')).toContain(PERMISSIONS.AUDIT_READ);
    expect(presetPermissions('kyc_manager')).toContain(PERMISSIONS.PROVIDERS_VERIFY);
    expect(presetPermissions('role-inexistant')).toEqual([]);
  });
});

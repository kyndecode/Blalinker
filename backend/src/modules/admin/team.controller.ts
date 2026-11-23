import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { getPaginationParams, getSkip, paginate } from '../../utils/pagination.util';
import { auditFromReq } from '../../utils/audit.util';
import { mfaService } from '../auth/mfa.service';
import {
  ALL_PERMISSIONS,
  ROLE_PRESETS,
  ROLE_LABELS,
  presetPermissions,
  sanitizePermissions,
  PERMISSIONS,
} from '../../config/permissions';
import type { CreateAdminInput, UpdateAdminInput, ResetAdminPasswordInput } from './team.schemas';

const ADMIN_ROLES = ['admin', 'super_admin'] as const;

function isSuperAdmin(req: Request): boolean {
  return req.user?.role === 'super_admin';
}

/** Résout l'ensemble de permissions à partir d'un preset et/ou d'une liste explicite. */
function resolvePermissions(preset?: string, explicit?: unknown): string[] {
  const base = preset ? presetPermissions(preset) : [];
  const extra = explicit !== undefined ? sanitizePermissions(explicit) : [];
  return Array.from(new Set([...base, ...extra]));
}

export const teamController = {
  /** GET /admin/team/meta — catalogue des permissions + presets (pour l'UI) */
  async meta(_req: Request, res: Response) {
    return res.json({
      permissions: ALL_PERMISSIONS,
      presets: Object.entries(ROLE_PRESETS).map(([key, perms]) => ({
        key,
        label: ROLE_LABELS[key] ?? key,
        permissions: perms,
      })),
    });
  },

  /** GET /admin/team — liste des membres de l'équipe admin */
  async list(req: Request, res: Response) {
    const { page, limit } = getPaginationParams(req.query as Record<string, unknown>);
    const where = { role: { in: [...ADMIN_ROLES] }, deletedAt: null };
    try {
      const [rows, total] = await Promise.all([
        prisma.user.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: getSkip({ page, limit }),
          take: limit,
          select: {
            id: true, email: true, role: true, status: true, adminTitle: true,
            permissions: true, lastLoginAt: true, createdAt: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        }),
        prisma.user.count({ where }),
      ]);
      return res.json(paginate(rows, total, { page, limit }));
    } catch (err) {
      logger.error('Erreur liste équipe admin', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** POST /admin/team — créer un membre admin (Manager, Support, KYC…) */
  async create(req: Request, res: Response) {
    const data = req.body as CreateAdminInput;

    // Seul un super_admin peut créer un super_admin ou accorder la gestion des admins
    const wantsSuper = data.role === 'super_admin';
    const permissions = resolvePermissions(data.preset, data.permissions);
    if ((wantsSuper || permissions.includes(PERMISSIONS.ADMINS_MANAGE)) && !isSuperAdmin(req)) {
      return res.status(403).json({ error: 'Seul le super administrateur peut accorder ce niveau de droits.' });
    }

    try {
      const exists = await prisma.user.findFirst({ where: { email: data.email }, select: { id: true } });
      if (exists) return res.status(409).json({ error: 'Cet email est déjà utilisé' });

      const passwordHash = await bcrypt.hash(data.password, 12);
      const created = await prisma.user.create({
        data: {
          email: data.email,
          passwordHash,
          role: wantsSuper ? 'super_admin' : 'admin',
          status: 'active',
          // MFA actif dès la création : OTP e-mail jusqu'à la configuration de l'application.
          mfaEnabled: true,
          permissions,
          adminTitle: data.adminTitle ?? (data.preset ? ROLE_LABELS[data.preset] : 'Administrateur'),
          profile: { create: { firstName: data.firstName, lastName: data.lastName, country: 'CI', idVerified: true } },
        },
        select: { id: true, email: true, role: true, adminTitle: true, permissions: true },
      });

      await auditFromReq(req, 'admin.team.create', { entity: 'user', entityId: created.id, newData: { role: created.role, permissions } });
      return res.status(201).json({ message: 'Membre admin créé', member: created });
    } catch (err) {
      logger.error('Erreur création membre admin', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** PATCH /admin/team/:id — modifier droits / titre / statut */
  async update(req: Request, res: Response) {
    const { id } = req.params;
    const data = req.body as UpdateAdminInput;

    try {
      const target = await prisma.user.findFirst({
        where: { id, role: { in: [...ADMIN_ROLES] }, deletedAt: null },
        select: { id: true, role: true, permissions: true },
      });
      if (!target) return res.status(404).json({ error: 'Membre admin introuvable' });

      // Protéger les super_admin : modifiables uniquement par un super_admin
      if (target.role === 'super_admin' && !isSuperAdmin(req)) {
        return res.status(403).json({ error: 'Action réservée au super administrateur' });
      }

      const update: Record<string, unknown> = {};
      if (data.adminTitle !== undefined) update.adminTitle = data.adminTitle;
      if (data.status !== undefined) update.status = data.status;
      if (data.preset !== undefined || data.permissions !== undefined) {
        const permissions = resolvePermissions(data.preset, data.permissions);
        if (permissions.includes(PERMISSIONS.ADMINS_MANAGE) && !isSuperAdmin(req)) {
          return res.status(403).json({ error: 'Seul le super administrateur peut accorder la gestion des admins.' });
        }
        update.permissions = permissions;
      }

      const updated = await prisma.user.update({
        where: { id },
        data: update,
        select: { id: true, email: true, role: true, status: true, adminTitle: true, permissions: true },
      });

      await auditFromReq(req, 'admin.team.update', { entity: 'user', entityId: id, oldData: target, newData: update });
      return res.json({ message: 'Membre mis à jour', member: updated });
    } catch (err) {
      logger.error('Erreur mise à jour membre admin', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** DELETE /admin/team/:id — supprimer (soft delete) un membre admin */
  async remove(req: Request, res: Response) {
    const { id } = req.params;
    if (id === req.user!.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
    }
    try {
      const target = await prisma.user.findFirst({
        where: { id, role: { in: [...ADMIN_ROLES] }, deletedAt: null },
        select: { id: true, role: true },
      });
      if (!target) return res.status(404).json({ error: 'Membre admin introuvable' });

      if (target.role === 'super_admin') {
        if (!isSuperAdmin(req)) {
          return res.status(403).json({ error: 'Action réservée au super administrateur' });
        }
        const superCount = await prisma.user.count({ where: { role: 'super_admin', deletedAt: null } });
        if (superCount <= 1) {
          return res.status(400).json({ error: 'Impossible de supprimer le dernier super administrateur.' });
        }
      }

      await prisma.$transaction([
        prisma.user.update({ where: { id }, data: { deletedAt: new Date(), status: 'suspended' } }),
        prisma.userSession.deleteMany({ where: { userId: id } }),
      ]);

      await auditFromReq(req, 'admin.team.delete', { entity: 'user', entityId: id });
      return res.json({ message: 'Membre supprimé' });
    } catch (err) {
      logger.error('Erreur suppression membre admin', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** POST /admin/team/:id/force-logout — révoque toutes les sessions du membre */
  async forceLogout(req: Request, res: Response) {
    const { id } = req.params;
    try {
      await prisma.userSession.deleteMany({ where: { userId: id } });
      await auditFromReq(req, 'admin.team.force_logout', { entity: 'user', entityId: id });
      return res.json({ message: 'Sessions révoquées' });
    } catch (err) {
      logger.error('Erreur force logout', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** POST /admin/team/:id/reset-password — réinitialise le mot de passe d'un membre */
  async resetPassword(req: Request, res: Response) {
    const { id } = req.params;
    const data = req.body as ResetAdminPasswordInput;
    try {
      const target = await prisma.user.findFirst({
        where: { id, role: { in: [...ADMIN_ROLES] }, deletedAt: null },
        select: { id: true, role: true },
      });
      if (!target) return res.status(404).json({ error: 'Membre admin introuvable' });
      if (target.role === 'super_admin' && !isSuperAdmin(req)) {
        return res.status(403).json({ error: 'Action réservée au super administrateur' });
      }

      const passwordHash = await bcrypt.hash(data.password, 12);
      const ops: Promise<unknown>[] = [
        prisma.user.update({ where: { id }, data: { passwordHash, loginAttempts: 0, lockedUntil: null } }),
      ];
      if (data.forceLogout) ops.push(prisma.userSession.deleteMany({ where: { userId: id } }));
      await Promise.all(ops);

      await auditFromReq(req, 'admin.team.reset_password', { entity: 'user', entityId: id });
      return res.json({ message: 'Mot de passe réinitialisé' });
    } catch (err) {
      logger.error('Erreur reset password admin', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /**
   * POST /admin/team/:id/reset-mfa — réinitialise l'application d'authentification
   * d'un membre (perte du téléphone). Le MFA reste actif (OTP e-mail jusqu'à une
   * nouvelle configuration) ; toutes ses sessions sont fermées ; action journalisée.
   */
  async resetMfa(req: Request, res: Response) {
    const { id } = req.params;
    if (id === req.user!.id) {
      return res.status(400).json({ error: 'Utilisez un code de récupération ou le code par e-mail pour votre propre compte.' });
    }
    try {
      const target = await prisma.user.findFirst({
        where: { id, role: { in: [...ADMIN_ROLES] }, deletedAt: null },
        select: { id: true, role: true },
      });
      if (!target) return res.status(404).json({ error: 'Membre admin introuvable' });
      if (target.role === 'super_admin' && !isSuperAdmin(req)) {
        return res.status(403).json({ error: 'Action réservée au super administrateur' });
      }

      await mfaService.resetTotp(id, { actorId: req.user!.id, ip: req.ip, via: 'admin.team' });
      return res.json({ message: 'Application d\'authentification réinitialisée. Sessions du membre fermées.' });
    } catch (err) {
      logger.error('Erreur réinitialisation MFA', { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** GET /admin/audit — journal d'audit */
  async auditLog(req: Request, res: Response) {
    const { page, limit } = getPaginationParams(req.query as Record<string, unknown>);
    const action = typeof req.query.action === 'string' ? req.query.action : undefined;
    const where = action ? { action: { contains: action } } : {};
    try {
      const [rows, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: getSkip({ page, limit }),
          take: limit,
          include: { user: { select: { email: true, adminTitle: true } } },
        }),
        prisma.auditLog.count({ where }),
      ]);
      return res.json(paginate(rows, total, { page, limit }));
    } catch (err) {
      logger.error('Erreur journal audit', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },
};

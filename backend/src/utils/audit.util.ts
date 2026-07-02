import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../config/logger';

interface AuditParams {
  userId?: string;          // auteur de l'action (admin)
  action: string;           // ex: 'admin.user.suspend'
  entity?: string;          // ex: 'user'
  entityId?: string;
  oldData?: unknown;
  newData?: unknown;
  ip?: string;
  userAgent?: string;
}

/** Écrit une entrée de journal d'audit (best-effort — n'échoue jamais la requête). */
export async function writeAudit(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entity: params.entity ?? null,
        entityId: params.entityId ?? null,
        oldData: params.oldData === undefined ? undefined : (params.oldData as Prisma.InputJsonValue),
        newData: params.newData === undefined ? undefined : (params.newData as Prisma.InputJsonValue),
        ipAddress: params.ip ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  } catch (err) {
    logger.error('Échec écriture audit log', { action: params.action, error: err instanceof Error ? err.message : String(err) });
  }
}

/** Raccourci qui extrait automatiquement l'auteur + IP + user-agent depuis la requête. */
export async function auditFromReq(req: Request, action: string, extra: Omit<AuditParams, 'action' | 'userId' | 'ip' | 'userAgent'> = {}): Promise<void> {
  await writeAudit({
    userId: req.user?.id,
    action,
    ip: req.ip,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 500) : undefined,
    ...extra,
  });
}

import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';

/**
 * Notifications dans l'application (cloche du site et de l'administration).
 *
 * Règles :
 * - une notification ne doit JAMAIS faire échouer l'action métier qui l'émet :
 *   toute erreur est journalisée puis ignorée ;
 * - `data` ne contient que des identifiants et un lien interne (pas de donnée
 *   personnelle de la contrepartie : e-mail, téléphone, adresse).
 */

export const NOTIFICATION_TYPES = [
  'booking.created',
  'booking.accepted',
  'booking.rejected',
  'booking.started',
  'booking.completed',
  'booking.validated',
  'booking.cancelled',
  'booking.disputed',
  'booking.dispute_resolved',
  'review.published',
  'review.received',
  'review.rejected',
  'report.created',
  'report.updated',
  'kyc.approved',
  'kyc.rejected',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body?: string;
  /** Lien interne relatif (ex. « /bookings/<id> »), jamais d'URL externe. */
  link?: string;
  data?: Record<string, string | number | boolean | null>;
}

const MAX_TITLE = 200;
const MAX_BODY = 1000;

function toRow(userId: string, input: NotificationInput): Prisma.NotificationCreateManyInput {
  const link = input.link && input.link.startsWith('/') && !input.link.startsWith('//') ? input.link : undefined;
  return {
    userId,
    type: input.type,
    title: input.title.slice(0, MAX_TITLE),
    body: input.body ? input.body.slice(0, MAX_BODY) : null,
    data: { ...(input.data ?? {}), ...(link ? { link } : {}) },
  };
}

/** Notifie un ou plusieurs utilisateurs. Ne lève jamais d'exception. */
export async function notifyUsers(userIds: Array<string | null | undefined>, input: NotificationInput): Promise<number> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return 0;
  try {
    const { count } = await prisma.notification.createMany({ data: ids.map((id) => toRow(id, input)) });
    return count;
  } catch (err) {
    logger.error('Notification non enregistrée', {
      type: input.type,
      recipients: ids.length,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

export function notifyUser(userId: string | null | undefined, input: NotificationInput): Promise<number> {
  return notifyUsers([userId], input);
}

/**
 * Notifie les membres actifs de l'équipe qui détiennent la permission donnée
 * (le super-administrateur détient toutes les permissions).
 */
export async function notifyStaff(permission: string, input: NotificationInput): Promise<number> {
  try {
    const staff = await prisma.user.findMany({
      where: { role: { in: ['admin', 'super_admin'] }, status: 'active', deletedAt: null },
      select: { id: true, role: true, permissions: true },
    });
    const recipients = staff
      .filter((member) => member.role === 'super_admin'
        || (Array.isArray(member.permissions) && (member.permissions as unknown[]).includes(permission)))
      .map((member) => member.id);
    return await notifyUsers(recipients, input);
  } catch (err) {
    logger.error('Notification équipe non enregistrée', {
      type: input.type,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

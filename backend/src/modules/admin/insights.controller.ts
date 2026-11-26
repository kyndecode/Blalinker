import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { PERMISSIONS as P } from '../../config/permissions';
import { auditFromReq } from '../../utils/audit.util';
import { notifyUser } from '../notifications/notifications.service';

const DAY = 24 * 3600_000;

function hasPermission(req: Request, permission: string): boolean {
  return req.user?.role === 'super_admin' || (req.user?.permissions ?? []).includes(permission);
}
function fail(res: Response, label: string, err: unknown) {
  logger.error(label, { error: err instanceof Error ? err.message : String(err) });
  return res.status(500).json({ error: 'Erreur serveur' });
}

// ════════════════════════════════════════════════════════════
// Filtres et tris communs (listes et exports)
// ════════════════════════════════════════════════════════════

/** Période [from, to] lue dans la requête (dates ISO) ; `to` inclut toute la journée. */
export function dateRange(query: Record<string, unknown>): { gte?: Date; lte?: Date } | undefined {
  const parse = (v: unknown) => (typeof v === 'string' && v && !Number.isNaN(Date.parse(v)) ? new Date(v) : undefined);
  const from = parse(query.from);
  let to = parse(query.to);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(String(query.to))) to = new Date(to.getTime() + DAY - 1);
  if (!from && !to) return undefined;
  return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
}

/** Tri « champ:asc|desc » limité à une liste blanche (sinon tri par défaut). */
export function sortOrder<T extends string>(value: unknown, allowed: readonly T[], fallback: T): Record<string, 'asc' | 'desc'> {
  const [field, dir] = typeof value === 'string' ? value.split(':') : [];
  const f = (allowed as readonly string[]).includes(field) ? field : fallback;
  return { [f]: dir === 'asc' ? 'asc' : 'desc' };
}

const BOOKING_STATUSES = ['pending', 'accepted', 'rejected', 'in_progress', 'completed', 'validated', 'cancelled', 'disputed'] as const;
const TX_STATUSES = ['pending', 'processing', 'completed', 'failed', 'refunded'] as const;
const TX_METHODS = ['wave', 'orange_money', 'free_money', 'mtn_momo', 'cash', 'bank_transfer'] as const;
const USER_STATUSES = ['pending', 'active', 'suspended', 'banned'] as const;
const isOneOf = <T extends string>(values: readonly T[], v: unknown): v is T => typeof v === 'string' && (values as readonly string[]).includes(v);
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 100) : undefined);

export function bookingWhere(q: Record<string, unknown>): Prisma.BookingWhereInput {
  const search = text(q.search);
  return {
    ...(isOneOf(BOOKING_STATUSES, q.status) ? { status: q.status } : {}),
    ...(dateRange(q) ? { createdAt: dateRange(q) } : {}),
    ...(search ? {
      OR: [
        { client: { email: { contains: search, mode: 'insensitive' } } },
        { provider: { email: { contains: search, mode: 'insensitive' } } },
        { client: { profile: { is: { lastName: { contains: search, mode: 'insensitive' } } } } },
        { provider: { profile: { is: { lastName: { contains: search, mode: 'insensitive' } } } } },
        { service: { is: { title: { contains: search, mode: 'insensitive' } } } },
      ],
    } : {}),
  };
}

export function transactionWhere(q: Record<string, unknown>): Prisma.TransactionWhereInput {
  return {
    ...(isOneOf(TX_STATUSES, q.status) ? { status: q.status } : {}),
    ...(isOneOf(TX_METHODS, q.method) ? { method: q.method } : {}),
    ...(dateRange(q) ? { createdAt: dateRange(q) } : {}),
  };
}

export function userWhere(q: Record<string, unknown>, role?: 'client' | 'provider'): Prisma.UserWhereInput {
  const search = text(q.search);
  const r = role ?? (q.role === 'client' || q.role === 'provider' ? q.role : undefined);
  return {
    deletedAt: null,
    ...(r ? { role: r } : { role: { in: ['client', 'provider'] } }),
    ...(isOneOf(USER_STATUSES, q.status) ? { status: q.status } : {}),
    ...(q.verified === 'true' ? { profile: { is: { idVerified: true } } } : q.verified === 'false' ? { profile: { is: { idVerified: false } } } : {}),
    ...(dateRange(q) ? { createdAt: dateRange(q) } : {}),
    ...(search ? {
      OR: [
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { profile: { is: { firstName: { contains: search, mode: 'insensitive' } } } },
        { profile: { is: { lastName: { contains: search, mode: 'insensitive' } } } },
      ],
    } : {}),
  };
}

export function auditWhere(q: Record<string, unknown>): Prisma.AuditLogWhereInput {
  const action = text(q.action);
  const entity = text(q.entity);
  const userId = typeof q.userId === 'string' && /^[0-9a-f-]{36}$/i.test(q.userId) ? q.userId : undefined;
  return {
    ...(action ? { action: { contains: action } } : {}),
    ...(entity ? { entity } : {}),
    ...(userId ? { userId } : {}),
    ...(dateRange(q) ? { createdAt: dateRange(q) } : {}),
  };
}

// ════════════════════════════════════════════════════════════
// Export CSV
// ════════════════════════════════════════════════════════════

export const EXPORT_MAX_ROWS = 10_000;

/**
 * Cellule CSV sûre : séparateur « ; » (tableurs francophones), guillemets doublés, et
 * neutralisation des formules (=, +, -, @, tabulation, retour) contre l'injection CSV.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return `\uFEFF${[headers, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

type Dataset = {
  permission: string;
  headers: string[];
  load: (q: Record<string, unknown>) => Promise<unknown[][]>;
};

const name = (p?: { firstName?: string | null; lastName?: string | null } | null) => `${p?.firstName ?? ''} ${p?.lastName ?? ''}`.trim();

export const EXPORT_DATASETS: Record<string, Dataset> = {
  users: {
    permission: P.USERS_READ,
    headers: ['id', 'role', 'statut', 'prenom', 'nom', 'email', 'telephone', 'ville', 'pays', 'identite_verifiee', 'inscription', 'derniere_connexion'],
    load: async (q) => (await prisma.user.findMany({
      where: userWhere(q), orderBy: { createdAt: 'desc' }, take: EXPORT_MAX_ROWS + 1,
      select: { id: true, role: true, status: true, email: true, phone: true, createdAt: true, lastLoginAt: true, profile: { select: { firstName: true, lastName: true, city: true, country: true, idVerified: true } } },
    })).map((u) => [u.id, u.role, u.status, u.profile?.firstName, u.profile?.lastName, u.email, u.phone, u.profile?.city, u.profile?.country, u.profile?.idVerified ? 'oui' : 'non', u.createdAt, u.lastLoginAt]),
  },
  bookings: {
    permission: P.BOOKINGS_READ,
    headers: ['id', 'statut', 'service', 'client', 'prestataire', 'montant', 'devise', 'date_prevue', 'creee_le', 'paiement'],
    load: async (q) => (await prisma.booking.findMany({
      where: bookingWhere(q), orderBy: { createdAt: 'desc' }, take: EXPORT_MAX_ROWS + 1,
      select: {
        id: true, status: true, amount: true, currency: true, scheduledAt: true, createdAt: true,
        service: { select: { title: true } },
        client: { select: { profile: { select: { firstName: true, lastName: true } } } },
        provider: { select: { profile: { select: { firstName: true, lastName: true } } } },
        transaction: { select: { status: true } },
      },
    })).map((b) => [b.id, b.status, b.service?.title, name(b.client.profile), name(b.provider.profile), b.amount, b.currency, b.scheduledAt, b.createdAt, b.transaction?.status]),
  },
  transactions: {
    permission: P.PAYMENTS_READ,
    headers: ['id', 'reservation', 'statut', 'moyen', 'montant', 'commission', 'net', 'devise', 'payee_le', 'liberee_le', 'creee_le'],
    load: async (q) => (await prisma.transaction.findMany({
      where: transactionWhere(q), orderBy: { createdAt: 'desc' }, take: EXPORT_MAX_ROWS + 1,
      select: { id: true, bookingId: true, status: true, method: true, amount: true, commission: true, netAmount: true, currency: true, paidAt: true, releasedAt: true, createdAt: true },
    })).map((t) => [t.id, t.bookingId, t.status, t.method, t.amount, t.commission, t.netAmount, t.currency, t.paidAt, t.releasedAt, t.createdAt]),
  },
  reviews: {
    permission: P.REVIEWS_MODERATE,
    headers: ['id', 'note', 'commentaire', 'statut', 'auteur', 'prestataire', 'creee_le'],
    load: async (q) => (await prisma.review.findMany({
      where: dateRange(q) ? { createdAt: dateRange(q) } : {}, orderBy: { createdAt: 'desc' }, take: EXPORT_MAX_ROWS + 1,
      select: {
        id: true, rating: true, comment: true, isApproved: true, isFlagged: true, createdAt: true,
        reviewer: { select: { profile: { select: { firstName: true, lastName: true } } } },
        reviewed: { select: { profile: { select: { firstName: true, lastName: true } } } },
      },
    })).map((r) => [r.id, r.rating, r.comment, r.isFlagged ? 'refuse' : r.isApproved ? 'publie' : 'a_moderer', name(r.reviewer.profile), name(r.reviewed.profile), r.createdAt]),
  },
  audit: {
    permission: P.AUDIT_READ,
    headers: ['date', 'action', 'auteur', 'entite', 'entite_id', 'ip'],
    load: async (q) => (await prisma.auditLog.findMany({
      where: auditWhere(q), orderBy: { createdAt: 'desc' }, take: EXPORT_MAX_ROWS + 1,
      select: { createdAt: true, action: true, entity: true, entityId: true, ipAddress: true, user: { select: { email: true } } },
    })).map((a) => [a.createdAt, a.action, a.user?.email, a.entity, a.entityId, a.ipAddress]),
  },
};

// ════════════════════════════════════════════════════════════
// Actions groupées
// ════════════════════════════════════════════════════════════

export const bulkReviewsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'Sélection vide').max(100, '100 avis maximum par opération'),
  action: z.enum(['approve', 'reject'], { error: 'Action invalide' }),
  reason: z.string().trim().min(5, 'Motif trop court (5 caractères minimum)').max(500).optional(),
}).strict().refine((v) => v.action !== 'reject' || Boolean(v.reason), { message: 'Motif obligatoire pour un refus', path: ['reason'] });
export type BulkReviewsInput = z.infer<typeof bulkReviewsSchema>;

async function recomputeRating(tx: Prisma.TransactionClient, providerId: string) {
  const agg = await tx.review.aggregate({ where: { reviewedId: providerId, isApproved: true, isFlagged: false }, _avg: { rating: true }, _count: { _all: true } });
  await tx.providerProfile.updateMany({
    where: { userId: providerId },
    data: { ratingAverage: agg._avg.rating ?? 0, ratingCount: agg._count._all },
  });
}

// ════════════════════════════════════════════════════════════
// Contrôleur
// ════════════════════════════════════════════════════════════

export const insightsController = {
  /**
   * GET /admin/dashboard/trends — évolutions RÉELLES calculées en base :
   * mois en cours (jusqu'à aujourd'hui) contre la même période du mois précédent,
   * et séries quotidiennes sur 30 jours. Variation null si la période de référence est vide.
   */
  async trends(_req: Request, res: Response) {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevSameDay = new Date(startPrev.getTime() + (now.getTime() - startMonth.getTime()));
    const endPrev = prevSameDay < startMonth ? prevSameDay : startMonth;
    const since = new Date(now.getTime() - 29 * DAY);
    since.setHours(0, 0, 0, 0);

    const period = async (from: Date, to: Date) => {
      const [signups, bookings, revenue] = await Promise.all([
        prisma.user.count({ where: { deletedAt: null, role: { in: ['client', 'provider'] }, createdAt: { gte: from, lt: to } } }),
        prisma.booking.count({ where: { createdAt: { gte: from, lt: to } } }),
        prisma.transaction.aggregate({ where: { status: 'completed', createdAt: { gte: from, lt: to } }, _sum: { amount: true } }),
      ]);
      return { signups, bookings, revenue: Number(revenue._sum.amount ?? 0) };
    };
    const delta = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

    try {
      const [current, previous, daily] = await Promise.all([
        period(startMonth, now),
        period(startPrev, endPrev),
        prisma.$queryRaw<Array<{ day: Date; signups: number; bookings: number }>>`
          SELECT d.day::date AS day,
                 (SELECT count(*)::int FROM users u WHERE u.deleted_at IS NULL AND u.role IN ('client','provider')
                    AND u.created_at >= d.day AND u.created_at < d.day + interval '1 day') AS signups,
                 (SELECT count(*)::int FROM bookings b WHERE b.created_at >= d.day AND b.created_at < d.day + interval '1 day') AS bookings
          FROM generate_series(${since}::timestamp, date_trunc('day', now()), interval '1 day') AS d(day)
          ORDER BY d.day`,
      ]);
      res.set('Cache-Control', 'no-store');
      return res.json({
        period: { current: { from: startMonth, to: now }, previous: { from: startPrev, to: endPrev } },
        metrics: (['signups', 'bookings', 'revenue'] as const).map((key) => ({
          key, current: current[key], previous: previous[key], deltaPercent: delta(current[key], previous[key]),
        })),
        daily: daily.map((d) => ({ day: new Date(d.day).toISOString().slice(0, 10), signups: Number(d.signups), bookings: Number(d.bookings) })),
        currency: 'XOF',
      });
    } catch (err) {
      return fail(res, 'Tendances du tableau de bord', err);
    }
  },

  /**
   * GET /admin/users/:id/activity — historique des connexions (succès, échecs) et sessions
   * ouvertes. IP complète réservée à la permission « audit » ; masquée sinon.
   */
  async userActivity(req: Request, res: Response) {
    const { id } = req.params;
    const fullIp = hasPermission(req, P.AUDIT_READ);
    const maskIp = (ip: string | null) => {
      if (!ip || fullIp) return ip;
      return ip.includes(':') ? `${ip.split(':').slice(0, 3).join(':')}:…` : ip.replace(/\.\d+$/, '.x');
    };
    try {
      const user = await prisma.user.findUnique({ where: { id }, select: { id: true, lastLoginAt: true, loginAttempts: true, lockedUntil: true } });
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
      const [logins, sessions] = await Promise.all([
        prisma.auditLog.findMany({
          where: { userId: id, action: { in: ['auth.login.success', 'auth.login.failed'] } },
          orderBy: { createdAt: 'desc' }, take: 30,
          select: { action: true, createdAt: true, ipAddress: true, newData: true },
        }),
        prisma.userSession.findMany({
          where: { userId: id, expiresAt: { gt: new Date() } },
          orderBy: { lastUsedAt: 'desc' },
          select: { id: true, createdAt: true, lastUsedAt: true, expiresAt: true, ipAddress: true },
        }),
      ]);
      return res.json({
        lastLoginAt: user.lastLoginAt,
        failedAttempts: user.loginAttempts,
        lockedUntil: user.lockedUntil,
        logins: logins.map((l) => ({
          success: l.action === 'auth.login.success',
          at: l.createdAt,
          ip: maskIp(l.ipAddress),
          method: (l.newData as { method?: string } | null)?.method ?? null,
        })),
        sessions: sessions.map((s) => ({ ...s, ipAddress: maskIp(s.ipAddress) })),
      });
    } catch (err) {
      return fail(res, 'Activité utilisateur', err);
    }
  },

  /** GET /admin/exports/:dataset — CSV filtré (mêmes filtres que les listes), journalisé. */
  async exportCsv(req: Request, res: Response) {
    const key = String(req.params.dataset ?? '');
    const dataset = Object.prototype.hasOwnProperty.call(EXPORT_DATASETS, key) ? EXPORT_DATASETS[key] : undefined;
    if (!dataset) return res.status(404).json({ error: 'Export inconnu' });
    if (!hasPermission(req, dataset.permission)) {
      return res.status(403).json({ error: 'Permission insuffisante', code: 'FORBIDDEN', missing: [dataset.permission] });
    }
    try {
      const rows = await dataset.load(req.query as Record<string, unknown>);
      const truncated = rows.length > EXPORT_MAX_ROWS;
      const kept = truncated ? rows.slice(0, EXPORT_MAX_ROWS) : rows;
      const filters = Object.fromEntries(Object.entries(req.query).filter(([k]) => ['status', 'role', 'method', 'search', 'from', 'to', 'verified', 'action', 'entity'].includes(k)));
      await auditFromReq(req, 'admin.export', { entity: 'export', newData: { dataset: key, rows: kept.length, truncated, filters, result: 'success' } });
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="bla-${key}-${stamp}.csv"`);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Export-Rows', String(kept.length));
      if (truncated) res.setHeader('X-Export-Truncated', String(EXPORT_MAX_ROWS));
      return res.send(toCsv(dataset.headers, kept));
    } catch (err) {
      return fail(res, 'Export CSV', err);
    }
  },

  /** POST /admin/reviews/bulk — publication ou refus groupé (100 maximum), notes recalculées, journalisé. */
  async bulkReviews(req: Request, res: Response) {
    const { ids, action, reason } = req.body as BulkReviewsInput;
    try {
      const reviews = await prisma.review.findMany({
        where: { id: { in: ids } },
        select: { id: true, reviewerId: true, reviewedId: true, isApproved: true, isFlagged: true },
      });
      const targets = reviews.filter((r) => (action === 'approve' ? !r.isApproved || r.isFlagged : !r.isFlagged));
      const providers = [...new Set(targets.map((r) => r.reviewedId))];
      await prisma.$transaction(async (tx) => {
        await tx.review.updateMany({
          where: { id: { in: targets.map((r) => r.id) } },
          data: action === 'approve'
            ? { isApproved: true, isFlagged: false, flagReason: null, approvedBy: req.user!.id, approvedAt: new Date() }
            : { isApproved: false, isFlagged: true, flagReason: reason, approvedBy: req.user!.id, approvedAt: new Date() },
        });
        for (const providerId of providers) await recomputeRating(tx, providerId);
      });
      await auditFromReq(req, `admin.review.bulk_${action}`, {
        entity: 'review',
        newData: { ids: targets.map((r) => r.id), skipped: ids.length - targets.length, reason: reason ?? null, result: 'success' },
      });
      for (const r of targets) {
        await notifyUser(r.reviewerId, action === 'approve'
          ? { type: 'review.published', title: 'Votre avis est publié', body: 'Merci pour votre retour.', link: '/dashboard' }
          : { type: 'review.rejected', title: 'Avis non publié', body: `Votre avis n’a pas été publié : ${reason}`, link: '/dashboard' });
      }
      return res.json({ updated: targets.length, skipped: ids.length - targets.length });
    } catch (err) {
      return fail(res, 'Modération groupée', err);
    }
  },
};

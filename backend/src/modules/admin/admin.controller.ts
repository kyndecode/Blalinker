import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { PERMISSIONS as P } from '../../config/permissions';
import { adminPersonSelect, adminUserScalarSelect } from '../../utils/serializers';
import type {
  RejectReviewInput,
  ResolveDisputeInput,
  CreateCategoryInput,
  ResolveReportInput,
  UpdateCategoryInput,
  UpdateUserStatusInput,
  VerifyIdentityInput,
} from './admin.schemas';
import { getPaginationParams, paginate, getSkip } from '../../utils/pagination.util';
import { sendEmail } from '../../config/email';
import { escapeHtml, escapeHtmlMultiline } from '../../utils/html.util';
import { auditFromReq } from '../../utils/audit.util';
import { contactLabels } from '../contact/contact.controller';
import { notifyUser, notifyUsers } from '../notifications/notifications.service';
import { isCloudinaryConfigured, parseCloudinaryUrl, signedDownloadUrl } from '../../config/cloudinary';

type ContactRequestStatus = 'new' | 'read' | 'answered' | 'done' | 'closed';

type ContactRequestRecord = {
  id: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  countryCode: string;
  subject: string;
  message: string;
  status: ContactRequestStatus;
  adminResponse: string | null;
  handledBy: string | null;
  handledAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ContactRequestDelegate = {
  count: (args?: unknown) => Promise<number>;
  findMany: (args?: unknown) => Promise<ContactRequestRecord[]>;
  findUnique: (args?: unknown) => Promise<ContactRequestRecord | null>;
  update: (args?: unknown) => Promise<ContactRequestRecord>;
};

const contactRequestModel = (
  prisma as unknown as { contactRequest: ContactRequestDelegate }
).contactRequest;

const OPEN_CONTACT_STATUSES: ContactRequestStatus[] = ['new', 'read', 'answered', 'done'];

const CONTACT_STATUS_LABELS: Record<ContactRequestStatus, string> = {
  new: 'Nouveau',
  read: 'Lu',
  answered: 'Repondu',
  done: 'Termine',
  closed: 'Cloture',
};

function getContactStatusLabel(status: ContactRequestStatus): string {
  return CONTACT_STATUS_LABELS[status] ?? status;
}

const ADMIN_ROLES = ['admin', 'super_admin'];
const USER_ROLES = ['client', 'provider', 'admin', 'super_admin'] as const;
const USER_STATUSES = ['pending', 'active', 'suspended', 'banned'] as const;
const BOOKING_STATUSES = ['pending', 'accepted', 'rejected', 'in_progress', 'completed', 'validated', 'cancelled', 'disputed'] as const;
const REPORT_STATUSES = ['pending', 'reviewed', 'resolved', 'dismissed'] as const;
const REVIEW_FILTERS = ['pending', 'published', 'rejected'] as const;

/** Champs du profil réservés à la vérification d'identité (KYC). */
const KYC_PROFILE_FIELDS = ['idCardUrl', 'dateOfBirth', 'address', 'latitude', 'longitude'] as const;

function hasPermission(req: Request, permission: string): boolean {
  return req.user?.role === 'super_admin' || (req.user?.permissions ?? []).includes(permission);
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function prismaCode(err: unknown): string | undefined {
  return err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined;
}

/** Recalcule la note d'un prestataire à partir de ses avis APPROUVÉS (sans échouer s'il n'a pas de profil pro). */
async function recomputeProviderRating(tx: Prisma.TransactionClient, providerId: string) {
  const stats = await tx.review.aggregate({
    where: { reviewedId: providerId, isApproved: true },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await tx.providerProfile.updateMany({
    where: { userId: providerId },
    data: { ratingAverage: stats._avg.rating ?? 0, ratingCount: stats._count._all },
  });
}

export const adminController = {
  /** GET /admin/dashboard — KPIs */
  async dashboard(_req: Request, res: Response) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    try {
      const [
        totalUsers,
        activeUsers,
        newUsersThisWeek,
        totalProviders,
        activeProviders,
        pendingProviders,
        totalBookings,
        todayBookings,
        activeBookings,
        completedBookings,
        pendingVerifications,
        pendingReports,
        pendingReviews,
        pendingContacts,
        monthlyRevenue,
        totalRevenue,
        monthlyCommissions,
      ] = await Promise.all([
        prisma.user.count({ where: { deletedAt: null } }),
        prisma.user.count({ where: { deletedAt: null, status: 'active' } }),
        prisma.user.count({ where: { deletedAt: null, createdAt: { gte: startOfWeek } } }),
        prisma.user.count({ where: { role: 'provider', deletedAt: null } }),
        prisma.user.count({ where: { role: 'provider', deletedAt: null, status: 'active' } }),
        prisma.user.count({ where: { role: 'provider', deletedAt: null, status: 'pending' } }),
        prisma.booking.count(),
        prisma.booking.count({ where: { createdAt: { gte: startOfDay } } }),
        prisma.booking.count({ where: { status: { in: ['pending', 'accepted', 'in_progress'] } } }),
        prisma.booking.count({ where: { status: { in: ['completed', 'validated'] } } }),
        prisma.profile.count({ where: { idVerified: false, idCardUrl: { not: null } } }),
        prisma.report.count({ where: { status: 'pending' } }),
        prisma.review.count({ where: { isApproved: false } }),
        contactRequestModel.count({ where: { status: { in: OPEN_CONTACT_STATUSES } } }),
        prisma.transaction.aggregate({
          where: {
            status: 'completed',
            createdAt: { gte: startOfMonth },
          },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: {
            status: 'completed',
          },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: {
            status: 'completed',
            createdAt: { gte: startOfMonth },
          },
          _sum: { commission: true },
        }),
      ]);

      res.json({
        users: {
          total: totalUsers,
          active: activeUsers,
          pendingVerification: pendingVerifications,
          newThisWeek: newUsersThisWeek,
        },
        providers: {
          total: totalProviders,
          active: activeProviders,
          pendingApproval: pendingProviders,
        },
        bookings: {
          total: totalBookings,
          today: todayBookings,
          inProgress: activeBookings,
          completed: completedBookings,
        },
        revenue: {
          total: Number(totalRevenue._sum.amount ?? 0),
          thisMonth: Number(monthlyRevenue._sum.amount ?? 0),
          currency: 'XOF',
        },
        // Commissions réellement enregistrées sur les transactions (pas de taux supposé).
        commissions: {
          thisMonth: Number(monthlyCommissions._sum.commission ?? 0),
          currency: 'XOF',
        },
        reports: {
          open: pendingReports,
        },
        reviews: {
          pending: pendingReviews,
        },
        contacts: {
          pending: pendingContacts,
        },

        // Compatibilité avec les anciennes pages admin
        totalUsers,
        totalProviders,
        activeBookings,
        pendingVerifications,
        pendingReports,
        pendingContacts,
        monthlyCommissions: Number(monthlyCommissions._sum.commission ?? 0),
      });
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** GET /admin/users */
  async listUsers(req: Request, res: Response) {
    const { page, limit } = getPaginationParams(req.query as Record<string, unknown>);
    const { role, status, search } = req.query;
    if ((role && !isOneOf(USER_ROLES, role)) || (status && !isOneOf(USER_STATUSES, status))) {
      return res.status(422).json({ error: 'Filtre invalide' });
    }

    try {
      const where = {
        deletedAt: null,
        ...(isOneOf(USER_ROLES, role) ? { role } : {}),
        ...(isOneOf(USER_STATUSES, status) ? { status } : {}),
        ...(search ? {
          OR: [
            { email: { contains: search as string, mode: 'insensitive' as const } },
            { phone: { contains: search as string } },
          ],
        } : {}),
      };

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip: getSkip({ page, limit }),
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            ...adminUserScalarSelect,
            profile: { select: { firstName: true, lastName: true, avatarUrl: true, idVerified: true } },
          },
        }),
        prisma.user.count({ where }),
      ]);

      res.json(paginate(users, total, { page, limit }));
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** GET /admin/providers */
  async listProviders(req: Request, res: Response) {
    const { page, limit } = getPaginationParams(req.query as Record<string, unknown>);
    const { search } = req.query;

    try {
      const where = {
        role: 'provider' as const,
        deletedAt: null,
        ...(search ? {
          OR: [
            { email: { contains: search as string, mode: 'insensitive' as const } },
            { phone: { contains: search as string } },
            { profile: { is: { firstName: { contains: search as string, mode: 'insensitive' as const } } } },
            { profile: { is: { lastName: { contains: search as string, mode: 'insensitive' as const } } } },
          ],
        } : {}),
      };

      const [providers, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip: getSkip({ page, limit }),
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            profile: { select: { firstName: true, lastName: true, city: true, idVerified: true } },
            providerProfile: { select: { isAvailable: true, ratingAverage: true, ratingCount: true } },
          },
        }),
        prisma.user.count({ where }),
      ]);

      const rows = providers.map((provider) => ({
        id: provider.id,
        user: {
          email: provider.email,
          phone: provider.phone,
        },
        firstName: provider.profile?.firstName ?? '',
        lastName: provider.profile?.lastName ?? '',
        city: provider.profile?.city ?? null,
        isVerified: provider.profile?.idVerified ?? false,
        isAvailable: provider.providerProfile?.isAvailable ?? false,
        ratingAverage: Number(provider.providerProfile?.ratingAverage ?? 0),
        ratingCount: provider.providerProfile?.ratingCount ?? 0,
        createdAt: provider.createdAt,
      }));

      return res.json(paginate(rows, total, { page, limit }));
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** GET /admin/bookings */
  async listBookings(req: Request, res: Response) {
    const { page, limit } = getPaginationParams(req.query as Record<string, unknown>);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    if (status && !isOneOf(BOOKING_STATUSES, status)) {
      return res.status(422).json({ error: 'Statut invalide' });
    }

    try {
      const where = isOneOf(BOOKING_STATUSES, status) ? { status } : {};

      const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
          where,
          skip: getSkip({ page, limit }),
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            client: { select: adminPersonSelect },
            provider: { select: adminPersonSelect },
            service: { select: { id: true, title: true } },
          },
        }),
        prisma.booking.count({ where }),
      ]);

      const rows = bookings.map((booking) => ({
        ...booking,
        client: {
          ...booking.client,
          firstName: booking.client.profile?.firstName ?? '',
          lastName: booking.client.profile?.lastName ?? '',
        },
        provider: {
          ...booking.provider,
          firstName: booking.provider.profile?.firstName ?? '',
          lastName: booking.provider.profile?.lastName ?? '',
        },
        service: booking.service
          ? { ...booking.service, name: booking.service.title }
          : null,
      }));

      return res.json(paginate(rows, total, { page, limit }));
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** GET /admin/reviews */
  async listReviews(req: Request, res: Response) {
    const { page, limit } = getPaginationParams(req.query as Record<string, unknown>);
    const status = req.query.status;
    if (status !== undefined && !isOneOf(REVIEW_FILTERS, status)) {
      return res.status(422).json({ error: 'Statut invalide' });
    }
    const where: Prisma.ReviewWhereInput = status === 'pending'
      ? { isApproved: false, isFlagged: false }
      : status === 'published'
        ? { isApproved: true, isFlagged: false }
        : status === 'rejected'
          ? { isFlagged: true }
          : {};

    try {
      const [reviews, total] = await Promise.all([
        prisma.review.findMany({
          where,
          skip: getSkip({ page, limit }),
          take: limit,
          orderBy: { createdAt: status === 'pending' ? 'asc' : 'desc' },
          include: {
            reviewer: { select: adminPersonSelect },
            reviewed: { select: adminPersonSelect },
            booking: { select: { id: true, status: true, service: { select: { title: true } } } },
          },
        }),
        prisma.review.count({ where }),
      ]);

      const rows = reviews.map((review) => ({
        ...review,
        moderation: review.isApproved && !review.isFlagged ? 'published' : review.isFlagged ? 'rejected' : 'pending',
        client: {
          email: review.reviewer.email,
          firstName: review.reviewer.profile?.firstName ?? '',
          lastName: review.reviewer.profile?.lastName ?? '',
        },
        provider: {
          email: review.reviewed.email,
          firstName: review.reviewed.profile?.firstName ?? '',
          lastName: review.reviewed.profile?.lastName ?? '',
        },
      }));

      return res.json(paginate(rows, total, { page, limit }));
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** GET /admin/users/:id — sans secret ; pièce d'identité réservée à la permission KYC */
  async getUser(req: Request, res: Response) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: {
          ...adminUserScalarSelect,
          permissions: true,
          deletedAt: true,
          profile: true,
          providerProfile: true,
          services: { include: { category: true } },
          _count: { select: { clientBookings: true, providerBookings: true, receivedReviews: true } },
        },
      });
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

      const canSeeKyc = hasPermission(req, P.PROVIDERS_VERIFY);
      const hasIdDocument = Boolean(user.profile?.idCardUrl);
      // L'URL du document n'est jamais renvoyée : consultation via /id-document (lien signé, journalisé).
      const hidden: readonly string[] = canSeeKyc ? ['idCardUrl'] : KYC_PROFILE_FIELDS;
      const profile = user.profile
        ? { ...Object.fromEntries(Object.entries(user.profile).filter(([k]) => !hidden.includes(k))), hasIdDocument }
        : null;
      res.json({ ...user, profile });
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /**
   * PUT /admin/users/:id/status — clients et prestataires uniquement.
   * Les comptes administrateurs se gèrent depuis l'équipe (règles super-admin).
   * Suspension / bannissement : toutes les sessions du compte sont fermées.
   */
  async updateUserStatus(req: Request, res: Response) {
    const { id } = req.params;
    const { status, reason } = req.body as UpdateUserStatusInput;
    if (id === req.user!.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas modifier le statut de votre propre compte.' });
    }
    try {
      const target = await prisma.user.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, role: true, status: true },
      });
      if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
      if (ADMIN_ROLES.includes(target.role)) {
        return res.status(403).json({
          error: 'Les comptes administrateurs se gèrent depuis « Équipe & Rôles ».',
          code: 'ADMIN_TARGET_FORBIDDEN',
        });
      }
      if (target.status === status) {
        return res.json({ message: 'Statut inchangé', status });
      }

      const revokeSessions = status === 'suspended' || status === 'banned';
      await prisma.$transaction([
        prisma.user.update({ where: { id }, data: { status } }),
        ...(revokeSessions ? [prisma.userSession.deleteMany({ where: { userId: id } })] : []),
      ]);
      await auditFromReq(req, 'admin.user.status', {
        entity: 'user',
        entityId: id,
        oldData: { status: target.status },
        newData: { status, reason: reason ?? null, sessionsRevoked: revokeSessions, result: 'success' },
      });
      return res.json({ message: 'Statut mis à jour', status, sessionsRevoked: revokeSessions });
    } catch (err) {
      logger.error('Erreur changement de statut utilisateur', { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /**
   * POST /admin/users/:id/verify-id — exige une pièce d'identité déposée.
   * La validation n'active qu'un compte EN ATTENTE : jamais un compte suspendu ou banni.
   */
  async verifyIdentity(req: Request, res: Response) {
    const { id } = req.params;
    const { approved, comment } = req.body as VerifyIdentityInput;
    try {
      const target = await prisma.user.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, role: true, status: true, profile: { select: { idCardUrl: true, idVerified: true } } },
      });
      if (!target || !target.profile) return res.status(404).json({ error: 'Profil introuvable' });
      if (ADMIN_ROLES.includes(target.role)) {
        return res.status(403).json({ error: 'Action non applicable à un compte administrateur.', code: 'ADMIN_TARGET_FORBIDDEN' });
      }
      if (approved && !target.profile.idCardUrl) {
        return res.status(409).json({
          error: "Aucune pièce d'identité déposée : validation impossible.",
          code: 'ID_DOCUMENT_MISSING',
        });
      }

      let activated = false;
      if (approved) {
        const [, activation] = await prisma.$transaction([
          prisma.profile.update({
            where: { userId: id },
            data: { idVerified: true, idVerifiedAt: new Date(), idVerifiedBy: req.user!.id },
          }),
          prisma.user.updateMany({ where: { id, status: 'pending' }, data: { status: 'active' } }),
        ]);
        activated = activation.count === 1;
      } else {
        // Refus : l'identité n'est plus considérée comme vérifiée ; le document reste conservé.
        await prisma.profile.update({
          where: { userId: id },
          data: { idVerified: false, idVerifiedAt: null, idVerifiedBy: null },
        });
      }
      await notifyUser(id, approved
        ? { type: 'kyc.approved', title: 'Identité vérifiée', body: 'Votre pièce d’identité a été validée.', link: '/profile' }
        : {
          type: 'kyc.rejected',
          title: 'Pièce d’identité refusée',
          body: `Votre document n’a pas pu être validé${comment ? ` : ${comment}` : '.'} Vous pouvez en envoyer un nouveau depuis votre profil.`,
          link: '/profile',
        });
      await auditFromReq(req, 'admin.user.verify_id', {
        entity: 'user',
        entityId: id,
        oldData: { status: target.status, idVerified: target.profile.idVerified },
        newData: { approved, comment: comment ?? null, activated, result: 'success' },
      });
      res.json({ message: approved ? 'Identité validée' : 'Identité rejetée', comment, activated });
    } catch (err) {
      logger.error('Erreur vérification identité', { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /**
   * GET /admin/users/:id/id-document — lien de consultation de la pièce d'identité.
   * Réservé à la permission KYC, journalisé. Les documents « authenticated » sont servis
   * par une URL signée valable 5 minutes.
   */
  async idDocument(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const target = await prisma.user.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, role: true, profile: { select: { idCardUrl: true } } },
      });
      if (!target?.profile?.idCardUrl) {
        return res.status(404).json({ error: "Aucune pièce d'identité déposée.", code: 'ID_DOCUMENT_MISSING' });
      }
      if (ADMIN_ROLES.includes(target.role)) {
        return res.status(403).json({ error: 'Action non applicable à un compte administrateur.', code: 'ADMIN_TARGET_FORBIDDEN' });
      }
      const ref = parseCloudinaryUrl(target.profile.idCardUrl);
      if (!ref) {
        return res.status(422).json({ error: 'Adresse du document non reconnue.', code: 'ID_DOCUMENT_UNREADABLE' });
      }

      let url: string;
      let expiresAt: Date | null = null;
      let protectedDelivery = true;
      if (ref.deliveryType === 'upload') {
        // Document déposé avant la protection (lien public non devinable) : à migrer
        // avec scripts/kyc-protect-documents.ts.
        url = target.profile.idCardUrl;
        protectedDelivery = false;
      } else {
        if (!isCloudinaryConfigured()) {
          return res.status(503).json({ error: 'Stockage de fichiers non configuré.' });
        }
        const signed = signedDownloadUrl(ref, 300);
        url = signed.url;
        expiresAt = signed.expiresAt;
      }

      await auditFromReq(req, 'admin.kyc.view_document', {
        entity: 'user', entityId: id, newData: { protectedDelivery, result: 'success' },
      });
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ url, expiresAt, format: ref.format, protectedDelivery });
    } catch (err) {
      logger.error('Erreur consultation pièce d’identité', { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** GET /admin/reviews/pending */
  async pendingReviews(req: Request, res: Response) {
    const { page, limit } = getPaginationParams(req.query as Record<string, unknown>);
    try {
      const [reviews, total] = await Promise.all([
        prisma.review.findMany({
          where: { isApproved: false },
          skip: getSkip({ page, limit }),
          take: limit,
          orderBy: { createdAt: 'asc' },
          include: {
            reviewer: { select: adminPersonSelect },
            reviewed: { select: adminPersonSelect },
            booking: { select: { completedAt: true } },
          },
        }),
        prisma.review.count({ where: { isApproved: false } }),
      ]);
      res.json(paginate(reviews, total, { page, limit }));
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** PUT /admin/reviews/:id/approve — approbation et recalcul de la note dans la même transaction */
  async approveReview(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const review = await prisma.review.findUnique({
        where: { id },
        select: { id: true, reviewerId: true, reviewedId: true, isApproved: true, isFlagged: true },
      });
      if (!review) return res.status(404).json({ error: 'Avis introuvable' });
      if (review.isApproved && !review.isFlagged) return res.json({ message: 'Avis déjà approuvé' });

      const approvedNow = await prisma.$transaction(async (tx) => {
        const { count } = await tx.review.updateMany({
          where: { id, OR: [{ isApproved: false }, { isFlagged: true }] },
          data: { isApproved: true, isFlagged: false, flagReason: null, approvedBy: req.user!.id, approvedAt: new Date() },
        });
        if (count === 0) return false;
        await recomputeProviderRating(tx, review.reviewedId);
        return true;
      });
      if (approvedNow) {
        await auditFromReq(req, 'admin.review.approve', {
          entity: 'review', entityId: id, newData: { providerId: review.reviewedId, result: 'success' },
        });
        await notifyUser(review.reviewerId, {
          type: 'review.published', title: 'Votre avis est publié', body: 'Merci pour votre retour.', link: '/dashboard',
        });
        await notifyUser(review.reviewedId, {
          type: 'review.received', title: 'Nouvel avis publié', body: 'Un client a publié un avis sur votre profil.', link: '/dashboard',
        });
      }
      res.json({ message: approvedNow ? 'Avis approuvé' : 'Avis déjà approuvé' });
    } catch (err) {
      logger.error('Erreur approbation avis', { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /**
   * PUT /admin/reviews/:id/reject — refus motivé : l'avis est masqué (conservé pour
   * l'historique) et la note est recalculée s'il était publié.
   */
  async rejectReview(req: Request, res: Response) {
    const { id } = req.params;
    const { reason } = req.body as RejectReviewInput;
    try {
      const review = await prisma.review.findUnique({
        where: { id },
        select: { id: true, reviewerId: true, reviewedId: true, isApproved: true, isFlagged: true },
      });
      if (!review) return res.status(404).json({ error: 'Avis introuvable' });
      if (review.isFlagged) return res.json({ message: 'Avis déjà refusé' });

      await prisma.$transaction(async (tx) => {
        await tx.review.update({
          where: { id },
          data: { isApproved: false, isFlagged: true, flagReason: reason, approvedBy: req.user!.id, approvedAt: new Date() },
        });
        if (review.isApproved) await recomputeProviderRating(tx, review.reviewedId);
      });
      await auditFromReq(req, 'admin.review.reject', {
        entity: 'review', entityId: id,
        oldData: { isApproved: review.isApproved },
        newData: { reason, result: 'success' },
      });
      await notifyUser(review.reviewerId, {
        type: 'review.rejected',
        title: 'Avis non publié',
        body: `Votre avis n’a pas été publié : ${reason}`,
        link: '/dashboard',
      });
      res.json({ message: review.isApproved ? 'Avis dépublié' : 'Avis refusé' });
    } catch (err) {
      logger.error('Erreur refus avis', { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** DELETE /admin/reviews/:id — suppression et recalcul de la note si l'avis était publié */
  async deleteReview(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const review = await prisma.review.findUnique({
        where: { id },
        select: { id: true, bookingId: true, reviewerId: true, reviewedId: true, rating: true, isApproved: true },
      });
      if (!review) return res.status(404).json({ error: 'Avis introuvable' });

      await prisma.$transaction(async (tx) => {
        await tx.review.delete({ where: { id } });
        if (review.isApproved) await recomputeProviderRating(tx, review.reviewedId);
      });
      await auditFromReq(req, 'admin.review.delete', {
        entity: 'review', entityId: id, oldData: review, newData: { result: 'success' },
      });
      res.json({ message: 'Avis supprimé' });
    } catch (err) {
      if (prismaCode(err) === 'P2025') return res.status(404).json({ error: 'Avis introuvable' });
      logger.error('Erreur suppression avis', { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** GET /admin/reports */
  async listReports(req: Request, res: Response) {
    const { page, limit } = getPaginationParams(req.query as Record<string, unknown>);
    const { status } = req.query;
    if (status && !isOneOf(REPORT_STATUSES, status)) {
      return res.status(422).json({ error: 'Statut invalide' });
    }
    try {
      const where = isOneOf(REPORT_STATUSES, status) ? { status } : {};
      const [reports, total] = await Promise.all([
        prisma.report.findMany({
          where,
          skip: getSkip({ page, limit }),
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            reporter: { select: adminPersonSelect },
            reported: { select: adminPersonSelect },
            booking: { select: { id: true, status: true, amount: true, currency: true, transaction: { select: { status: true } } } },
          },
        }),
        prisma.report.count({ where }),
      ]);
      res.json(paginate(reports, total, { page, limit }));
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** PATCH /admin/reports/:id (et PUT …/resolve) — changement de statut journalisé */
  async resolveReport(req: Request, res: Response) {
    const { id } = req.params;
    const { status } = req.body as ResolveReportInput;
    try {
      const report = await prisma.report.findUnique({ where: { id }, select: { id: true, status: true, reporterId: true } });
      if (!report) return res.status(404).json({ error: 'Signalement introuvable' });
      await prisma.report.update({
        where: { id },
        data: { status, resolvedBy: req.user!.id, resolvedAt: new Date() },
      });
      await auditFromReq(req, 'admin.report.status', {
        entity: 'report', entityId: id, oldData: { status: report.status }, newData: { status, result: 'success' },
      });
      if ((status === 'resolved' || status === 'dismissed') && report.status !== status) {
        await notifyUser(report.reporterId, {
          type: 'report.updated',
          title: 'Signalement traité',
          body: status === 'resolved'
            ? 'Votre signalement a été traité par notre équipe.'
            : 'Après examen, votre signalement a été classé sans suite.',
          link: '/dashboard',
        });
      }
      res.json({ message: 'Signalement mis à jour', status });
    } catch (err) {
      logger.error('Erreur mise à jour signalement', { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /**
   * POST /admin/bookings/:id/resolve-dispute — décision de l'équipe sur un litige.
   * - validate : la mission est considérée réalisée, les fonds sont libérés ;
   * - cancel   : la réservation est annulée ; si elle était payée, le remboursement
   *              se fait ensuite depuis « Paiements » (permission dédiée).
   * Les signalements ouverts de la réservation sont clôturés. Transition atomique.
   */
  async resolveDispute(req: Request, res: Response) {
    const { id } = req.params;
    const { outcome, note } = req.body as ResolveDisputeInput;
    const now = new Date();
    try {
      const result = await prisma.$transaction(async (tx) => {
        const { count } = await tx.booking.updateMany({
          where: { id, status: 'disputed' },
          data: outcome === 'validate'
            ? { status: 'validated', validatedAt: now }
            : { status: 'cancelled', cancellationReason: `Litige : ${note}`.slice(0, 500) },
        });
        if (count === 0) return null;
        if (outcome === 'validate') {
          await tx.transaction.updateMany({
            where: { bookingId: id, status: 'completed', releasedAt: null },
            data: { releasedAt: now },
          });
        }
        const reports = await tx.report.updateMany({
          where: { bookingId: id, status: { in: ['pending', 'reviewed'] } },
          data: { status: 'resolved', resolvedBy: req.user!.id, resolvedAt: now },
        });
        const booking = await tx.booking.findUniqueOrThrow({
          where: { id },
          select: { id: true, clientId: true, providerId: true, transaction: { select: { status: true } } },
        });
        return { booking, reportsClosed: reports.count };
      });

      if (!result) {
        const exists = await prisma.booking.findUnique({ where: { id }, select: { status: true } });
        return exists
          ? res.status(409).json({ error: 'Cette réservation n’est pas en litige.', code: 'BOOKING_NOT_DISPUTED', status: exists.status })
          : res.status(404).json({ error: 'Réservation introuvable' });
      }

      const paidStatus = result.booking.transaction?.status;
      const refundRequired = outcome === 'cancel' && (paidStatus === 'completed' || paidStatus === 'processing');
      await auditFromReq(req, 'admin.booking.resolve_dispute', {
        entity: 'booking', entityId: id,
        oldData: { status: 'disputed' },
        newData: { outcome, note, reportsClosed: result.reportsClosed, refundRequired, result: 'success' },
      });
      await notifyUsers([result.booking.clientId, result.booking.providerId], {
        type: 'booking.dispute_resolved',
        title: 'Litige traité',
        body: outcome === 'validate'
          ? 'Après examen, la mission est considérée comme réalisée.'
          : 'Après examen, la réservation a été annulée.',
        link: `/bookings/${id}`,
        data: { bookingId: id, outcome },
      });
      return res.json({
        message: outcome === 'validate' ? 'Mission validée' : 'Réservation annulée',
        status: outcome === 'validate' ? 'validated' : 'cancelled',
        refundRequired,
      });
    } catch (err) {
      logger.error('Erreur arbitrage litige', { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /**
   * DELETE /admin/categories/:id — uniquement si aucune prestation ni sous-catégorie ne
   * l'utilise (sinon 409 : la désactiver). Contenu conservé dans le journal d'audit.
   */
  async deleteCategory(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const category = await prisma.category.findUnique({
        where: { id },
        include: { _count: { select: { services: true, children: true } } },
      });
      if (!category) return res.status(404).json({ error: 'Catégorie introuvable' });
      const { services, children } = category._count;
      if (services > 0 || children > 0) {
        return res.status(409).json({
          error: 'Catégorie utilisée : désactivez-la plutôt que de la supprimer.',
          code: 'CATEGORY_IN_USE',
          usage: { services, children },
        });
      }
      await prisma.category.delete({ where: { id } });
      const { _count: _ignored, ...snapshot } = category;
      await auditFromReq(req, 'admin.category.delete', { entity: 'category', entityId: id, oldData: snapshot, newData: { result: 'success' } });
      return res.json({ message: 'Catégorie supprimée' });
    } catch (err) {
      if (prismaCode(err) === 'P2025') return res.status(404).json({ error: 'Catégorie introuvable' });
      if (prismaCode(err) === 'P2003') return res.status(409).json({ error: 'Catégorie utilisée : désactivez-la.', code: 'CATEGORY_IN_USE' });
      logger.error('Erreur suppression catégorie', { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** GET /admin/contacts */
  async listContacts(req: Request, res: Response) {
    const { page, limit } = getPaginationParams(req.query as Record<string, unknown>);
    const statusQuery = typeof req.query.status === 'string' ? req.query.status : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const where: Record<string, unknown> = {};
    if (statusQuery && ['new', 'read', 'answered', 'done', 'closed'].includes(statusQuery)) {
      where.status = statusQuery as ContactRequestStatus;
    }
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { subject: { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } },
      ];
    }

    try {
      const [contacts, total] = await Promise.all([
        contactRequestModel.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: getSkip({ page, limit }),
          take: limit,
        }),
        contactRequestModel.count({ where }),
      ]);

      const rows = contacts.map((contact) => ({
        ...contact,
        subjectLabel: contactLabels.subject(contact.subject),
        statusLabel: getContactStatusLabel(contact.status),
      }));

      return res.json(paginate(rows, total, { page, limit }));
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** PATCH /admin/contacts/:id/status */
  async updateContactStatus(req: Request, res: Response) {
    const status = req.body?.status as ContactRequestStatus;
    const rawAdminResponse = typeof req.body?.adminResponse === 'string'
      ? req.body.adminResponse.trim()
      : '';

    if (!['read', 'answered', 'done', 'closed'].includes(status)) {
      return res.status(422).json({ error: 'Statut invalide' });
    }

    try {
      const existing = await contactRequestModel.findUnique({
        where: { id: req.params.id },
      });

      if (!existing) {
        return res.status(404).json({ error: 'Demande introuvable' });
      }

      const now = new Date();
      const updated = await contactRequestModel.update({
        where: { id: req.params.id },
        data: {
          status,
          handledBy: req.user!.id,
          handledAt: now,
          closedAt: status === 'closed' ? now : null,
          ...(rawAdminResponse ? { adminResponse: rawAdminResponse } : {}),
        },
      });

      await auditFromReq(req, 'admin.contact.status', {
        entity: 'contact_request',
        entityId: updated.id,
        oldData: { status: existing.status },
        newData: { status: updated.status, responded: Boolean(rawAdminResponse), result: 'success' },
      });

      const subjectLabel = contactLabels.subject(updated.subject);
      const statusLabel = getContactStatusLabel(updated.status);
      const message = `Votre demande "${subjectLabel}" est maintenant: ${statusLabel}.`;

      if (updated.userId) {
        await prisma.notification.create({
          data: {
            userId: updated.userId,
            type: 'contact_status',
            title: 'Mise a jour de votre demande',
            body: message,
            data: {
              requestId: updated.id,
              status: updated.status,
              adminResponse: updated.adminResponse ?? null,
            },
          },
        });
      }

      await sendEmail({
        to: updated.email,
        subject: `BLA Services - Mise a jour de votre demande (${subjectLabel})`,
        html: `
          <p>Bonjour <strong>${escapeHtml(updated.firstName)}</strong>,</p>
          <p>${escapeHtml(message)}</p>
          ${updated.adminResponse ? `<p><strong>Message de notre equipe:</strong><br/>${escapeHtmlMultiline(updated.adminResponse)}</p>` : ''}
          <p><strong>Reference:</strong> ${escapeHtml(updated.id)}</p>
          <p>Merci de votre confiance,<br/>L'equipe BLA Services</p>
        `,
      });

      return res.json({
        message: 'Statut de la demande mis a jour',
        data: {
          ...updated,
          subjectLabel,
          statusLabel,
        },
      });
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** GET /admin/transactions */
  async listTransactions(req: Request, res: Response) {
    const { page, limit } = getPaginationParams(req.query as Record<string, unknown>);
    try {
      const [transactions, total] = await Promise.all([
        prisma.transaction.findMany({
          skip: getSkip({ page, limit }),
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            payer: { select: adminPersonSelect },
            payee: { select: adminPersonSelect },
          },
        }),
        prisma.transaction.count(),
      ]);
      res.json(paginate(transactions, total, { page, limit }));
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** GET /admin/categories */
  async listCategories(_req: Request, res: Response) {
    try {
      const categories = await prisma.category.findMany({
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { services: true } } },
      });
      res.json(categories);
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** POST /admin/categories — données validées, identifiant URL unique, action journalisée */
  async createCategory(req: Request, res: Response) {
    const data = req.body as CreateCategoryInput;
    try {
      if (data.parentId) {
        const parent = await prisma.category.findUnique({ where: { id: data.parentId }, select: { parentId: true } });
        if (!parent) return res.status(422).json({ error: 'Catégorie parente introuvable' });
        if (parent.parentId) return res.status(422).json({ error: 'Deux niveaux de catégories au maximum' });
      }
      const cat = await prisma.category.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description ?? null,
          iconUrl: data.iconUrl ?? null,
          isActive: data.isActive ?? true,
          sortOrder: data.sortOrder ?? 0,
          parentId: data.parentId ?? null,
        },
      });
      await auditFromReq(req, 'admin.category.create', {
        entity: 'category', entityId: cat.id, newData: { ...data, result: 'success' },
      });
      res.status(201).json(cat);
    } catch (err) {
      if (prismaCode(err) === 'P2002') {
        return res.status(409).json({ error: 'Cet identifiant URL (slug) est déjà utilisé.', code: 'SLUG_TAKEN' });
      }
      logger.error('Erreur création catégorie', { error: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: 'Erreur lors de la création' });
    }
  },

  /** PUT /admin/categories/:id — seuls les champs autorisés sont modifiables */
  async updateCategory(req: Request, res: Response) {
    const { id } = req.params;
    const data = req.body as UpdateCategoryInput;
    try {
      const existing = await prisma.category.findUnique({
        where: { id },
        select: {
          id: true, name: true, slug: true, description: true, iconUrl: true,
          isActive: true, sortOrder: true, parentId: true, _count: { select: { children: true } },
        },
      });
      if (!existing) return res.status(404).json({ error: 'Catégorie introuvable' });

      if (data.parentId) {
        if (data.parentId === id) {
          return res.status(422).json({ error: 'Une catégorie ne peut pas être sa propre parente' });
        }
        if (existing._count.children > 0) {
          return res.status(422).json({ error: 'Une catégorie qui a des sous-catégories ne peut pas devenir sous-catégorie' });
        }
        const parent = await prisma.category.findUnique({ where: { id: data.parentId }, select: { parentId: true } });
        if (!parent) return res.status(422).json({ error: 'Catégorie parente introuvable' });
        if (parent.parentId) return res.status(422).json({ error: 'Deux niveaux de catégories au maximum' });
      }

      const cat = await prisma.category.update({ where: { id }, data });
      const { _count: _children, ...before } = existing;
      await auditFromReq(req, 'admin.category.update', {
        entity: 'category', entityId: id, oldData: before, newData: { ...data, result: 'success' },
      });
      res.json(cat);
    } catch (err) {
      if (prismaCode(err) === 'P2002') {
        return res.status(409).json({ error: 'Cet identifiant URL (slug) est déjà utilisé.', code: 'SLUG_TAKEN' });
      }
      if (prismaCode(err) === 'P2025') return res.status(404).json({ error: 'Catégorie introuvable' });
      logger.error('Erreur mise à jour catégorie', { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },
};


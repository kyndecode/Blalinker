import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { getPaginationParams, paginate, getSkip } from '../../utils/pagination.util';
import { sendEmail } from '../../config/email';
import { contactLabels } from '../contact/contact.controller';

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

    try {
      const where = {
        deletedAt: null,
        ...(role   ? { role: role as 'client' | 'provider' | 'admin' } : {}),
        ...(status ? { status: status as 'active' | 'pending' | 'suspended' | 'banned' } : {}),
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
          include: { profile: { select: { firstName: true, lastName: true, avatarUrl: true, idVerified: true } } },
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

    try {
      const where = status
        ? { status: status as 'pending' | 'accepted' | 'rejected' | 'in_progress' | 'completed' | 'validated' | 'cancelled' | 'disputed' }
        : {};

      const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
          where,
          skip: getSkip({ page, limit }),
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            client: { include: { profile: { select: { firstName: true, lastName: true } } } },
            provider: { include: { profile: { select: { firstName: true, lastName: true } } } },
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

    try {
      const [reviews, total] = await Promise.all([
        prisma.review.findMany({
          skip: getSkip({ page, limit }),
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            reviewer: {
              include: {
                profile: { select: { firstName: true, lastName: true } },
              },
            },
            reviewed: {
              include: {
                profile: { select: { firstName: true, lastName: true } },
              },
            },
          },
        }),
        prisma.review.count(),
      ]);

      const rows = reviews.map((review) => ({
        ...review,
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

  /** GET /admin/users/:id */
  async getUser(req: Request, res: Response) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: {
          profile: true,
          providerProfile: true,
          services: { include: { category: true } },
          _count: { select: { clientBookings: true, providerBookings: true, receivedReviews: true } },
        },
      });
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
      res.json(user);
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** PUT /admin/users/:id/status */
  async updateUserStatus(req: Request, res: Response) {
    const { status } = req.body;
    const validStatuses = ['active', 'suspended', 'banned', 'pending'];
    if (!validStatuses.includes(status)) {
      return res.status(422).json({ error: 'Statut invalide' });
    }
    try {
      await prisma.user.update({
        where: { id: req.params.id },
        data: { status },
      });
      return res.json({ message: 'Statut mis à jour' });
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** POST /admin/users/:id/verify-id */
  async verifyIdentity(req: Request, res: Response) {
    const { approved, comment } = req.body;
    try {
      if (approved) {
        await prisma.profile.update({
          where: { userId: req.params.id },
          data: {
            idVerified: true,
            idVerifiedAt: new Date(),
            idVerifiedBy: req.user!.id,
          },
        });
        await prisma.user.update({
          where: { id: req.params.id },
          data:  { status: 'active' },
        });
      }
      res.json({ message: approved ? 'Identité validée' : 'Identité rejetée', comment });
    } catch {
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
            reviewer: { include: { profile: { select: { firstName: true, lastName: true } } } },
            reviewed: { include: { profile: { select: { firstName: true, lastName: true } } } },
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

  /** PUT /admin/reviews/:id/approve */
  async approveReview(req: Request, res: Response) {
    try {
      const review = await prisma.review.update({
        where: { id: req.params.id },
        data: { isApproved: true, approvedBy: req.user!.id, approvedAt: new Date() },
      });

      // Recalculer la note moyenne du prestataire
      const stats = await prisma.review.aggregate({
        where: { reviewedId: review.reviewedId, isApproved: true },
        _avg: { rating: true },
        _count: true,
      });

      await prisma.providerProfile.update({
        where: { userId: review.reviewedId },
        data: {
          ratingAverage: stats._avg.rating ?? 0,
          ratingCount:   stats._count,
        },
      });

      res.json({ message: 'Avis approuvé' });
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** DELETE /admin/reviews/:id */
  async deleteReview(req: Request, res: Response) {
    try {
      await prisma.review.delete({ where: { id: req.params.id } });
      res.json({ message: 'Avis supprimé' });
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** GET /admin/reports */
  async listReports(req: Request, res: Response) {
    const { page, limit } = getPaginationParams(req.query as Record<string, unknown>);
    const { status } = req.query;
    try {
      const where = status ? { status: status as 'pending' | 'reviewed' | 'resolved' | 'dismissed' } : {};
      const [reports, total] = await Promise.all([
        prisma.report.findMany({
          where,
          skip: getSkip({ page, limit }),
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            reporter: { include: { profile: { select: { firstName: true, lastName: true } } } },
            reported: { include: { profile: { select: { firstName: true, lastName: true } } } },
          },
        }),
        prisma.report.count({ where }),
      ]);
      res.json(paginate(reports, total, { page, limit }));
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** PUT /admin/reports/:id/resolve */
  async resolveReport(req: Request, res: Response) {
    const status = req.body?.status ?? 'resolved';
    const allowed = ['pending', 'reviewed', 'resolved', 'dismissed'];
    if (!allowed.includes(status)) {
      return res.status(422).json({ error: 'Statut invalide' });
    }
    try {
      await prisma.report.update({
        where: { id: req.params.id },
        data:  { status: status as 'pending' | 'reviewed' | 'resolved' | 'dismissed', resolvedBy: req.user!.id, resolvedAt: new Date() },
      });
      res.json({ message: 'Signalement résolu' });
    } catch {
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
          <p>Bonjour <strong>${updated.firstName}</strong>,</p>
          <p>${message}</p>
          ${updated.adminResponse ? `<p><strong>Message de notre equipe:</strong><br/>${updated.adminResponse.replace(/\n/g, '<br/>')}</p>` : ''}
          <p><strong>Reference:</strong> ${updated.id}</p>
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
            payer: { include: { profile: { select: { firstName: true, lastName: true } } } },
            payee: { include: { profile: { select: { firstName: true, lastName: true } } } },
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

  /** POST /admin/categories */
  async createCategory(req: Request, res: Response) {
    const { name, slug, description, iconUrl, sortOrder } = req.body;
    try {
      const cat = await prisma.category.create({
        data: { name, slug, description, iconUrl, sortOrder: sortOrder ?? 0 },
      });
      res.status(201).json(cat);
    } catch {
      res.status(500).json({ error: 'Erreur lors de la création' });
    }
  },

  /** PUT /admin/categories/:id */
  async updateCategory(req: Request, res: Response) {
    try {
      const cat = await prisma.category.update({
        where: { id: req.params.id },
        data:  req.body,
      });
      res.json(cat);
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },
};


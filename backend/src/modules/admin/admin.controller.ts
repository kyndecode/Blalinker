import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { getPaginationParams, paginate, getSkip } from '../../utils/pagination.util';

export const adminController = {
  /** GET /admin/dashboard — KPIs */
  async dashboard(_req: Request, res: Response) {
    try {
      const [
        totalUsers,
        totalProviders,
        activeBookings,
        pendingVerifications,
        pendingReports,
        monthlyRevenue,
      ] = await Promise.all([
        prisma.user.count({ where: { deletedAt: null } }),
        prisma.user.count({ where: { role: 'provider', deletedAt: null } }),
        prisma.booking.count({ where: { status: { in: ['pending', 'accepted', 'in_progress'] } } }),
        prisma.profile.count({ where: { idVerified: false, idCardUrl: { not: null } } }),
        prisma.report.count({ where: { status: 'pending' } }),
        prisma.transaction.aggregate({
          where: {
            status: 'completed',
            createdAt: { gte: new Date(new Date().setDate(1)) },
          },
          _sum: { commission: true },
        }),
      ]);

      res.json({
        totalUsers,
        totalProviders,
        activeBookings,
        pendingVerifications,
        pendingReports,
        monthlyCommissions: Number(monthlyRevenue._sum.commission ?? 0),
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
    const { status } = req.body;
    try {
      await prisma.report.update({
        where: { id: req.params.id },
        data:  { status, resolvedBy: req.user!.id, resolvedAt: new Date() },
      });
      res.json({ message: 'Signalement résolu' });
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

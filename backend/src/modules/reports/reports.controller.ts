import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { getPaginationParams, getSkip, paginate } from '../../utils/pagination.util';
import type { CreateReportInput } from './reports.schemas';

export const reportsController = {
  /** POST /reports — un utilisateur signale un autre utilisateur */
  async create(req: Request, res: Response) {
    const data = req.body as CreateReportInput;
    const reporterId = req.user!.id;

    if (data.reportedId === reporterId) {
      return res.status(400).json({ error: 'Vous ne pouvez pas vous signaler vous-même.' });
    }

    try {
      const reported = await prisma.user.findFirst({
        where: { id: data.reportedId, deletedAt: null },
        select: { id: true },
      });
      if (!reported) {
        return res.status(404).json({ error: 'Utilisateur signalé introuvable' });
      }

      const report = await prisma.report.create({
        data: {
          reporterId,
          reportedId: data.reportedId,
          bookingId: data.bookingId,
          reason: data.reason,
          description: data.description,
          status: 'pending',
        },
      });

      return res.status(201).json({ message: 'Signalement envoyé. Notre équipe va l\'examiner.', report });
    } catch (err) {
      logger.error('Erreur création signalement', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** GET /reports/my — mes signalements envoyés */
  async listMine(req: Request, res: Response) {
    const { page, limit } = getPaginationParams(req.query as Record<string, unknown>);
    const where = { reporterId: req.user!.id };

    try {
      const [reports, total] = await Promise.all([
        prisma.report.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: getSkip({ page, limit }),
          take: limit,
        }),
        prisma.report.count({ where }),
      ]);
      return res.json(paginate(reports, total, { page, limit }));
    } catch (err) {
      logger.error('Erreur liste signalements', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },
};

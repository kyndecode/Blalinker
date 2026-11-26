import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { getPaginationParams, getSkip, paginate } from '../../utils/pagination.util';
import { notifyStaff } from '../notifications/notifications.service';
import { shortName } from '../site/site.controller';
import type { CreateReportInput } from './reports.schemas';

/** Ce que l'auteur d'un signalement voit de son envoi (pas de donnée de l'équipe de modération). */
const ownReportSelect = {
  id: true,
  bookingId: true,
  reason: true,
  description: true,
  status: true,
  createdAt: true,
  resolvedAt: true,
  reported: { select: { profile: { select: { firstName: true, lastName: true } } } },
} as const;

export const reportsController = {
  /**
   * POST /reports — signaler un utilisateur.
   * Si une réservation est citée, l'auteur et la personne signalée doivent en être les deux parties.
   * Un même signalement en attente n'est pas dupliqué.
   */
  async create(req: Request, res: Response) {
    const data = req.body as CreateReportInput;
    const reporterId = req.user!.id;

    if (data.reportedId === reporterId) {
      return res.status(400).json({ error: 'Vous ne pouvez pas vous signaler vous-même.' });
    }

    try {
      const reported = await prisma.user.findFirst({
        where: { id: data.reportedId, deletedAt: null, role: { in: ['client', 'provider'] } },
        select: { id: true },
      });
      if (!reported) {
        return res.status(404).json({ error: 'Utilisateur signalé introuvable' });
      }

      if (data.bookingId) {
        const booking = await prisma.booking.findFirst({
          where: {
            id: data.bookingId,
            OR: [
              { clientId: reporterId, providerId: data.reportedId },
              { providerId: reporterId, clientId: data.reportedId },
            ],
          },
          select: { id: true },
        });
        if (!booking) {
          return res.status(404).json({ error: 'Réservation introuvable pour ce signalement.', code: 'BOOKING_NOT_SHARED' });
        }
      }

      const duplicate = await prisma.report.findFirst({
        where: {
          reporterId,
          reportedId: data.reportedId,
          bookingId: data.bookingId ?? null,
          status: { in: ['pending', 'reviewed'] },
        },
        select: { id: true },
      });
      if (duplicate) {
        return res.status(409).json({
          error: 'Un signalement est déjà en cours d’examen pour cette personne.',
          code: 'REPORT_PENDING',
        });
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
        select: ownReportSelect,
      });

      void notifyStaff('reports.handle', {
        type: 'report.created',
        title: 'Nouveau signalement',
        body: 'Un utilisateur a envoyé un signalement à examiner.',
        link: '/reports',
        data: { reportId: report.id },
      });

      const { reported: target, ...rest } = report;
      return res.status(201).json({
        message: 'Signalement envoyé. Notre équipe va l’examiner.',
        report: { ...rest, reportedName: shortName(target.profile?.firstName, target.profile?.lastName, 'Utilisateur') },
      });
    } catch (err) {
      logger.error('Erreur création signalement', { error: err instanceof Error ? err.message : String(err) });
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
          select: ownReportSelect,
        }),
        prisma.report.count({ where }),
      ]);
      const rows = reports.map(({ reported, ...rest }) => ({
        ...rest,
        reportedName: shortName(reported.profile?.firstName, reported.profile?.lastName, 'Utilisateur'),
      }));
      return res.json(paginate(rows, total, { page, limit }));
    } catch (err) {
      logger.error('Erreur liste signalements', { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },
};

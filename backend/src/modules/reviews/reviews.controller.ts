import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { getPaginationParams, getSkip, paginate } from '../../utils/pagination.util';
import type { CreateReviewInput, RespondReviewInput } from './reviews.schemas';

export const reviewsController = {
  /** POST /reviews — Le client laisse un avis sur une réservation terminée/validée */
  async create(req: Request, res: Response) {
    const data = req.body as CreateReviewInput;
    const userId = req.user!.id;

    try {
      const booking = await prisma.booking.findFirst({
        where: { id: data.bookingId, clientId: userId },
        select: { id: true, providerId: true, status: true },
      });

      if (!booking) {
        return res.status(404).json({ error: 'Réservation introuvable' });
      }
      if (!['completed', 'validated'].includes(booking.status)) {
        return res.status(400).json({ error: 'Vous pourrez noter une fois la prestation terminée.' });
      }

      const existing = await prisma.review.findUnique({ where: { bookingId: booking.id }, select: { id: true } });
      if (existing) {
        return res.status(409).json({ error: 'Vous avez déjà laissé un avis pour cette réservation.' });
      }

      const review = await prisma.review.create({
        data: {
          bookingId: booking.id,
          reviewerId: userId,
          reviewedId: booking.providerId,
          rating: data.rating,
          comment: data.comment,
          isApproved: false, // modération admin avant publication
        },
      });

      return res.status(201).json({ message: 'Avis envoyé. Il sera publié après modération.', review });
    } catch (err) {
      logger.error('Erreur création avis', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** PUT /reviews/:id/respond — Le prestataire répond à un avis le concernant */
  async respond(req: Request, res: Response) {
    const { id } = req.params;
    const { response } = req.body as RespondReviewInput;
    const userId = req.user!.id;

    try {
      const review = await prisma.review.findFirst({
        where: { id, reviewedId: userId },
        select: { id: true },
      });
      if (!review) {
        return res.status(404).json({ error: 'Avis introuvable' });
      }

      const updated = await prisma.review.update({
        where: { id },
        data: { response, responseAt: new Date() },
      });
      return res.json({ message: 'Réponse enregistrée', review: updated });
    } catch (err) {
      logger.error('Erreur réponse avis', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** GET /reviews/me — Avis reçus (prestataire) ou donnés (client) */
  async listMine(req: Request, res: Response) {
    const { page, limit } = getPaginationParams(req.query as Record<string, unknown>);
    const userId = req.user!.id;
    const role = req.user!.role;
    const where = role === 'provider' ? { reviewedId: userId } : { reviewerId: userId };

    try {
      const [reviews, total] = await Promise.all([
        prisma.review.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: getSkip({ page, limit }),
          take: limit,
          include: {
            reviewer: { select: { profile: { select: { firstName: true, lastName: true, avatarUrl: true } } } },
            booking: { select: { id: true, service: { select: { title: true } } } },
          },
        }),
        prisma.review.count({ where }),
      ]);
      return res.json(paginate(reviews, total, { page, limit }));
    } catch (err) {
      logger.error('Erreur liste avis', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },
};

import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { getPaginationParams, getSkip, paginate } from '../../utils/pagination.util';
import { shortName } from '../site/site.controller';
import type { CreateReviewInput, RespondReviewInput } from './reviews.schemas';

/** Statut de modération lisible par l'auteur ou le prestataire concerné. */
export function moderationStatus(review: { isApproved: boolean; isFlagged: boolean }): 'published' | 'rejected' | 'pending' {
  if (review.isApproved && !review.isFlagged) return 'published';
  if (review.isFlagged) return 'rejected';
  return 'pending';
}

/** Champs d'un avis visibles par son auteur et par le prestataire évalué (jamais d'identifiant d'administrateur). */
const ownReviewSelect = {
  id: true,
  bookingId: true,
  rating: true,
  comment: true,
  response: true,
  responseAt: true,
  isApproved: true,
  isFlagged: true,
  createdAt: true,
  reviewer: { select: { profile: { select: { firstName: true, lastName: true, avatarUrl: true } } } },
  booking: { select: { id: true, service: { select: { title: true } } } },
} satisfies Prisma.ReviewSelect;

type OwnReviewRow = Prisma.ReviewGetPayload<{ select: typeof ownReviewSelect }>;

function toOwnReview(review: OwnReviewRow) {
  const { reviewer, isApproved, isFlagged, ...rest } = review;
  return {
    ...rest,
    status: moderationStatus({ isApproved, isFlagged }),
    reviewerName: shortName(reviewer.profile?.firstName, reviewer.profile?.lastName),
    reviewerAvatarUrl: reviewer.profile?.avatarUrl ?? null,
  };
}

export const reviewsController = {
  /** POST /reviews — le client note une mission terminée ou validée (une seule fois). */
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
        return res.status(409).json({
          error: 'Vous pourrez noter la prestation une fois la mission terminée.',
          code: 'BOOKING_NOT_FINISHED',
        });
      }

      const review = await prisma.review.create({
        data: {
          bookingId: booking.id,
          reviewerId: userId,
          reviewedId: booking.providerId,
          rating: data.rating,
          comment: data.comment || null,
          isApproved: false, // modération avant publication
        },
        select: ownReviewSelect,
      });

      return res.status(201).json({
        message: 'Merci ! Votre avis sera publié après vérification par notre équipe.',
        review: toOwnReview(review),
      });
    } catch (err) {
      // Contrainte d'unicité (booking_id) : deux envois simultanés → un seul avis.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return res.status(409).json({ error: 'Vous avez déjà laissé un avis pour cette réservation.', code: 'REVIEW_EXISTS' });
      }
      logger.error('Erreur création avis', { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** PUT /reviews/:id/respond — le prestataire répond publiquement à un avis publié le concernant. */
  async respond(req: Request, res: Response) {
    const { id } = req.params;
    const { response } = req.body as RespondReviewInput;
    const userId = req.user!.id;

    try {
      const { count } = await prisma.review.updateMany({
        where: { id, reviewedId: userId, isApproved: true, isFlagged: false },
        data: { response, responseAt: new Date() },
      });
      if (count === 0) {
        const exists = await prisma.review.findFirst({ where: { id, reviewedId: userId }, select: { id: true } });
        return exists
          ? res.status(409).json({ error: 'Vous pourrez répondre une fois l’avis publié.', code: 'REVIEW_NOT_PUBLISHED' })
          : res.status(404).json({ error: 'Avis introuvable' });
      }
      const review = await prisma.review.findUniqueOrThrow({ where: { id }, select: ownReviewSelect });
      return res.json({ message: 'Réponse enregistrée', review: toOwnReview(review) });
    } catch (err) {
      logger.error('Erreur réponse avis', { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** GET /reviews/me — avis reçus (prestataire) ou donnés (client), avec leur statut de modération. */
  async listMine(req: Request, res: Response) {
    const { page, limit } = getPaginationParams(req.query as Record<string, unknown>);
    const userId = req.user!.id;
    const where = req.user!.role === 'provider' ? { reviewedId: userId } : { reviewerId: userId };

    try {
      const [reviews, total] = await Promise.all([
        prisma.review.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: getSkip({ page, limit }),
          take: limit,
          select: ownReviewSelect,
        }),
        prisma.review.count({ where }),
      ]);
      return res.json(paginate(reviews.map(toOwnReview), total, { page, limit }));
    } catch (err) {
      logger.error('Erreur liste avis', { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },
};

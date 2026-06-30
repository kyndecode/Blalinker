import { z } from 'zod';

export const createReviewSchema = z.object({
  bookingId: z.string().uuid('Réservation invalide'),
  rating: z.number().int().min(1, 'Note entre 1 et 5').max(5, 'Note entre 1 et 5'),
  comment: z.string().trim().max(1000, 'Commentaire trop long').optional(),
});

export const respondReviewSchema = z.object({
  response: z.string().trim().min(1, 'Réponse vide').max(1000, 'Réponse trop longue'),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type RespondReviewInput = z.infer<typeof respondReviewSchema>;

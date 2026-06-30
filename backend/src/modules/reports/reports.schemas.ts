import { z } from 'zod';

export const createReportSchema = z.object({
  reportedId: z.string().uuid('Utilisateur signalé invalide'),
  bookingId: z.string().uuid().optional(),
  reason: z.enum(['fraud', 'inappropriate', 'fake_profile', 'no_show', 'harassment', 'other'], {
    errorMap: () => ({ message: 'Motif de signalement invalide' }),
  }),
  description: z.string().trim().max(1000, 'Description trop longue').optional(),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;

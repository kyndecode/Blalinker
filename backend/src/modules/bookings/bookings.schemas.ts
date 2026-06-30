import { z } from 'zod';

export const createBookingSchema = z.object({
  providerId:  z.string().uuid('ID prestataire invalide'),
  serviceId:   z.string().uuid().optional(),
  description: z.string().min(10, 'Description trop courte (min 10 caractères)').max(1000),
  scheduledAt: z.string().datetime({ message: 'Date invalide' }).optional(),
  clientLat:   z.number().min(-90).max(90).optional(),
  clientLng:   z.number().min(-180).max(180).optional(),
  clientAddress: z.string().max(500).optional(),
  // ⚠️ Le montant n'est JAMAIS accepté du client (anti-manipulation de prix).
  // Il est calculé côté serveur à partir du prix du service choisi.
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

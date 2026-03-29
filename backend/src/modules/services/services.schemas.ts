import { z } from 'zod';

export const listServicesQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  categoryId: z.string().uuid('Catégorie invalide').optional(),
  providerId: z.string().uuid('Prestataire invalide').optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().positive().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(200).default(20),
  availableOnly: z.coerce.boolean().default(false),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).superRefine((value, ctx) => {
  if (value.minPrice !== undefined && value.maxPrice !== undefined && value.minPrice > value.maxPrice) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['minPrice'],
      message: 'minPrice ne peut pas être supérieur à maxPrice',
    });
  }

  const hasLat = value.lat !== undefined;
  const hasLng = value.lng !== undefined;
  if (hasLat !== hasLng) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: hasLat ? ['lng'] : ['lat'],
      message: 'lat et lng doivent être fournis ensemble',
    });
  }
});

export type ListServicesQueryInput = z.infer<typeof listServicesQuerySchema>;

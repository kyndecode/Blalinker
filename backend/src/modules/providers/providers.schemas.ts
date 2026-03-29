import { z } from 'zod';

export const searchSchema = z.object({
  lat:            z.coerce.number().min(-90).max(90),
  lng:            z.coerce.number().min(-180).max(180),
  radius:         z.coerce.number().min(1).max(100).default(10),
  category_id:    z.string().uuid().optional(),
  min_rating:     z.coerce.number().min(0).max(5).default(0),
  max_price:      z.coerce.number().positive().optional(),
  available_only: z.coerce.boolean().default(true),
  page:           z.coerce.number().min(1).default(1),
  limit:          z.coerce.number().min(1).max(50).default(20),
});

export const upsertProviderProfileSchema = z.object({
  businessName: z.string().trim().min(2).max(200).optional(),
  yearsExperience: z.coerce.number().int().min(0).max(70).optional(),
  hourlyRate: z.coerce.number().positive().max(100_000_000).optional(),
  dailyRate: z.coerce.number().positive().max(100_000_000).optional(),
  currency: z.string().trim().toUpperCase().min(3).max(10).optional(),
  radiusKm: z.coerce.number().int().min(1).max(200).optional(),
  isAvailable: z.coerce.boolean().optional(),
  bioPro: z.string().trim().max(3000).optional(),
  city: z.string().trim().max(100).optional(),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  address: z.string().trim().max(500).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
}).refine(
  (input) => (input.latitude === undefined && input.longitude === undefined)
    || (input.latitude !== undefined && input.longitude !== undefined),
  { message: 'latitude et longitude doivent être fournies ensemble' }
);

export const createProviderServiceSchema = z.object({
  categoryId: z.string().uuid('Catégorie invalide'),
  title: z.string().trim().min(3, 'Titre trop court').max(200, 'Titre trop long'),
  description: z.string().trim().max(3000, 'Description trop longue').optional(),
  priceType: z.enum(['hourly', 'fixed', 'daily']).optional(),
  price: z.coerce.number().positive('Prix invalide').max(100_000_000).optional(),
  isActive: z.coerce.boolean().optional(),
}).superRefine((input, ctx) => {
  if (input.priceType && input.price === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['price'],
      message: 'Le prix est requis quand priceType est défini',
    });
  }
});

export const updateProviderServiceSchema = z.object({
  categoryId: z.string().uuid('Catégorie invalide').optional(),
  title: z.string().trim().min(3, 'Titre trop court').max(200, 'Titre trop long').optional(),
  description: z.string().trim().max(3000, 'Description trop longue').optional(),
  priceType: z.enum(['hourly', 'fixed', 'daily']).optional(),
  price: z.coerce.number().positive('Prix invalide').max(100_000_000).optional(),
  isActive: z.coerce.boolean().optional(),
}).refine((input) => Object.keys(input).length > 0, {
  message: 'Aucune donnée à mettre à jour',
});

export type SearchInput = z.infer<typeof searchSchema>;
export type UpsertProviderProfileInput = z.infer<typeof upsertProviderProfileSchema>;
export type CreateProviderServiceInput = z.infer<typeof createProviderServiceSchema>;
export type UpdateProviderServiceInput = z.infer<typeof updateProviderServiceSchema>;

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

export type SearchInput = z.infer<typeof searchSchema>;

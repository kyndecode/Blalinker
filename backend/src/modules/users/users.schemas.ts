import { z } from 'zod';

export const updateMeSchema = z.object({
  firstName: z.string().trim().min(2, 'Prénom invalide').max(100).optional(),
  lastName: z.string().trim().min(2, 'Nom invalide').max(100).optional(),
  email: z.string().trim().email('Email invalide').max(255).transform((value) => value.toLowerCase()).optional(),
  bio: z.string().trim().max(500, 'Bio trop longue').optional().or(z.literal('')),
  city: z.string().trim().max(100, 'Ville trop longue').optional().or(z.literal('')),
  country: z.string().trim().toUpperCase().max(10, 'Pays invalide').optional().or(z.literal('')),
}).refine((data) => Object.values(data).some((value) => value !== undefined), {
  message: 'Aucune donnée à mettre à jour',
});

export type UpdateMeInput = z.infer<typeof updateMeSchema>;

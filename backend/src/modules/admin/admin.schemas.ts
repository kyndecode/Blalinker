import { z } from 'zod';

export const userStatusValues = ['active', 'suspended', 'banned', 'pending'] as const;

export const updateUserStatusSchema = z.object({
  status: z.enum(userStatusValues, { errorMap: () => ({ message: 'Statut invalide' }) }),
  reason: z.string().trim().max(500).optional(),
});
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;

export const verifyIdentitySchema = z.object({
  approved: z.boolean({ required_error: 'Décision requise', invalid_type_error: 'Décision invalide' }),
  comment: z.string().trim().max(500).optional(),
});
export type VerifyIdentityInput = z.infer<typeof verifyIdentitySchema>;

export const reportStatusValues = ['pending', 'reviewed', 'resolved', 'dismissed'] as const;

export const resolveReportSchema = z.object({
  status: z.enum(reportStatusValues, { errorMap: () => ({ message: 'Statut invalide' }) }).default('resolved'),
});
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;

/** Icône : URL https (image) ou court symbole (emoji), comme les catégories existantes. */
const iconSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => /^https:\/\/[^\s]+$/i.test(v) || (v.length > 0 && v.length <= 16 && !/[<>"'`]/.test(v)),
    'Icône invalide : URL https ou symbole court',
  );

const categoryFields = {
  name: z.string().trim().min(2, 'Nom trop court').max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Identifiant URL : lettres minuscules, chiffres et tirets'),
  description: z.string().trim().max(2000).nullable().optional(),
  iconUrl: iconSchema.nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
  parentId: z.string().uuid('Catégorie parente invalide').nullable().optional(),
};

export const createCategorySchema = z.object(categoryFields).strict();
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z
  .object(categoryFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Aucune modification fournie');
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

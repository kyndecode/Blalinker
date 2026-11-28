import { z } from 'zod';
import { ROLE_PRESETS } from '../../config/permissions';

const presetKeys = Object.keys(ROLE_PRESETS) as [string, ...string[]];

const strongPassword = z
  .string()
  .min(10, 'Mot de passe : 10 caractères minimum.')
  .max(128, 'Mot de passe : 128 caractères maximum.')
  .regex(/[A-Z]/, 'Mot de passe : ajoutez au moins une majuscule.')
  .regex(/[a-z]/, 'Mot de passe : ajoutez au moins une minuscule.')
  .regex(/[0-9]/, 'Mot de passe : ajoutez au moins un chiffre.');

export const createAdminSchema = z.object({
  email: z.string().trim().email('Veuillez saisir une adresse e-mail valide.').max(255, 'Adresse e-mail trop longue.').transform((v) => v.toLowerCase()),
  password: strongPassword,
  firstName: z.string().trim().min(2, 'Prénom : 2 caractères minimum.').max(100, 'Prénom : 100 caractères maximum.'),
  lastName: z.string().trim().min(2, 'Nom : 2 caractères minimum.').max(100, 'Nom : 100 caractères maximum.'),
  preset: z.enum(presetKeys).optional(),
  permissions: z.array(z.string()).optional(),
  adminTitle: z.string().trim().max(100).optional(),
  role: z.enum(['admin', 'super_admin']).optional(),
});

export const updateAdminSchema = z.object({
  preset: z.enum(presetKeys).optional(),
  permissions: z.array(z.string()).optional(),
  adminTitle: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

export const resetAdminPasswordSchema = z.object({
  password: strongPassword,
  forceLogout: z.boolean().optional(),
});

export type CreateAdminInput = z.infer<typeof createAdminSchema>;
export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;
export type ResetAdminPasswordInput = z.infer<typeof resetAdminPasswordSchema>;

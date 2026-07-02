import { z } from 'zod';
import { ROLE_PRESETS } from '../../config/permissions';

const presetKeys = Object.keys(ROLE_PRESETS) as [string, ...string[]];

const strongPassword = z
  .string()
  .min(10, 'Minimum 10 caractères')
  .max(128)
  .regex(/[A-Z]/, 'Au moins une majuscule')
  .regex(/[a-z]/, 'Au moins une minuscule')
  .regex(/[0-9]/, 'Au moins un chiffre');

export const createAdminSchema = z.object({
  email: z.string().trim().email('Email invalide').max(255).transform((v) => v.toLowerCase()),
  password: strongPassword,
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().min(2).max(100),
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

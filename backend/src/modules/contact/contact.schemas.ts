import { z } from 'zod';
import { isValidE164ForCountry } from '../../utils/phone.validation';

export const contactSubjectSchema = z.enum([
  'support_account',
  'support_booking',
  'support_payment',
  'provider_partnership',
  'security_report',
  'other',
]);

export const createContactSchema = z.object({
  firstName: z.string().trim().min(2, 'Prénom requis').max(100),
  lastName: z.string().trim().min(2, 'Nom requis').max(100),
  email: z.string().trim().email('Email invalide').max(255).transform((value) => value.toLowerCase()),
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Téléphone invalide'),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Code pays invalide'),
  subject: contactSubjectSchema,
  message: z.string().trim().min(10, 'Message trop court').max(1500, 'Message trop long (max 1500 caractères)'),
}).superRefine((data, ctx) => {
  if (!isValidE164ForCountry(data.phone, data.countryCode)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['phone'],
      message: `Numéro invalide pour ${data.countryCode}`,
    });
  }
});

export const updateContactStatusSchema = z.object({
  status: z.enum(['read', 'answered', 'done', 'closed']),
  adminResponse: z.string().trim().max(3000).optional().or(z.literal('')),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactStatusInput = z.infer<typeof updateContactStatusSchema>;

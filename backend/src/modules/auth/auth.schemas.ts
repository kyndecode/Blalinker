import { z } from 'zod';

export const registerSchema = z.object({
  phone: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, 'Format téléphone invalide (ex: +221771234567)')
    .optional(),
  email: z
    .string()
    .email('Email invalide')
    .max(255)
    .transform((v) => v.toLowerCase())
    .optional(),
  password: z
    .string()
    .min(8, 'Minimum 8 caractères')
    .max(128, 'Maximum 128 caractères')
    .regex(/[A-Z]/, 'Doit contenir au moins une lettre majuscule')
    .regex(/[a-z]/, 'Doit contenir au moins une lettre minuscule')
    .regex(/[0-9]/, 'Doit contenir au moins un chiffre'),
  role: z.enum(['client', 'provider'], {
    errorMap: () => ({ message: 'Rôle doit être "client" ou "provider"' }),
  }),
}).refine((d) => d.phone || d.email, {
  message: 'Un numéro de téléphone ou un email est requis',
  path: ['phone'],
});

export const verifyOtpSchema = z.object({
  phone: z.string().optional(),
  email: z.string().email().optional(),
  code:  z.string().length(6, 'Le code OTP doit faire 6 chiffres').regex(/^\d{6}$/),
  purpose: z.enum(['registration', 'login', 'password_reset', 'payment_confirm']).optional(),
}).refine((d) => d.phone || d.email, {
  message: 'Phone ou email requis',
});

export const loginSchema = z.object({
  phone:    z.string().optional(),
  email:    z.string().email().optional(),
  password: z.string().min(1, 'Mot de passe requis'),
}).refine((d) => d.phone || d.email, {
  message: 'Phone ou email requis',
});

export const loginMfaSchema = z.object({
  tempToken: z.string().min(1),
  otpCode:   z.string().length(6).regex(/^\d{6}$/),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const resendOtpSchema = z.object({
  phone: z.string().optional(),
  email: z.string().email().optional(),
  purpose: z.enum(['registration', 'login', 'password_reset']).default('registration'),
}).refine((d) => d.phone || d.email, {
  message: 'Phone ou email requis',
});

export const forgotPasswordSchema = z.object({
  phone: z.string().optional(),
  email: z.string().email().optional(),
}).refine((d) => d.phone || d.email, {
  message: 'Phone ou email requis',
});

export const resetPasswordSchema = z.object({
  phone:    z.string().optional(),
  email:    z.string().email().optional(),
  code:     z.string().length(6).regex(/^\d{6}$/),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/[0-9]/),
}).refine((d) => d.phone || d.email, {
  message: 'Phone ou email requis',
});

export type RegisterInput         = z.infer<typeof registerSchema>;
export type VerifyOtpInput        = z.infer<typeof verifyOtpSchema>;
export type LoginInput            = z.infer<typeof loginSchema>;
export type LoginMfaInput         = z.infer<typeof loginMfaSchema>;
export type ForgotPasswordInput   = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput    = z.infer<typeof resetPasswordSchema>;
export type ResendOtpInput        = z.infer<typeof resendOtpSchema>;

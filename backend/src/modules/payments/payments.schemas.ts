import { z } from 'zod';

export const initPaymentSchema = z.object({
  bookingId:   z.string().uuid(),
  provider:    z.enum(['cinetpay', 'stripe', 'wave']).default('cinetpay'),
  currency:    z.enum(['XOF', 'XAF', 'USD']).default('XOF'),
  returnUrl:   z.string().url().optional(),
});

export const verifyPaymentSchema = z.object({
  transactionId: z.string().min(1),
  provider:      z.enum(['cinetpay', 'stripe', 'wave']).default('cinetpay'),
});

export type InitPaymentInput   = z.infer<typeof initPaymentSchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

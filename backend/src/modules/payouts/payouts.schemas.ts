import { z } from 'zod';

export const requestPayoutSchema = z.object({
  method: z.enum(['wave', 'orange_money', 'free_money', 'mtn_momo', 'bank_transfer']).optional(),
  destination: z.string().trim().max(200).optional(),
});

export const processPayoutSchema = z.object({
  action: z.enum(['approved', 'paid', 'rejected']),
  reference: z.string().trim().max(100).optional(),
});

export type RequestPayoutInput = z.infer<typeof requestPayoutSchema>;
export type ProcessPayoutInput = z.infer<typeof processPayoutSchema>;

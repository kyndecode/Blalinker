import { Request, Response } from 'express';
import { paymentService } from './payments.service';
import { initPaymentSchema, verifyPaymentSchema } from './payments.schemas';
import { logger } from '../../config/logger';

type HttpLikeError = {
  status?: number;
  message?: string;
};

function asHttpLikeError(error: unknown): HttpLikeError {
  if (error && typeof error === 'object') {
    return error as HttpLikeError;
  }
  return {};
}

export const paymentsController = {

  /** POST /payments/init — Initier un paiement */
  async init(req: Request, res: Response) {
    const parsed = initPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    }

    const { bookingId, provider, currency, returnUrl } = parsed.data;
    const userId = req.user!.id;

    try {
      let result;
      if (provider === 'cinetpay') {
        result = await paymentService.initCinetPay(bookingId, userId, currency, returnUrl);
      } else if (provider === 'stripe') {
        result = await paymentService.initStripe(bookingId, userId, currency);
      } else {
        return res.status(400).json({ error: 'Provider non supporté' });
      }
      return res.json(result);
    } catch (err: unknown) {
      const httpError = asHttpLikeError(err);
      logger.error('Payment init error', err);
      return res.status(httpError.status ?? 500).json({ error: httpError.message ?? 'Payment init failed' });
    }
  },

  /** GET /payments/verify — Vérifier le statut d'un paiement */
  async verify(req: Request, res: Response) {
    const parsed = verifyPaymentSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    }

    try {
      const result = await paymentService.verifyCinetPay(parsed.data.transactionId);
      return res.json(result);
    } catch (err: unknown) {
      const httpError = asHttpLikeError(err);
      return res.status(httpError.status ?? 500).json({ error: httpError.message ?? 'Payment verify failed' });
    }
  },

  /** POST /payments/webhook/cinetpay — Webhook CinetPay */
  async webhookCinetPay(req: Request, res: Response) {
    try {
      await paymentService.handleCinetPayWebhook(req.body);
      // CinetPay attend une réponse vide 200
      return res.status(200).send();
    } catch (err) {
      logger.error('CinetPay webhook error', err);
      return res.status(200).send(); // Toujours 200 pour éviter les retry infinis
    }
  },

  /** POST /payments/webhook/stripe — Webhook Stripe */
  async webhookStripe(req: Request, res: Response) {
    const signature = req.headers['stripe-signature'] as string;
    try {
      await paymentService.handleStripeWebhook(req.body as Buffer, signature);
      return res.json({ received: true });
    } catch (err: unknown) {
      const httpError = asHttpLikeError(err);
      return res.status(httpError.status ?? 400).json({ error: httpError.message ?? 'Stripe webhook failed' });
    }
  },
};

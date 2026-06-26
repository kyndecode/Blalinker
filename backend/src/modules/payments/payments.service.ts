/**
 * BLA — Service de paiement
 * Supporte : CinetPay (Africa), Stripe (cartes)
 */
import axios from 'axios';
import crypto from 'crypto';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

const CINETPAY_API    = 'https://api-checkout.cinetpay.com/v2/payment';
const CINETPAY_VERIFY = 'https://api-checkout.cinetpay.com/v2/payment/check';

// Devises "zéro décimale" (pas de centimes) — Stripe attend le montant en unité entière.
// https://docs.stripe.com/currencies#zero-decimal
const STRIPE_ZERO_DECIMAL_CURRENCIES = new Set([
  'XOF', 'XAF', 'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW',
  'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XPF',
]);

function toStripeUnitAmount(amount: number, currency: string): number {
  return STRIPE_ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase())
    ? Math.round(amount)
    : Math.round(amount * 100);
}

export class PaymentService {

  // ─── CinetPay ────────────────────────────────────────────

  async initCinetPay(bookingId: string, userId: string, currency: string, returnUrl?: string) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, clientId: userId },
    });
    if (!booking) throw Object.assign(new Error('Réservation introuvable'), { status: 404 });

    const amount = Math.round(Number(booking.amount ?? 0));
    if (!amount) throw Object.assign(new Error('Montant de réservation invalide'), { status: 400 });

    if (!env.CINETPAY_API_KEY || !env.CINETPAY_SITE_ID) {
      // ⚠️ La simulation marque le paiement "completed" SANS encaissement réel.
      // Strictement interdite en production : sinon toute réservation devient gratuite.
      if (env.NODE_ENV === 'production') {
        logger.error('Tentative de paiement alors que CinetPay n\'est pas configuré en production');
        throw Object.assign(
          new Error('Paiement temporairement indisponible. Réessayez plus tard.'),
          { status: 503 }
        );
      }
      return this._simulateMobileMoneyPayment(bookingId, userId, booking.providerId, amount, currency, returnUrl);
    }

    // CinetPay exige un multiple de 5 pour XOF/XAF
    const roundedAmount = currency !== 'USD' ? Math.ceil(amount / 5) * 5 : amount;
    const transactionId = `BLA-${bookingId.slice(0, 8)}-${Date.now()}`;

    const payload = {
      apikey:         env.CINETPAY_API_KEY,
      site_id:        env.CINETPAY_SITE_ID,
      transaction_id: transactionId,
      amount:         roundedAmount,
      currency,
      description:    `BLA - Paiement réservation #${bookingId.slice(0, 8)}`,
      notify_url:     env.CINETPAY_NOTIFY_URL ?? `${env.APP_URL}/api/v1/payments/webhook/cinetpay`,
      return_url:     returnUrl ?? env.CINETPAY_RETURN_URL ?? `${env.APP_URL}/payment/success`,
      channels:       'ALL',  // Wave, Orange Money, MTN, Moov, cartes...
      lang:           'fr',
      metadata:       JSON.stringify({ bookingId, userId }),
    };

    const response = await axios.post(CINETPAY_API, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15_000,
    });

    const { code, payment_token, payment_url } = response.data;

    if (code !== '201') {
      logger.error('CinetPay init error', response.data);
      throw Object.assign(new Error('Erreur initialisation paiement CinetPay'), { status: 502 });
    }

    await prisma.transaction.create({
      data: {
        bookingId,
        payerId:     userId,
        payeeId:     booking.providerId,
        amount:      roundedAmount,
        netAmount:   roundedAmount,   // ajusté à la confirmation (après commission)
        currency,
        method:      'wave',          // méthode par défaut CinetPay, mise à jour via webhook
        externalRef: transactionId,
        metadata:    { provider: 'cinetpay', paymentToken: payment_token },
      },
    });

    logger.info(`Paiement CinetPay initié: ${transactionId} (${roundedAmount} ${currency})`);
    return { paymentUrl: payment_url, transactionId, token: payment_token };
  }

  async getBookingPaymentStatus(bookingId: string, userId: string) {
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        OR: [{ clientId: userId }, { providerId: userId }],
      },
      select: { id: true, status: true, amount: true, currency: true },
    });

    if (!booking) {
      throw Object.assign(new Error('Réservation introuvable'), { status: 404 });
    }

    const transaction = await prisma.transaction.findUnique({
      where: { bookingId },
      select: {
        id: true,
        status: true,
        method: true,
        amount: true,
        currency: true,
        paidAt: true,
        externalRef: true,
        externalStatus: true,
      },
    });

    if (!transaction) {
      return {
        bookingId,
        bookingStatus: booking.status,
        paymentStatus: 'unpaid',
        amount: booking.amount ? Number(booking.amount) : 0,
        currency: booking.currency,
      };
    }

    return {
      bookingId,
      bookingStatus: booking.status,
      paymentStatus: transaction.status,
      transactionId: transaction.id,
      method: transaction.method,
      amount: Number(transaction.amount),
      currency: transaction.currency,
      paidAt: transaction.paidAt,
      externalRef: transaction.externalRef,
      externalStatus: transaction.externalStatus,
    };
  }

  /**
   * Vérifie le statut d'un paiement auprès de CinetPay (source de vérité).
   * @param userId  Si fourni, restreint la transaction au payeur (anti-IDOR).
   */
  async verifyCinetPay(transactionId: string, userId?: string) {
    const transaction = await prisma.transaction.findFirst({
      where: {
        externalRef: transactionId,
        ...(userId ? { payerId: userId } : {}),
      },
    });
    if (!transaction) throw Object.assign(new Error('Transaction introuvable'), { status: 404 });

    // Idempotence : ne pas re-confirmer une transaction déjà complétée.
    if (transaction.status === 'completed') {
      return { status: 'paid', transactionId };
    }

    const response = await axios.post(CINETPAY_VERIFY, {
      apikey:         env.CINETPAY_API_KEY,
      site_id:        env.CINETPAY_SITE_ID,
      transaction_id: transactionId,
    }, { timeout: 10_000 });

    const { code, data } = response.data;

    if (code === '00' && data?.status === 'ACCEPTED') {
      await this._confirmPayment(transaction.bookingId, transaction.id, transactionId);
      return { status: 'paid', transactionId };
    }

    return { status: data?.status?.toLowerCase() ?? 'pending', transactionId };
  }

  // ─── Webhook CinetPay ────────────────────────────────────

  async handleCinetPayWebhook(body: Record<string, string>, headers: Record<string, unknown> = {}) {
    const cpmTransId = body?.cpm_trans_id;
    if (!cpmTransId) {
      logger.warn('Webhook CinetPay sans cpm_trans_id — ignoré');
      return;
    }

    logger.info(`Webhook CinetPay reçu: ${cpmTransId}`);

    // 1. Vérifier la signature HMAC (x-token) si le secret est configuré.
    //    On NE fait jamais confiance au corps de la requête sans cette vérification.
    if (env.CINETPAY_SECRET_KEY) {
      if (!this._isValidCinetPayToken(body, headers)) {
        logger.warn(`Webhook CinetPay: signature HMAC invalide pour ${cpmTransId} — rejeté`);
        return;
      }
    } else {
      logger.warn('CINETPAY_SECRET_KEY non configurée : vérification HMAC du webhook désactivée');
    }

    // 2. NE PAS croire cpm_result. On re-vérifie le statut directement auprès de
    //    l'API CinetPay (source de vérité) avant toute confirmation.
    if (!env.CINETPAY_API_KEY || !env.CINETPAY_SITE_ID) {
      logger.error('Webhook CinetPay reçu mais API non configurée : confirmation impossible');
      return;
    }

    try {
      await this.verifyCinetPay(cpmTransId); // confirme uniquement si l'API renvoie ACCEPTED
    } catch (err) {
      logger.error('Webhook CinetPay: échec de la re-vérification', {
        cpmTransId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Vérifie le HMAC-SHA256 (x-token) envoyé par CinetPay sur ses webhooks. */
  private _isValidCinetPayToken(body: Record<string, string>, headers: Record<string, unknown>): boolean {
    const secret = env.CINETPAY_SECRET_KEY;
    if (!secret) return false;

    const received = String(
      headers['x-token'] ?? headers['X-TOKEN'] ?? headers['X-Token'] ?? ''
    );
    if (!received) return false;

    // Concaténation des champs dans l'ordre imposé par la documentation CinetPay.
    const data = [
      body.cpm_site_id, body.cpm_trans_id, body.cpm_trans_date, body.cpm_amount,
      body.cpm_currency, body.signature, body.payment_method, body.cel_phone_num,
      body.cpm_phone_prefixe, body.cpm_language, body.cpm_version,
      body.cpm_payment_config, body.cpm_page_action, body.cpm_custom,
      body.cpm_designation, body.cpm_error_message,
    ].map((v) => v ?? '').join('');

    const expected = crypto.createHmac('sha256', secret).update(data).digest('hex');

    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(received, 'hex');
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  // ─── Stripe ──────────────────────────────────────────────

  async initStripe(bookingId: string, userId: string, currency: string) {
    if (!env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY === 'not_configured') {
      throw Object.assign(new Error('Stripe non configuré'), { status: 503 });
    }

    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, clientId: userId },
    });
    if (!booking) throw Object.assign(new Error('Réservation introuvable'), { status: 404 });

    const amount = Math.round(Number(booking.amount ?? 0));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency:     currency.toLowerCase(),
          unit_amount:  toStripeUnitAmount(amount, currency),
          product_data: { name: `BLA - Réservation #${bookingId.slice(0, 8)}` },
        },
        quantity: 1,
      }],
      mode:        'payment',
      success_url: `${env.APP_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${env.APP_URL}/payment/cancel`,
      metadata:    { bookingId, userId },
    });

    await prisma.transaction.create({
      data: {
        bookingId,
        payerId:     userId,
        payeeId:     booking.providerId,
        amount,
        netAmount:   amount,
        currency,
        method:      'bank_transfer',
        externalRef: session.id,
        metadata:    { provider: 'stripe' },
      },
    });

    return { paymentUrl: session.url!, transactionId: session.id };
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) return;

    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch {
      throw Object.assign(new Error('Signature Stripe invalide'), { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as unknown as { id: string; metadata: { bookingId: string } };
      const transaction = await prisma.transaction.findFirst({ where: { externalRef: session.id } });
      if (transaction) {
        await this._confirmPayment(session.metadata.bookingId, transaction.id, session.id);
      }
    }
  }

  // ─── Méthodes privées ────────────────────────────────────

  private async _confirmPayment(bookingId: string, transactionId: string, externalRef: string) {
    // Calculer la commission de la plateforme à partir du taux de la réservation.
    const [booking, transaction] = await Promise.all([
      prisma.booking.findUnique({ where: { id: bookingId }, select: { commissionRate: true } }),
      prisma.transaction.findUnique({ where: { id: transactionId }, select: { amount: true } }),
    ]);

    const amount = Number(transaction?.amount ?? 0);
    const rate = Number(booking?.commissionRate ?? 0);
    const commission = Math.round((amount * rate) / 100);
    const netAmount = Math.max(0, amount - commission);

    await prisma.$transaction([
      prisma.transaction.update({
        where: { id: transactionId },
        data:  { status: 'completed', paidAt: new Date(), commission, netAmount },
      }),
      prisma.booking.update({
        where: { id: bookingId },
        data:  { status: 'accepted', commissionAmt: commission },
      }),
    ]);
    logger.info(`Paiement confirmé: booking=${bookingId} tx=${externalRef} commission=${commission}`);
  }

  private async _simulateMobileMoneyPayment(
    bookingId: string,
    userId: string,
    payeeId: string,
    amount: number,
    currency: string,
    returnUrl?: string
  ) {
    const simulationRef = `SIM-${bookingId.slice(0, 8)}-${Date.now()}`;

    const transaction = await prisma.transaction.upsert({
      where: { bookingId },
      update: {
        status: 'completed',
        method: 'wave',
        amount,
        netAmount: amount,
        currency,
        paidAt: new Date(),
        externalRef: simulationRef,
        externalStatus: 'SIMULATED_SUCCESS',
        metadata: {
          provider: 'simulation',
          simulatedAt: new Date().toISOString(),
        },
      },
      create: {
        bookingId,
        payerId: userId,
        payeeId,
        amount,
        netAmount: amount,
        currency,
        method: 'wave',
        status: 'completed',
        paidAt: new Date(),
        externalRef: simulationRef,
        externalStatus: 'SIMULATED_SUCCESS',
        metadata: {
          provider: 'simulation',
          simulatedAt: new Date().toISOString(),
        },
      },
    });

    await prisma.booking.updateMany({
      where: { id: bookingId, status: 'pending' },
      data: { status: 'accepted' },
    });

    logger.warn(`Paiement simulé (CinetPay non configuré): booking=${bookingId} ref=${simulationRef}`);

    return {
      simulated: true,
      paymentUrl: returnUrl ?? `${env.APP_URL}/payment/success?simulated=1&booking=${bookingId}`,
      transactionId: transaction.id,
      externalRef: simulationRef,
      status: 'paid',
    };
  }
}

export const paymentService = new PaymentService();

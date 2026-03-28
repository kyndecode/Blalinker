/**
 * BLA — Service de paiement
 * Supporte : CinetPay (Africa), Stripe (cartes), Wave (direct)
 */
import axios from 'axios';
import crypto from 'crypto';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import type { InitPaymentInput } from './payments.schemas';

const CINETPAY_API = 'https://api-checkout.cinetpay.com/v2/payment';
const CINETPAY_VERIFY = 'https://api-checkout.cinetpay.com/v2/payment/check';

export class PaymentService {

  // ─── CinetPay ────────────────────────────────────────────

  async initCinetPay(bookingId: string, userId: string, currency: string, returnUrl?: string) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, clientId: userId },
      include: { service: true },
    });
    if (!booking) throw Object.assign(new Error('Réservation introuvable'), { status: 404 });
    if (booking.paymentStatus === 'paid') {
      throw Object.assign(new Error('Cette réservation est déjà payée'), { status: 409 });
    }

    const transactionId = `BLA-${bookingId.slice(0, 8)}-${Date.now()}`;
    const amount = Math.round(Number(booking.totalPrice));

    // CinetPay exige un multiple de 5 pour XOF/XAF
    const roundedAmount = currency !== 'USD' ? Math.ceil(amount / 5) * 5 : amount;

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

    // Sauvegarder la transaction en base
    await prisma.transaction.create({
      data: {
        bookingId,
        userId,
        amount:        roundedAmount,
        currency,
        provider:      'cinetpay',
        externalId:    transactionId,
        paymentToken:  payment_token,
        status:        'pending',
      },
    });

    logger.info(`Paiement CinetPay initié: ${transactionId} (${roundedAmount} ${currency})`);
    return { paymentUrl: payment_url, transactionId, token: payment_token };
  }

  async verifyCinetPay(transactionId: string) {
    const transaction = await prisma.transaction.findFirst({
      where: { externalId: transactionId, provider: 'cinetpay' },
    });
    if (!transaction) throw Object.assign(new Error('Transaction introuvable'), { status: 404 });

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

  async handleCinetPayWebhook(body: Record<string, string>) {
    const { cpm_trans_id, cpm_result, cpm_error_message } = body;

    logger.info(`Webhook CinetPay: ${cpm_trans_id} → ${cpm_result}`);

    if (cpm_result !== '00') {
      logger.warn(`Paiement échoué: ${cpm_trans_id} — ${cpm_error_message}`);
      await prisma.transaction.updateMany({
        where:  { externalId: cpm_trans_id },
        data:   { status: 'failed' },
      });
      return;
    }

    const transaction = await prisma.transaction.findFirst({
      where: { externalId: cpm_trans_id },
    });
    if (!transaction || transaction.status === 'completed') return;

    await this._confirmPayment(transaction.bookingId, transaction.id, cpm_trans_id);
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

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency:     currency.toLowerCase(),
          unit_amount:  Math.round(Number(booking.totalPrice) * 100),
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
        userId,
        amount:       Math.round(Number(booking.totalPrice)),
        currency,
        provider:     'stripe',
        externalId:   session.id,
        paymentToken: session.id,
        status:       'pending',
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
      const session = event.data.object as { id: string; metadata: { bookingId: string } };
      const transaction = await prisma.transaction.findFirst({ where: { externalId: session.id } });
      if (transaction) {
        await this._confirmPayment(session.metadata.bookingId, transaction.id, session.id);
      }
    }
  }

  // ─── Méthodes privées ────────────────────────────────────

  private async _confirmPayment(bookingId: string, transactionId: string, externalId: string) {
    await prisma.$transaction([
      prisma.transaction.update({
        where: { id: transactionId },
        data:  { status: 'completed', paidAt: new Date() },
      }),
      prisma.booking.update({
        where: { id: bookingId },
        data:  { paymentStatus: 'paid', status: 'confirmed' },
      }),
    ]);
    logger.info(`Paiement confirmé: booking=${bookingId} tx=${externalId}`);
  }
}

export const paymentService = new PaymentService();

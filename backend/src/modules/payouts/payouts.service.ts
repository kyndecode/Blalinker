import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

export const payoutsService = {
  /** Solde d'un prestataire : disponible (escrow libéré, non retiré) + en attente (escrow). */
  async getBalance(providerId: string) {
    const [available, held, pending] = await Promise.all([
      prisma.transaction.aggregate({
        where: { payeeId: providerId, status: 'completed', releasedAt: { not: null }, payoutId: null },
        _sum: { netAmount: true },
      }),
      prisma.transaction.aggregate({
        where: { payeeId: providerId, status: 'completed', releasedAt: null },
        _sum: { netAmount: true },
      }),
      prisma.payout.aggregate({
        where: { providerId, status: { in: ['pending', 'approved'] } },
        _sum: { amount: true },
      }),
    ]);
    return {
      available: Number(available._sum.netAmount ?? 0),
      held: Number(held._sum.netAmount ?? 0),          // en cours de prestation / non validé
      pendingWithdrawal: Number(pending._sum.amount ?? 0),
      currency: 'XOF',
    };
  },

  /** Le prestataire demande le retrait de la totalité de son solde disponible. */
  async requestPayout(providerId: string, method?: string, destination?: string) {
    return prisma.$transaction(async (tx) => {
      const claimable = await tx.transaction.findMany({
        where: { payeeId: providerId, status: 'completed', releasedAt: { not: null }, payoutId: null },
        select: { id: true, netAmount: true, currency: true },
      });
      if (claimable.length === 0) throw httpError('Aucun montant disponible au retrait.', 400);

      const amount = claimable.reduce((sum, t) => sum + Number(t.netAmount), 0);
      const currency = claimable[0].currency;

      const payout = await tx.payout.create({
        data: { providerId, amount, currency, method, destination, status: 'pending' },
      });
      await tx.transaction.updateMany({
        where: { id: { in: claimable.map((t) => t.id) } },
        data: { payoutId: payout.id },
      });
      return payout;
    });
  },

  async listProviderPayouts(providerId: string) {
    return prisma.payout.findMany({ where: { providerId }, orderBy: { createdAt: 'desc' }, take: 50 });
  },

  /** Admin : traiter un retrait (approuver / marquer payé / rejeter). */
  async processPayout(payoutId: string, adminId: string, action: 'approved' | 'paid' | 'rejected', reference?: string) {
    const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw httpError('Retrait introuvable', 404);
    if (payout.status === 'paid') throw httpError('Ce retrait est déjà réglé.', 400);

    if (action === 'rejected') {
      await prisma.$transaction([
        prisma.transaction.updateMany({ where: { payoutId }, data: { payoutId: null } }),
        prisma.payout.update({ where: { id: payoutId }, data: { status: 'rejected', processedBy: adminId, processedAt: new Date() } }),
      ]);
      return { status: 'rejected' };
    }

    await prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: action,
        reference: reference ?? payout.reference,
        processedBy: adminId,
        processedAt: action === 'paid' ? new Date() : payout.processedAt,
      },
    });
    return { status: action };
  },

  /** Admin : rembourser un paiement (Stripe si possible, sinon marquage manuel). */
  async refundTransaction(transactionId: string) {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { payout: true },
    });
    if (!transaction) throw httpError('Transaction introuvable', 404);
    if (transaction.status !== 'completed') throw httpError('Seuls les paiements complétés sont remboursables.', 400);
    if (transaction.payout && transaction.payout.status === 'paid') {
      throw httpError('Fonds déjà reversés au prestataire — remboursement manuel requis.', 400);
    }

    const provider = (transaction.metadata as { provider?: string } | null)?.provider;
    if (provider === 'stripe' && env.STRIPE_SECRET_KEY && transaction.externalRef) {
      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(env.STRIPE_SECRET_KEY);
        const session = await stripe.checkout.sessions.retrieve(transaction.externalRef);
        const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
        if (paymentIntent) await stripe.refunds.create({ payment_intent: paymentIntent });
      } catch (err) {
        logger.error('Remboursement Stripe échoué (marquage manuel)', err);
      }
    }

    await prisma.$transaction([
      prisma.transaction.update({ where: { id: transactionId }, data: { status: 'refunded', releasedAt: null, payoutId: null } }),
      prisma.booking.update({ where: { id: transaction.bookingId }, data: { status: 'cancelled', cancellationReason: 'Remboursement' } }),
    ]);
    logger.info(`Transaction remboursée: ${transactionId}`);
    return { status: 'refunded' };
  },

  async listAllPayouts(where: Record<string, unknown>, skip: number, take: number) {
    return Promise.all([
      prisma.payout.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { provider: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } } },
      }),
      prisma.payout.count({ where }),
    ]);
  },
};

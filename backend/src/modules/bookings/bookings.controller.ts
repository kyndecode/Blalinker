import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendEmail } from '../../config/email';
import { logger } from '../../config/logger';
import { getPaginationParams, getSkip, paginate } from '../../utils/pagination.util';
import { escapeHtml } from '../../utils/html.util';
import { publicPersonSelect, toPublicPerson } from '../../utils/serializers';
import type { CreateBookingInput } from './bookings.schemas';

type BookingStatus = 'pending' | 'accepted' | 'rejected' | 'in_progress' | 'completed' | 'validated' | 'cancelled' | 'disputed';

type BookingNotificationContext = {
  id: string;
  status: BookingStatus;
  scheduledAt: Date | null;
  amount: unknown;
  currency: string;
  service: { title: string } | null;
  client: {
    email: string | null;
    profile: { firstName: string; lastName: string } | null;
  };
  provider: {
    email: string | null;
    profile: { firstName: string; lastName: string } | null;
  };
};

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'En attente',
  accepted: 'Acceptee',
  rejected: 'Refusee',
  in_progress: 'En cours',
  completed: 'Terminee',
  validated: 'Validee',
  cancelled: 'Annulee',
  disputed: 'En litige',
};

function bookingRef(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function formatFullName(profile: { firstName: string; lastName: string } | null, fallback: string): string {
  if (!profile) return fallback;
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  return fullName || fallback;
}

function formatScheduledAt(value: Date | null): string {
  if (!value) return 'A planifier';
  return value.toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAmount(amount: unknown, currency: string): string {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value) || value <= 0) return `0 ${currency}`;
  return `${value.toLocaleString('fr-FR')} ${currency}`;
}

async function loadBookingNotificationContext(bookingId: string): Promise<BookingNotificationContext | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      amount: true,
      currency: true,
      service: { select: { title: true } },
      client: {
        select: {
          email: true,
          profile: { select: { firstName: true, lastName: true } },
        },
      },
      provider: {
        select: {
          email: true,
          profile: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  if (!booking) return null;

  return {
    ...booking,
    status: booking.status as BookingStatus,
  };
}

async function safeSendEmail(payload: { to: string; subject: string; html: string }, tag: string): Promise<void> {
  try {
    await sendEmail(payload);
  } catch (error) {
    logger.error(`Erreur email reservation (${tag})`, error);
  }
}

async function notifyBookingCreated(bookingId: string): Promise<void> {
  const booking = await loadBookingNotificationContext(bookingId);
  if (!booking) return;

  const ref = bookingRef(booking.id);
  const clientName = escapeHtml(formatFullName(booking.client.profile, 'Client'));
  const providerName = escapeHtml(formatFullName(booking.provider.profile, 'Prestataire'));
  const scheduledAt = formatScheduledAt(booking.scheduledAt);
  const amount = formatAmount(booking.amount, booking.currency);
  const serviceTitle = escapeHtml(booking.service?.title ?? 'Service');

  if (booking.client.email) {
    await safeSendEmail({
      to: booking.client.email,
      subject: `BLA - Reservation envoyee #${ref}`,
      html: `
        <p>Bonjour <strong>${clientName}</strong>,</p>
        <p>Votre demande de reservation a bien ete enregistree.</p>
        <p><strong>Reference:</strong> ${ref}</p>
        <p><strong>Prestataire:</strong> ${providerName}</p>
        <p><strong>Service:</strong> ${serviceTitle}</p>
        <p><strong>Date souhaitee:</strong> ${scheduledAt}</p>
        <p><strong>Montant estime:</strong> ${amount}</p>
        <p>Vous recevrez un email des que le prestataire repondra.</p>
      `,
    }, 'create-client');
  }

  if (booking.provider.email) {
    await safeSendEmail({
      to: booking.provider.email,
      subject: `BLA - Nouvelle reservation #${ref}`,
      html: `
        <p>Bonjour <strong>${providerName}</strong>,</p>
        <p>Vous avez recu une nouvelle demande de reservation.</p>
        <p><strong>Reference:</strong> ${ref}</p>
        <p><strong>Client:</strong> ${clientName}</p>
        <p><strong>Service:</strong> ${serviceTitle}</p>
        <p><strong>Date souhaitee:</strong> ${scheduledAt}</p>
        <p><strong>Montant estime:</strong> ${amount}</p>
        <p>Connectez-vous pour accepter ou refuser la demande.</p>
      `,
    }, 'create-provider');
  }
}

async function notifyBookingStatusChanged(bookingId: string, status: BookingStatus): Promise<void> {
  const booking = await loadBookingNotificationContext(bookingId);
  if (!booking) return;

  const ref = bookingRef(booking.id);
  const clientName = escapeHtml(formatFullName(booking.client.profile, 'Client'));
  const providerName = escapeHtml(formatFullName(booking.provider.profile, 'Prestataire'));
  const statusLabel = STATUS_LABELS[status];
  const serviceTitle = escapeHtml(booking.service?.title ?? 'Service');
  const amount = formatAmount(booking.amount, booking.currency);
  const scheduledAt = formatScheduledAt(booking.scheduledAt);

  const notifyClientStatuses: BookingStatus[] = ['accepted', 'rejected', 'in_progress', 'completed', 'cancelled'];
  const notifyProviderStatuses: BookingStatus[] = ['validated', 'cancelled'];

  if (booking.client.email && notifyClientStatuses.includes(status)) {
    await safeSendEmail({
      to: booking.client.email,
      subject: `BLA - Reservation ${statusLabel.toLowerCase()} #${ref}`,
      html: `
        <p>Bonjour <strong>${clientName}</strong>,</p>
        <p>Le statut de votre reservation est passe a: <strong>${statusLabel}</strong>.</p>
        <p><strong>Reference:</strong> ${ref}</p>
        <p><strong>Prestataire:</strong> ${providerName}</p>
        <p><strong>Service:</strong> ${serviceTitle}</p>
        <p><strong>Date:</strong> ${scheduledAt}</p>
        <p><strong>Montant:</strong> ${amount}</p>
      `,
    }, `status-client-${status}`);
  }

  if (booking.provider.email && notifyProviderStatuses.includes(status)) {
    await safeSendEmail({
      to: booking.provider.email,
      subject: `BLA - Reservation ${statusLabel.toLowerCase()} #${ref}`,
      html: `
        <p>Bonjour <strong>${providerName}</strong>,</p>
        <p>Le statut de la reservation est passe a: <strong>${statusLabel}</strong>.</p>
        <p><strong>Reference:</strong> ${ref}</p>
        <p><strong>Client:</strong> ${clientName}</p>
        <p><strong>Service:</strong> ${serviceTitle}</p>
        <p><strong>Date:</strong> ${scheduledAt}</p>
        <p><strong>Montant:</strong> ${amount}</p>
      `,
    }, `status-provider-${status}`);
  }
}

const BOOKING_STATUSES: readonly BookingStatus[] = [
  'pending', 'accepted', 'rejected', 'in_progress', 'completed', 'validated', 'cancelled', 'disputed',
];

/** Transaction visible par le client et le prestataire (sans métadonnées du prestataire de paiement). */
const bookingTransactionSelect = {
  id: true,
  status: true,
  amount: true,
  commission: true,
  netAmount: true,
  currency: true,
  method: true,
  paidAt: true,
  releasedAt: true,
} as const;

type Actor = 'client' | 'provider' | 'either';

interface TransitionRule {
  from: BookingStatus[];
  to: BookingStatus;
  actor: Actor;
  /** Rôle exigé (403 sinon) ; absent = pas de contrôle de rôle supplémentaire. */
  role?: 'client' | 'provider';
  stamp?: 'startedAt' | 'completedAt' | 'validatedAt';
}

export const BOOKING_TRANSITIONS = {
  accept:   { from: ['pending'],     to: 'accepted',    actor: 'provider', role: 'provider' },
  reject:   { from: ['pending'],     to: 'rejected',    actor: 'provider', role: 'provider' },
  start:    { from: ['accepted'],    to: 'in_progress', actor: 'provider', role: 'provider', stamp: 'startedAt' },
  complete: { from: ['in_progress'], to: 'completed',   actor: 'provider', role: 'provider', stamp: 'completedAt' },
  validate: { from: ['completed'],   to: 'validated',   actor: 'client',   role: 'client',   stamp: 'validatedAt' },
  cancel:   { from: ['pending', 'accepted'], to: 'cancelled', actor: 'either' },
} satisfies Record<string, TransitionRule>;

function ownership(actor: Actor, userId: string) {
  if (actor === 'provider') return { providerId: userId };
  if (actor === 'client') return { clientId: userId };
  return { OR: [{ clientId: userId }, { providerId: userId }] };
}

const PAID_STATUSES: ('completed' | 'processing')[] = ['completed', 'processing'];

/** Une réservation déjà payée ne s'annule pas en libre-service (remboursement via le support). */
const NOT_PAID = {
  OR: [
    { transaction: { is: null } },
    { transaction: { is: { status: { notIn: PAID_STATUSES } } } },
  ],
};

/**
 * Changement d'état ATOMIQUE : la mise à jour n'a lieu que si la réservation
 * appartient à l'utilisateur ET est encore dans l'état attendu. Deux requêtes
 * simultanées ne peuvent donc pas appliquer deux fois la même transition.
 */
async function applyTransition(req: Request, res: Response, rule: TransitionRule, extraData: Record<string, unknown> = {}) {
  const { id } = req.params;
  const userId = req.user!.id;
  if (rule.role && req.user!.role !== rule.role) {
    return res.status(403).json({ error: 'Action non autorisée' });
  }

  const owner = ownership(rule.actor, userId);
  const guard = rule.to === 'cancelled' ? [owner, NOT_PAID] : [owner];
  const now = new Date();

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const { count } = await tx.booking.updateMany({
        where: { id, status: { in: rule.from }, AND: guard },
        data: { status: rule.to, ...(rule.stamp ? { [rule.stamp]: now } : {}), ...extraData },
      });
      if (count === 0) return null;
      if (rule.to === 'validated') {
        // Escrow : la validation client libère les fonds vers le solde du prestataire.
        await tx.transaction.updateMany({
          where: { bookingId: id, status: 'completed', releasedAt: null },
          data: { releasedAt: now },
        });
      }
      return tx.booking.findUnique({ where: { id } });
    });

    if (!updated) {
      const current = await prisma.booking.findFirst({
        where: { id, ...owner },
        select: { status: true, transaction: { select: { status: true } } },
      });
      if (!current) return res.status(404).json({ error: 'Réservation introuvable' });
      const paid = PAID_STATUSES.includes(current.transaction?.status as 'completed' | 'processing');
      if (rule.to === 'cancelled' && rule.from.includes(current.status as BookingStatus) && paid) {
        return res.status(409).json({
          error: 'Cette réservation est déjà payée : contactez le support pour une annulation avec remboursement.',
          code: 'BOOKING_ALREADY_PAID',
        });
      }
      return res.status(409).json({
        error: "Action impossible dans l'état actuel de la réservation.",
        code: 'BOOKING_STATUS_CONFLICT',
        status: current.status,
      });
    }

    void notifyBookingStatusChanged(updated.id, rule.to).catch((error) => {
      logger.error(`Erreur notifications reservation ${rule.to} (${updated.id})`, error);
    });
    return res.json(updated);
  } catch (err) {
    logger.error('Erreur transition réservation', { bookingId: id, to: rule.to, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

export const bookingsController = {
  async list(req: Request, res: Response) {
    const { page, limit } = getPaginationParams(req.query as Record<string, unknown>);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    if (status && !BOOKING_STATUSES.includes(status as BookingStatus)) {
      return res.status(422).json({ error: 'Statut invalide' });
    }

    // Uniquement SES réservations ; la vue globale passe par /admin/bookings (permission dédiée).
    const roleFilter =
      req.user!.role === 'client'
        ? { clientId: req.user!.id }
        : req.user!.role === 'provider'
          ? { providerId: req.user!.id }
          : { OR: [{ clientId: req.user!.id }, { providerId: req.user!.id }] };

    const where = {
      ...roleFilter,
      ...(status ? { status: status as BookingStatus } : {}),
    };

    try {
      const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: getSkip({ page, limit }),
          take: limit,
          include: {
            client: { select: publicPersonSelect },
            provider: { select: publicPersonSelect },
            service: {
              select: { id: true, title: true, price: true, category: { select: { name: true, slug: true } } },
            },
            transaction: { select: { status: true } },
          },
        }),
        prisma.booking.count({ where }),
      ]);

      const normalized = bookings.map((booking) => ({
        ...booking,
        client: toPublicPerson(booking.client),
        provider: toPublicPerson(booking.provider),
        service: booking.service
          ? { ...booking.service, name: booking.service.title }
          : null,
      }));

      const paged = paginate(normalized, total, { page, limit });
      return res.json({
        ...paged,
        bookings: paged.data,
      });
    } catch {
      return res.status(500).json({ error: 'Erreur lors du chargement des réservations' });
    }
  },

  async create(req: Request, res: Response) {
    const data = req.body as CreateBookingInput;
    try {
      const provider = await prisma.user.findFirst({
        where: { id: data.providerId, role: 'provider', status: 'active', deletedAt: null },
      });
      if (!provider) return res.status(404).json({ error: 'Prestataire introuvable ou inactif' });

      // Le montant est déterminé UNIQUEMENT côté serveur via le service choisi.
      // On exige donc un service actif avec un prix défini (anti-manipulation de prix).
      if (!data.serviceId) {
        return res.status(400).json({ error: 'Sélectionnez un service pour réserver.' });
      }

      const selectedService = await prisma.providerService.findFirst({
        where: {
          id: data.serviceId,
          providerId: data.providerId,
          isActive: true,
        },
        select: { id: true, price: true },
      });

      if (!selectedService) {
        return res.status(404).json({ error: 'Service introuvable pour ce prestataire' });
      }

      const amount = selectedService.price !== null && selectedService.price !== undefined
        ? Number(selectedService.price)
        : undefined;

      if (amount === undefined || !Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Ce service n\'a pas de prix valide. Contactez le prestataire.' });
      }

      const booking = await prisma.booking.create({
        data: {
          clientId:      req.user!.id,
          providerId:    data.providerId,
          serviceId:     selectedService?.id ?? data.serviceId,
          description:   data.description,
          scheduledAt:   data.scheduledAt ? new Date(data.scheduledAt) : undefined,
          clientLat:     data.clientLat,
          clientLng:     data.clientLng,
          clientAddress: data.clientAddress,
          amount,
          status:        'pending',
        },
      });
      void notifyBookingCreated(booking.id).catch((error) => {
        logger.error(`Erreur notifications reservation create (${booking.id})`, error);
      });
      return res.status(201).json(booking);
    } catch (err) {
      return res.status(500).json({ error: 'Erreur lors de la création de la réservation' });
    }
  },

  async getOne(req: Request, res: Response) {
    const { id } = req.params;
    try {
      // Chaque partie ne voit de l'autre que son nom et son avatar (jamais e-mail,
      // téléphone, pièce d'identité, date de naissance ou adresse personnelle).
      const booking = await prisma.booking.findFirst({
        where: { id, OR: [{ clientId: req.user!.id }, { providerId: req.user!.id }] },
        include: {
          client: { select: publicPersonSelect },
          provider: {
            select: {
              ...publicPersonSelect,
              providerProfile: { select: { businessName: true, ratingAverage: true, ratingCount: true } },
            },
          },
          service: { include: { category: { select: { id: true, name: true, slug: true } } } },
          transaction: { select: bookingTransactionSelect },
        },
      });
      if (!booking) return res.status(404).json({ error: 'Réservation introuvable' });
      return res.json({
        ...booking,
        client: toPublicPerson(booking.client),
        provider: { ...toPublicPerson(booking.provider), providerProfile: booking.provider.providerProfile },
        service: booking.service ? { ...booking.service, name: booking.service.title } : null,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async accept(req: Request, res: Response) {
    return applyTransition(req, res, BOOKING_TRANSITIONS.accept);
  },

  async reject(req: Request, res: Response) {
    return applyTransition(req, res, BOOKING_TRANSITIONS.reject);
  },

  async start(req: Request, res: Response) {
    return applyTransition(req, res, BOOKING_TRANSITIONS.start);
  },

  async complete(req: Request, res: Response) {
    return applyTransition(req, res, BOOKING_TRANSITIONS.complete);
  },

  async validate(req: Request, res: Response) {
    return applyTransition(req, res, BOOKING_TRANSITIONS.validate);
  },

  async cancel(req: Request, res: Response) {
    const raw = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    return applyTransition(req, res, BOOKING_TRANSITIONS.cancel, { cancellationReason: raw ? raw.slice(0, 500) : null });
  },
};

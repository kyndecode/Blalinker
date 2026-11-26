import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendEmail } from '../../config/email';
import { logger } from '../../config/logger';
import { getPaginationParams, getSkip, paginate } from '../../utils/pagination.util';
import { escapeHtml } from '../../utils/html.util';
import { publicPersonSelect, toPublicPerson } from '../../utils/serializers';
import type { Booking, Prisma } from '@prisma/client';
import { notifyStaff, notifyUser, type NotificationType } from '../notifications/notifications.service';
import type { CreateBookingInput, DisputeBookingInput } from './bookings.schemas';
import { moderationStatus } from '../reviews/reviews.controller';

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

/** Notification dans l'application pour la contrepartie de l'action (jamais l'auteur). */
const IN_APP_STATUS: Partial<Record<BookingStatus, { type: NotificationType; title: string; body: string; to: 'client' | 'provider' | 'other' }>> = {
  accepted:    { type: 'booking.accepted',  to: 'client',   title: 'Réservation acceptée', body: 'Le prestataire a accepté votre demande.' },
  rejected:    { type: 'booking.rejected',  to: 'client',   title: 'Réservation refusée',  body: "Le prestataire n'est pas disponible pour cette demande." },
  in_progress: { type: 'booking.started',   to: 'client',   title: 'Mission démarrée',     body: 'Le prestataire a démarré la mission.' },
  completed:   { type: 'booking.completed', to: 'client',   title: 'Mission terminée',     body: 'Confirmez la réalisation ou signalez un problème.' },
  validated:   { type: 'booking.validated', to: 'provider', title: 'Mission validée',      body: 'Le client a confirmé la réalisation de la mission.' },
  cancelled:   { type: 'booking.cancelled', to: 'other',    title: 'Réservation annulée',  body: 'La réservation a été annulée.' },
  disputed:    { type: 'booking.disputed',  to: 'provider', title: 'Problème signalé',     body: "Le client a signalé un problème. L'équipe BLA examine la situation." },
};

export async function notifyBookingInApp(
  booking: { id: string; clientId: string; providerId: string },
  status: BookingStatus,
  actorId: string,
): Promise<void> {
  const cfg = IN_APP_STATUS[status];
  if (!cfg) return;
  const recipient = cfg.to === 'client'
    ? booking.clientId
    : cfg.to === 'provider'
      ? booking.providerId
      : (actorId === booking.clientId ? booking.providerId : booking.clientId);
  if (recipient === actorId) return;
  await notifyUser(recipient, {
    type: cfg.type,
    title: cfg.title,
    body: cfg.body,
    link: `/bookings/${booking.id}`,
    data: { bookingId: booking.id, status },
  });
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
  // Le client signale un problème pendant ou après la mission : les fonds restent bloqués
  // jusqu'à la décision de l'équipe (POST /admin/bookings/:id/resolve-dispute).
  dispute:  { from: ['in_progress', 'completed'], to: 'disputed', actor: 'client', role: 'client' },
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
type TransitionHook = (tx: Prisma.TransactionClient, booking: { id: string; clientId: string; providerId: string }) => Promise<void>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BookingTransitionOutcome =
  | { ok: true; booking: Booking }
  | { ok: false; httpStatus: 403 | 404 | 409; body: Record<string, unknown> };

/**
 * Cœur de la machine d'états, partagé par l'API HTTP et le temps réel (WebSocket) :
 * mêmes règles d'acteur, de propriété, d'état de départ, de séquestre et de notifications.
 * Lève une exception uniquement en cas d'erreur technique (base indisponible…).
 */
export async function runBookingTransition(
  actor: { id: string; role: string },
  id: string,
  rule: TransitionRule,
  extraData: Record<string, unknown> = {},
  inTransaction?: TransitionHook,
): Promise<BookingTransitionOutcome> {
  const userId = actor.id;
  if (rule.role && actor.role !== rule.role) {
    return { ok: false, httpStatus: 403, body: { error: 'Action non autorisée' } };
  }
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    return { ok: false, httpStatus: 404, body: { error: 'Réservation introuvable' } };
  }

  const owner = ownership(rule.actor, userId);
  const guard = rule.to === 'cancelled' ? [owner, NOT_PAID] : [owner];
  const now = new Date();

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
    const booking = await tx.booking.findUniqueOrThrow({ where: { id } });
    if (inTransaction) await inTransaction(tx, booking);
    return booking;
  });

  if (!updated) {
    const current = await prisma.booking.findFirst({
      where: { id, ...owner },
      select: { status: true, transaction: { select: { status: true } } },
    });
    if (!current) return { ok: false, httpStatus: 404, body: { error: 'Réservation introuvable' } };
    const paid = PAID_STATUSES.includes(current.transaction?.status as 'completed' | 'processing');
    if (rule.to === 'cancelled' && rule.from.includes(current.status as BookingStatus) && paid) {
      return {
        ok: false,
        httpStatus: 409,
        body: {
          error: 'Cette réservation est déjà payée : contactez le support pour une annulation avec remboursement.',
          code: 'BOOKING_ALREADY_PAID',
        },
      };
    }
    return {
      ok: false,
      httpStatus: 409,
      body: {
        error: "Action impossible dans l'état actuel de la réservation.",
        code: 'BOOKING_STATUS_CONFLICT',
        status: current.status,
      },
    };
  }

  void notifyBookingStatusChanged(updated.id, rule.to).catch((error) => {
    logger.error(`Erreur notifications reservation ${rule.to} (${updated.id})`, error);
  });
  void notifyBookingInApp(updated, rule.to, userId);
  return { ok: true, booking: updated };
}

async function applyTransition(
  req: Request,
  res: Response,
  rule: TransitionRule,
  extraData: Record<string, unknown> = {},
  inTransaction?: TransitionHook,
) {
  const { id } = req.params;
  try {
    const outcome = await runBookingTransition(req.user!, id, rule, extraData, inTransaction);
    if (!outcome.ok) return res.status(outcome.httpStatus).json(outcome.body);
    return res.json(outcome.booking);
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
    if (req.user!.role !== 'client') {
      return res.status(403).json({ error: 'Seuls les comptes clients peuvent réserver une prestation.', code: 'CLIENT_ONLY' });
    }
    if (data.providerId === req.user!.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas vous réserver vous-même.' });
    }
    if (data.scheduledAt && new Date(data.scheduledAt).getTime() < Date.now() - 5 * 60_000) {
      return res.status(422).json({ error: 'La date souhaitée doit être dans le futur.', code: 'DATE_IN_PAST' });
    }
    try {
      const provider = await prisma.user.findFirst({
        where: { id: data.providerId, role: 'provider', status: 'active', deletedAt: null },
        select: { id: true, providerProfile: { select: { isAvailable: true } } },
      });
      if (!provider) return res.status(404).json({ error: 'Prestataire introuvable ou inactif' });
      if (provider.providerProfile && provider.providerProfile.isAvailable === false) {
        return res.status(409).json({ error: "Ce prestataire n'accepte pas de nouvelles demandes pour le moment.", code: 'PROVIDER_UNAVAILABLE' });
      }

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

      // Une seule demande en attente par client et par service (évite les doublons).
      const duplicate = await prisma.booking.findFirst({
        where: { clientId: req.user!.id, providerId: data.providerId, serviceId: selectedService.id, status: 'pending' },
        select: { id: true },
      });
      if (duplicate) {
        return res.status(409).json({
          error: 'Vous avez déjà une demande en attente pour ce service.',
          code: 'BOOKING_DUPLICATE',
          bookingId: duplicate.id,
        });
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
      void notifyUser(booking.providerId, {
        type: 'booking.created',
        title: 'Nouvelle demande de réservation',
        body: 'Un client vous a envoyé une demande : acceptez-la ou refusez-la.',
        link: `/bookings/${booking.id}`,
        data: { bookingId: booking.id, status: 'pending' },
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
          review: { select: { id: true, rating: true, isApproved: true, isFlagged: true } },
        },
      });
      if (!booking) return res.status(404).json({ error: 'Réservation introuvable' });
      return res.json({
        ...booking,
        review: booking.review
          ? { id: booking.review.id, rating: booking.review.rating, status: moderationStatus(booking.review) }
          : null,
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

  /**
   * PUT /bookings/:id/dispute — le client signale un problème (mission en cours ou terminée).
   * Transition et signalement sont créés dans la même transaction ; les fonds éventuels
   * restent bloqués jusqu'à la décision de l'équipe.
   */
  async dispute(req: Request, res: Response) {
    const { reason, description } = req.body as DisputeBookingInput;
    let reportId: string | null = null;
    const result = await applyTransition(req, res, BOOKING_TRANSITIONS.dispute, {}, async (tx, booking) => {
      const report = await tx.report.create({
        data: {
          reporterId: booking.clientId,
          reportedId: booking.providerId,
          bookingId: booking.id,
          reason,
          description,
          status: 'pending',
        },
        select: { id: true },
      });
      reportId = report.id;
    });
    if (reportId) {
      void notifyStaff('reports.handle', {
        type: 'report.created',
        title: 'Litige sur une réservation',
        body: 'Un client a signalé un problème sur une mission.',
        link: '/reports',
        data: { reportId, bookingId: req.params.id },
      });
    }
    return result;
  },
};

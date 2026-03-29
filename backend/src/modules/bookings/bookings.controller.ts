import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendEmail } from '../../config/email';
import { logger } from '../../config/logger';
import { getPaginationParams, getSkip, paginate } from '../../utils/pagination.util';
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
  const clientName = formatFullName(booking.client.profile, 'Client');
  const providerName = formatFullName(booking.provider.profile, 'Prestataire');
  const scheduledAt = formatScheduledAt(booking.scheduledAt);
  const amount = formatAmount(booking.amount, booking.currency);
  const serviceTitle = booking.service?.title ?? 'Service';

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
  const clientName = formatFullName(booking.client.profile, 'Client');
  const providerName = formatFullName(booking.provider.profile, 'Prestataire');
  const statusLabel = STATUS_LABELS[status];
  const serviceTitle = booking.service?.title ?? 'Service';
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

export const bookingsController = {
  async list(req: Request, res: Response) {
    const { page, limit } = getPaginationParams(req.query as Record<string, unknown>);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const roleFilter =
      req.user!.role === 'client'
        ? { clientId: req.user!.id }
        : req.user!.role === 'provider'
          ? { providerId: req.user!.id }
          : {};

    const where = {
      ...roleFilter,
      ...(status ? { status: status as 'pending' | 'accepted' | 'rejected' | 'in_progress' | 'completed' | 'validated' | 'cancelled' | 'disputed' } : {}),
    };

    try {
      const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: getSkip({ page, limit }),
          take: limit,
          include: {
            client: {
              include: {
                profile: { select: { firstName: true, lastName: true } },
              },
            },
            provider: {
              include: {
                profile: { select: { firstName: true, lastName: true } },
              },
            },
            service: {
              select: { id: true, title: true, price: true, category: { select: { name: true, slug: true } } },
            },
          },
        }),
        prisma.booking.count({ where }),
      ]);

      const normalized = bookings.map((booking) => ({
        ...booking,
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

      let selectedService: { id: string; price: unknown } | null = null;
      if (data.serviceId) {
        selectedService = await prisma.providerService.findFirst({
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
      }

      const amountFromService = selectedService?.price !== null && selectedService?.price !== undefined
        ? Number(selectedService.price as number | string)
        : undefined;
      const amount = data.amount ?? amountFromService;

      if (amount === undefined || Number(amount) <= 0) {
        return res.status(400).json({ error: 'Montant invalide. Sélectionnez un service avec prix.' });
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
      const booking = await prisma.booking.findFirst({
        where: { id, OR: [{ clientId: req.user!.id }, { providerId: req.user!.id }] },
        include: {
          client:      { include: { profile: true } },
          provider:    { include: { profile: true, providerProfile: true } },
          service:     { include: { category: true } },
          transaction: true,
        },
      });
      if (!booking) return res.status(404).json({ error: 'Réservation introuvable' });
      return res.json(booking);
    } catch (err) {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async accept(req: Request, res: Response) {
    return bookingsController._updateStatus(req, res, 'accepted', 'provider');
  },

  async reject(req: Request, res: Response) {
    return bookingsController._updateStatus(req, res, 'rejected', 'provider');
  },

  async start(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const booking = await prisma.booking.findFirst({
        where: { id, providerId: req.user!.id, status: 'accepted' },
      });
      if (!booking) return res.status(404).json({ error: 'Réservation introuvable ou statut invalide' });

      const updated = await prisma.booking.update({
        where: { id },
        data:  { status: 'in_progress', startedAt: new Date() },
      });
      void notifyBookingStatusChanged(updated.id, 'in_progress').catch((error) => {
        logger.error(`Erreur notifications reservation start (${updated.id})`, error);
      });
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async complete(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const booking = await prisma.booking.findFirst({
        where: { id, providerId: req.user!.id, status: 'in_progress' },
      });
      if (!booking) return res.status(404).json({ error: 'Réservation introuvable ou statut invalide' });

      const updated = await prisma.booking.update({
        where: { id },
        data:  { status: 'completed', completedAt: new Date() },
      });
      void notifyBookingStatusChanged(updated.id, 'completed').catch((error) => {
        logger.error(`Erreur notifications reservation complete (${updated.id})`, error);
      });
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async validate(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const booking = await prisma.booking.findFirst({
        where: { id, clientId: req.user!.id, status: 'completed' },
      });
      if (!booking) return res.status(404).json({ error: 'Réservation introuvable ou statut invalide' });

      const updated = await prisma.booking.update({
        where: { id },
        data:  { status: 'validated', validatedAt: new Date() },
      });
      void notifyBookingStatusChanged(updated.id, 'validated').catch((error) => {
        logger.error(`Erreur notifications reservation validate (${updated.id})`, error);
      });
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async cancel(req: Request, res: Response) {
    const { id } = req.params;
    const { reason } = req.body;
    try {
      const booking = await prisma.booking.findFirst({
        where: {
          id,
          OR: [{ clientId: req.user!.id }, { providerId: req.user!.id }],
          status: { in: ['pending', 'accepted'] },
        },
      });
      if (!booking) return res.status(404).json({ error: 'Annulation impossible' });

      const updated = await prisma.booking.update({
        where: { id },
        data:  { status: 'cancelled', cancellationReason: reason },
      });
      void notifyBookingStatusChanged(updated.id, 'cancelled').catch((error) => {
        logger.error(`Erreur notifications reservation cancel (${updated.id})`, error);
      });
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async _updateStatus(req: Request, res: Response, status: string, requiredRole: string) {
    const { id } = req.params;
    if (req.user!.role !== requiredRole && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Action non autorisée' });
    }
    try {
      const where = requiredRole === 'provider'
        ? { id, providerId: req.user!.id, status: 'pending' as const }
        : { id, clientId: req.user!.id };

      const booking = await prisma.booking.findFirst({ where });
      if (!booking) return res.status(404).json({ error: 'Réservation introuvable' });

      const updated = await prisma.booking.update({
        where: { id },
        data:  { status: status as 'accepted' | 'rejected' },
      });
      const nextStatus = status as 'accepted' | 'rejected';
      void notifyBookingStatusChanged(updated.id, nextStatus).catch((error) => {
        logger.error(`Erreur notifications reservation status (${updated.id})`, error);
      });
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },
};

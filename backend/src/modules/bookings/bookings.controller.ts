import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import type { CreateBookingInput } from './bookings.schemas';

export const bookingsController = {
  async create(req: Request, res: Response) {
    const data = req.body as CreateBookingInput;
    try {
      const provider = await prisma.user.findFirst({
        where: { id: data.providerId, role: 'provider', status: 'active', deletedAt: null },
      });
      if (!provider) return res.status(404).json({ error: 'Prestataire introuvable ou inactif' });

      const booking = await prisma.booking.create({
        data: {
          clientId:      req.user!.id,
          providerId:    data.providerId,
          serviceId:     data.serviceId,
          description:   data.description,
          scheduledAt:   data.scheduledAt ? new Date(data.scheduledAt) : undefined,
          clientLat:     data.clientLat,
          clientLng:     data.clientLng,
          clientAddress: data.clientAddress,
          amount:        data.amount,
          status:        'pending',
        },
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
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },
};

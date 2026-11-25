/**
 * Temps réel (Socket.IO) — authentification et événements.
 *
 * Règles :
 * - aucune exception d'un gestionnaire ne doit atteindre le processus (sinon arrêt de l'API) ;
 * - toute donnée reçue est validée (identifiants, coordonnées) ;
 * - mêmes règles métier que l'API HTTP : propriété de la réservation, état de départ,
 *   séquestre et notifications (machine d'états partagée `runBookingTransition`) ;
 * - rôle et statut du compte relus en base pour les actions (pas seulement le jeton).
 */
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { logger } from '../config/logger';
import { verifyAccessToken, isTokenRevoked } from '../utils/jwt.util';
import { BOOKING_TRANSITIONS, runBookingTransition } from '../modules/bookings/bookings.controller';

const bookingIdSchema = z.string().uuid();
export const joinBookingSchema = z.object({ bookingId: bookingIdSchema });
export const locationUpdateSchema = z.object({
  bookingId: bookingIdSchema,
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  heading: z.number().finite().min(0).max(360).optional(),
  speed: z.number().finite().min(0).max(500).optional(),
});
export const bookingStatusUpdateSchema = z.object({
  bookingId: bookingIdSchema,
  status: z.enum(['in_progress', 'completed', 'validated']),
});

/** Statut demandé en temps réel → transition HTTP équivalente. */
const STATUS_TO_TRANSITION = {
  in_progress: BOOKING_TRANSITIONS.start,
  completed: BOOKING_TRANSITIONS.complete,
  validated: BOOKING_TRANSITIONS.validate,
} as const;

/** Une position n'est diffusée que pour une mission acceptée ou en cours. */
const TRACKABLE_STATUSES = ['accepted', 'in_progress'] as const;

type SocketUser = { userId: string; role: string };

/** Enveloppe : une erreur (base, données) est journalisée et signalée au client, jamais propagée. */
export function safeHandler<T>(event: string, socket: Socket, fn: (payload: T) => Promise<void>) {
  return (payload: T) => {
    fn(payload).catch((err: unknown) => {
      logger.warn('WebSocket : événement en échec', {
        event,
        userId: (socket.data.user as SocketUser | undefined)?.userId,
        error: err instanceof Error ? err.message : String(err),
      });
      socket.emit('error', { message: 'Action impossible pour le moment.' });
    });
  };
}

/** Compte encore actif ? Rôle relu en base (un jeton peut dater d'avant une suspension). */
async function activeAccount(userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, deletedAt: null, status: 'active' },
    select: { id: true, role: true },
  });
}

export async function authenticateSocket(socket: Socket, next: (err?: Error) => void) {
  try {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) return next(new Error('Token manquant'));
    if (await isTokenRevoked(token)) return next(new Error('Token révoqué'));
    const payload = verifyAccessToken(token);
    socket.data.user = { userId: payload.userId, role: payload.role } satisfies SocketUser;
    return next();
  } catch {
    return next(new Error('Token invalide'));
  }
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function registerSocketHandlers(io: Server) {
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const { userId, role } = socket.data.user as SocketUser;
    logger.debug(`WebSocket connecté: ${userId} (${role})`);

    // Salle personnelle (notifications)
    socket.join(`user:${userId}`);

    // Suivi d'une réservation : uniquement le client ou le prestataire de cette réservation.
    socket.on('join_booking', safeHandler('join_booking', socket, async (raw: unknown) => {
      const parsed = joinBookingSchema.safeParse(raw);
      if (!parsed.success) return;
      const booking = await prisma.booking.findFirst({
        where: { id: parsed.data.bookingId, OR: [{ clientId: userId }, { providerId: userId }] },
        select: { id: true },
      });
      if (booking) socket.join(`booking:${booking.id}`);
    }));

    // Position du prestataire : SA réservation, acceptée ou en cours ; 1 enregistrement / 5 s.
    socket.on('location_update', safeHandler('location_update', socket, async (raw: unknown) => {
      const parsed = locationUpdateSchema.safeParse(raw);
      if (!parsed.success) return;
      const data = parsed.data;
      const account = await activeAccount(userId);
      if (account?.role !== 'provider') return;

      const booking = await prisma.booking.findFirst({
        where: { id: data.bookingId, providerId: userId, status: { in: [...TRACKABLE_STATUSES] } },
        select: { id: true, clientLat: true, clientLng: true },
      });
      if (!booking) return;

      const throttleKey = `location_throttle:${userId}`;
      if (!(await redis.get(throttleKey))) {
        await redis.setex(throttleKey, 5, '1');
        await prisma.location.create({
          data: {
            userId,
            bookingId: booking.id,
            latitude: data.lat,
            longitude: data.lng,
            heading: data.heading,
            speed: data.speed,
          },
        });
      }

      let etaMinutes: number | null = null;
      if (booking.clientLat && booking.clientLng) {
        const distKm = haversineKm(data.lat, data.lng, Number(booking.clientLat), Number(booking.clientLng));
        etaMinutes = Math.ceil((distKm / 25) * 60); // ~25 km/h en ville
      }

      io.to(`booking:${booking.id}`).emit('provider_location', {
        lat: data.lat,
        lng: data.lng,
        heading: data.heading,
        etaMinutes,
        timestamp: Date.now(),
      });
    }));

    // Changement de statut : exactement les mêmes règles que l'API HTTP (état de départ,
    // propriété, rôle, séquestre, notifications). Aucun saut d'état possible.
    socket.on('booking_status_update', safeHandler('booking_status_update', socket, async (raw: unknown) => {
      const parsed = bookingStatusUpdateSchema.safeParse(raw);
      if (!parsed.success) {
        socket.emit('error', { message: 'Statut non autorisé.' });
        return;
      }
      const account = await activeAccount(userId);
      if (!account) {
        socket.emit('error', { message: 'Compte inactif.' });
        return;
      }
      const outcome = await runBookingTransition(account, parsed.data.bookingId, STATUS_TO_TRANSITION[parsed.data.status]);
      if (!outcome.ok) {
        socket.emit('error', { message: String(outcome.body.error), code: outcome.body.code });
        return;
      }
      io.to(`booking:${outcome.booking.id}`).emit('booking_status', {
        status: outcome.booking.status,
        updatedAt: new Date(),
      });
    }));

    socket.on('disconnect', () => {
      logger.debug(`WebSocket déconnecté: ${userId}`);
    });
  });
}

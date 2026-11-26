/**
 * Temps réel (Socket.IO) — non-régression de l'audit du 25/11/2026 :
 * 1. un message mal formé ou une erreur de base ne doit JAMAIS arrêter l'API
 *    (avant : `join_booking` avec un identifiant invalide → processus arrêté) ;
 * 2. `booking_status_update` applique la machine d'états HTTP (avant : saut d'état libre,
 *    ex. « validée » → « terminée ») ;
 * 3. `location_update` : uniquement sur SA réservation, acceptée ou en cours.
 */
jest.mock('../../src/config/database', () => ({
  prisma: {
    booking: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    location: { create: jest.fn() },
  },
}));
jest.mock('../../src/config/redis', () => ({ redis: { get: jest.fn(), setex: jest.fn() } }));
jest.mock('../../src/config/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../../src/utils/jwt.util', () => ({ verifyAccessToken: jest.fn(), isTokenRevoked: jest.fn() }));
jest.mock('../../src/modules/bookings/bookings.controller', () => ({
  BOOKING_TRANSITIONS: {
    start: { from: ['accepted'], to: 'in_progress', actor: 'provider', role: 'provider' },
    complete: { from: ['in_progress'], to: 'completed', actor: 'provider', role: 'provider' },
    validate: { from: ['completed'], to: 'validated', actor: 'client', role: 'client' },
  },
  runBookingTransition: jest.fn(),
}));

import type { Server } from 'socket.io';
import { prisma } from '../../src/config/database';
import { redis } from '../../src/config/redis';
import { isTokenRevoked, verifyAccessToken } from '../../src/utils/jwt.util';
import { runBookingTransition } from '../../src/modules/bookings/bookings.controller';
import { authenticateSocket, registerSocketHandlers } from '../../src/realtime/socketHandlers';

const BOOKING = '8a3c6f4e-1b2d-4c5e-9f00-112233445566';
const db = prisma as unknown as { booking: { findFirst: jest.Mock }; user: { findFirst: jest.Mock }; location: { create: jest.Mock } };
const flush = () => new Promise((r) => setImmediate(r));

function harness(user = { userId: 'prov-1', role: 'provider' }) {
  const handlers: Record<string, (p: unknown) => void> = {};
  const roomEmit = jest.fn();
  const socket = {
    data: { user },
    join: jest.fn(),
    emit: jest.fn(),
    on: (event: string, fn: (p: unknown) => void) => { handlers[event] = fn; },
  };
  let onConnection: ((s: unknown) => void) | undefined;
  const io = {
    use: jest.fn(),
    on: (_e: string, fn: (s: unknown) => void) => { onConnection = fn; },
    to: jest.fn(() => ({ emit: roomEmit })),
  };
  registerSocketHandlers(io as unknown as Server);
  onConnection!(socket);
  return { handlers, socket, io, roomEmit };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.user.findFirst.mockResolvedValue({ id: 'prov-1', role: 'provider' });
  (redis.get as jest.Mock).mockResolvedValue(null);
});

describe('aucune erreur ne remonte au processus', () => {
  it('join_booking avec un identifiant invalide : ignoré, aucune requête en base', async () => {
    const { handlers, socket } = harness();
    expect(() => handlers.join_booking({ bookingId: 'pas-un-uuid' })).not.toThrow();
    await flush();
    expect(db.booking.findFirst).not.toHaveBeenCalled();
    expect(socket.join).toHaveBeenCalledTimes(1); // salle personnelle seulement
  });

  it('erreur de base pendant join_booking : capturée, signalée au client, pas de rejet non géré', async () => {
    const { handlers, socket } = harness();
    db.booking.findFirst.mockRejectedValue(new Error('P2023'));
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    handlers.join_booking({ bookingId: BOOKING });
    await flush(); await flush();
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.any(String) }));
  });

  it('charges utiles absentes ou de mauvais type : ignorées', async () => {
    const { handlers } = harness();
    for (const payload of [undefined, null, 42, 'x', { bookingId: BOOKING, lat: 'a', lng: 2 }, { bookingId: BOOKING, lat: 999, lng: 0 }]) {
      expect(() => handlers.location_update(payload)).not.toThrow();
      expect(() => handlers.join_booking(payload)).not.toThrow();
    }
    await flush();
    expect(db.location.create).not.toHaveBeenCalled();
  });
});

describe('location_update', () => {
  it('cherche la réservation DU prestataire, acceptée ou en cours ; sinon rien n’est diffusé', async () => {
    const { handlers, roomEmit } = harness();
    db.booking.findFirst.mockResolvedValue(null); // réservation d'un autre prestataire
    handlers.location_update({ bookingId: BOOKING, lat: 5.3, lng: -4.0 });
    await flush(); await flush();
    expect(db.booking.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: BOOKING, providerId: 'prov-1', status: { in: ['accepted', 'in_progress'] } },
    }));
    expect(db.location.create).not.toHaveBeenCalled();
    expect(roomEmit).not.toHaveBeenCalled();
  });

  it('un client ne peut pas émettre de position', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'cli-1', role: 'client' });
    const { handlers, roomEmit } = harness({ userId: 'cli-1', role: 'provider' }); // rôle du jeton ignoré : relu en base
    handlers.location_update({ bookingId: BOOKING, lat: 5.3, lng: -4.0 });
    await flush(); await flush();
    expect(db.booking.findFirst).not.toHaveBeenCalled();
    expect(roomEmit).not.toHaveBeenCalled();
  });

  it('sa propre mission en cours : position enregistrée et diffusée à la salle de la réservation', async () => {
    const { handlers, io, roomEmit } = harness();
    db.booking.findFirst.mockResolvedValue({ id: BOOKING, clientLat: null, clientLng: null });
    handlers.location_update({ bookingId: BOOKING, lat: 5.3, lng: -4.0 });
    await flush(); await flush(); await flush();
    expect(db.location.create).toHaveBeenCalledTimes(1);
    expect(io.to).toHaveBeenCalledWith(`booking:${BOOKING}`);
    expect(roomEmit).toHaveBeenCalledWith('provider_location', expect.objectContaining({ lat: 5.3, lng: -4.0 }));
  });
});

describe('booking_status_update — machine d’états partagée avec l’API HTTP', () => {
  it('« completed » passe par la transition HTTP « complete » (in_progress → completed uniquement)', async () => {
    (runBookingTransition as jest.Mock).mockResolvedValue({ ok: true, booking: { id: BOOKING, status: 'completed' } });
    const { handlers, roomEmit } = harness();
    handlers.booking_status_update({ bookingId: BOOKING, status: 'completed' });
    await flush(); await flush();
    expect(runBookingTransition).toHaveBeenCalledWith({ id: 'prov-1', role: 'provider' }, BOOKING, expect.objectContaining({ from: ['in_progress'], to: 'completed' }));
    expect(roomEmit).toHaveBeenCalledWith('booking_status', expect.objectContaining({ status: 'completed' }));
  });

  it('transition refusée (ex. réservation déjà validée) : erreur au client, rien n’est diffusé', async () => {
    (runBookingTransition as jest.Mock).mockResolvedValue({ ok: false, httpStatus: 409, body: { error: 'Action impossible', code: 'BOOKING_STATUS_CONFLICT' } });
    const { handlers, socket, roomEmit } = harness();
    handlers.booking_status_update({ bookingId: BOOKING, status: 'completed' });
    await flush(); await flush();
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ code: 'BOOKING_STATUS_CONFLICT' }));
    expect(roomEmit).not.toHaveBeenCalled();
  });

  it('statut hors liste (ex. « cancelled », « accepted ») : refusé sans toucher à la base', async () => {
    const { handlers, socket } = harness();
    handlers.booking_status_update({ bookingId: BOOKING, status: 'accepted' });
    await flush();
    expect(runBookingTransition).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('error', expect.anything());
  });

  it('compte suspendu depuis la connexion : refusé', async () => {
    db.user.findFirst.mockResolvedValue(null);
    const { handlers, socket } = harness();
    handlers.booking_status_update({ bookingId: BOOKING, status: 'completed' });
    await flush(); await flush();
    expect(runBookingTransition).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('error', expect.anything());
  });
});

describe('authentification de la connexion temps réel', () => {
  it('Redis indisponible : connexion refusée proprement (pas d’exception)', async () => {
    (isTokenRevoked as jest.Mock).mockRejectedValue(new Error('redis down'));
    const next = jest.fn();
    await authenticateSocket({ handshake: { auth: { token: 't' } }, data: {} } as never, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('jeton valide : identité attachée', async () => {
    (isTokenRevoked as jest.Mock).mockResolvedValue(false);
    (verifyAccessToken as jest.Mock).mockReturnValue({ userId: 'u1', role: 'client', sessionId: 's' });
    const next = jest.fn();
    const socket = { handshake: { auth: { token: 't' } }, data: {} as Record<string, unknown> };
    await authenticateSocket(socket as never, next);
    expect(next).toHaveBeenCalledWith();
    expect(socket.data.user).toEqual({ userId: 'u1', role: 'client' });
  });
});

/**
 * BLA — Serveur HTTP + WebSocket (Socket.IO)
 * Point d'entrée principal
 */
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import bcrypt from 'bcryptjs';
import { app } from './app';
import { env, getCorsOrigins } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/database';
import { redis } from './config/redis';
import { verifyAccessToken } from './utils/jwt.util';
import { isTokenRevoked } from './utils/jwt.util';

const httpServer = http.createServer(app);

// ─── Socket.IO — Temps réel ────────────────────────────────────
export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: getCorsOrigins(),
    credentials: true,
  },
  transports: ['websocket', 'polling'], // polling = fallback 2G
  pingTimeout:  30_000,
  pingInterval: 25_000,
});

// Auth WebSocket via JWT
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token as string;
  if (!token) return next(new Error('Token manquant'));

  if (await isTokenRevoked(token)) return next(new Error('Token révoqué'));

  try {
    const payload = verifyAccessToken(token);
    socket.data.user = payload;
    next();
  } catch {
    next(new Error('Token invalide'));
  }
});

io.on('connection', (socket) => {
  const { userId, role } = socket.data.user as { userId: string; role: string };
  logger.debug(`WebSocket connecté: ${userId} (${role})`);

  // Rejoindre la salle personnelle (notifications)
  socket.join(`user:${userId}`);

  // ── Booking GPS tracking ──────────────────────────────────
  socket.on('join_booking', async ({ bookingId }: { bookingId: string }) => {
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        OR: [{ clientId: userId }, { providerId: userId }],
      },
    });
    if (booking) socket.join(`booking:${bookingId}`);
  });

  // Le prestataire émet sa position (throttle 5s via Redis)
  socket.on('location_update', async (data: {
    bookingId: string;
    lat: number; lng: number;
    heading?: number; speed?: number;
  }) => {
    if (role !== 'provider') return;
    if (data.lat < -90 || data.lat > 90 || data.lng < -180 || data.lng > 180) return;

    const throttleKey = `location_throttle:${userId}`;
    const throttled = await redis.get(throttleKey);

    if (!throttled) {
      await redis.setex(throttleKey, 5, '1');
      await prisma.location.create({
        data: {
          userId,
          bookingId: data.bookingId,
          latitude:  data.lat,
          longitude: data.lng,
          heading:   data.heading,
          speed:     data.speed,
        },
      });
    }

    // Calculer l'ETA approximatif
    const booking = await prisma.booking.findUnique({ where: { id: data.bookingId } });
    let etaMinutes: number | null = null;

    if (booking?.clientLat && booking?.clientLng) {
      const distKm = haversineKm(
        data.lat, data.lng,
        Number(booking.clientLat), Number(booking.clientLng)
      );
      etaMinutes = Math.ceil(distKm / 25 * 60); // ~25 km/h en ville
    }

    io.to(`booking:${data.bookingId}`).emit('provider_location', {
      lat: data.lat,
      lng: data.lng,
      heading: data.heading,
      etaMinutes,
      timestamp: Date.now(),
    });
  });

  // Changement de statut de booking
  socket.on('booking_status_update', async ({ bookingId, status }: { bookingId: string; status: string }) => {
    const allowed = role === 'provider'
      ? ['in_progress', 'completed']
      : ['validated'];

    if (!allowed.includes(status)) return;

    try {
      const booking = await prisma.booking.update({
        where: {
          id: bookingId,
          ...(role === 'provider' ? { providerId: userId } : { clientId: userId }),
        },
        data: {
          status: status as 'in_progress' | 'completed' | 'validated',
          ...(status === 'in_progress' && { startedAt: new Date() }),
          ...(status === 'completed'   && { completedAt: new Date() }),
          ...(status === 'validated'   && { validatedAt: new Date() }),
        },
      });

      io.to(`booking:${bookingId}`).emit('booking_status', {
        status: booking.status,
        updatedAt: new Date(),
      });
    } catch {
      socket.emit('error', { message: 'Mise à jour du statut échouée' });
    }
  });

  socket.on('disconnect', () => {
    logger.debug(`WebSocket déconnecté: ${userId}`);
  });
});

// ─── Démarrage serveur ─────────────────────────────────────────
async function bootstrap() {
  try {
    await prisma.$connect();
    logger.info('PostgreSQL connecté');

    await ensureSystemData();

    await redis.connect();

    httpServer.listen(env.PORT, () => {
      logger.info(`🚀 BLA Backend démarré`);
      logger.info(`   → HTTP    : http://localhost:${env.PORT}`);
      logger.info(`   → Health  : http://localhost:${env.PORT}/health`);
      logger.info(`   → WS      : ws://localhost:${env.PORT}`);
      logger.info(`   → Env     : ${env.NODE_ENV}`);
    });
  } catch (err) {
    logger.error('Erreur de démarrage:', err);
    process.exit(1);
  }
}

async function ensureSystemData() {
  const adminEmail = env.ADMIN_EMAIL.toLowerCase();
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true, role: true, status: true, mfaEnabled: true, passwordHash: true },
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        role: 'super_admin',
        status: 'active',
        mfaEnabled: false,
        profile: {
          create: {
            firstName: 'Super',
            lastName: 'Admin',
            country: 'SN',
            idVerified: true,
            idVerifiedAt: new Date(),
          },
        },
      },
    });
    logger.info(`Compte admin bootstrap cree: ${adminEmail}`);
  } else {
    const updates: {
      role?: 'super_admin';
      status?: 'active';
      mfaEnabled?: false;
      passwordHash?: string;
    } = {};

    if (existingAdmin.role !== 'super_admin') updates.role = 'super_admin';
    if (existingAdmin.status !== 'active') updates.status = 'active';
    if (existingAdmin.mfaEnabled !== false) updates.mfaEnabled = false;

    const passwordMatches = await bcrypt.compare(env.ADMIN_PASSWORD, existingAdmin.passwordHash)
      .catch(() => false);
    if (!passwordMatches) {
      updates.passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
    }

    if (Object.keys(updates).length > 0) {
      await prisma.user.update({
        where: { id: existingAdmin.id },
        data: updates,
      });
      logger.info(`Compte admin bootstrap synchronise: ${adminEmail}`);
    }
  }

  const categoriesCount = await prisma.category.count();
  if (categoriesCount === 0) {
    await prisma.category.createMany({
      data: [
        { name: 'Batiment & Travaux', slug: 'batiment', isActive: true, sortOrder: 1, iconUrl: 'building' },
        { name: 'Transport & Deplacement', slug: 'transport', isActive: true, sortOrder: 2, iconUrl: 'transport' },
        { name: 'Beaute & Bien-etre', slug: 'beaute', isActive: true, sortOrder: 3, iconUrl: 'beauty' },
        { name: 'Informatique & Digital', slug: 'numerique', isActive: true, sortOrder: 4, iconUrl: 'digital' },
      ],
      skipDuplicates: true,
    });
    logger.info('Categories minimales bootstrap creees');
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM reçu — arrêt gracieux...');
  httpServer.close(async () => {
    await prisma.$disconnect();
    await redis.quit();
    process.exit(0);
  });
});

bootstrap();

// ─── Utilitaire distance Haversine ────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function toRad(deg: number) { return deg * Math.PI / 180; }

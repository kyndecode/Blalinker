/**
 * BLA — Serveur HTTP + WebSocket (Socket.IO)
 * Point d'entrée principal
 */
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { app } from './app';
import { env, getCorsOrigins } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/database';
import { redis } from './config/redis';
import { ensureBootstrapAdmin } from './config/bootstrapAdmin';
import { isEmailConfigured } from './config/email';
import { isSmsConfigured } from './utils/sms.util';
import { registerSocketHandlers } from './realtime/socketHandlers';

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

// Authentification et événements temps réel (validation, propriété, machine d'états partagée).
registerSocketHandlers(io);

// Filet de sécurité : une promesse rejetée oubliée (gestionnaire asynchrone, tâche de fond)
// est journalisée au lieu d'arrêter toute l'API (comportement par défaut de Node ≥ 15).
process.on('unhandledRejection', (reason) => {
  logger.error('Promesse rejetée non gérée', {
    error: reason instanceof Error ? { message: reason.message, stack: reason.stack } : String(reason),
  });
});

// ─── Démarrage serveur ─────────────────────────────────────────
async function bootstrap() {
  try {
    await prisma.$connect();
    logger.info('PostgreSQL connecté');

    await ensureSystemData();

    // Canaux de notification (une seule ligne au démarrage, aucun secret).
    logger.info(
      `Notifications : e-mail ${isEmailConfigured() ? `Brevo (expéditeur ${env.BREVO_FROM_EMAIL})` : 'DÉSACTIVÉ (BREVO_API_KEY absente)'}`
      + ` | SMS ${isSmsConfigured() ? 'Twilio' : 'non configuré (OTP par e-mail uniquement)'}`
      + ` | MFA connexion ${env.MFA_ENABLED ? 'actif' : 'désactivé'}`,
    );

    // Redis est en lazyConnect : il a pu déjà être ouvert par le rate-limiter.
    // On ne (re)connecte que si le client est encore en attente.
    if (redis.status === 'wait') {
      await redis.connect();
    }

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
  // Premier super-administrateur : jamais créé si un super-administrateur actif
  // existe déjà (voir config/bootstrapAdmin.ts).
  await ensureBootstrapAdmin();

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


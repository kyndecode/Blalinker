/**
 * Accès au serveur temps réel depuis les services, sans importer server.ts (qui démarre l'API).
 *
 * Révocation : une connexion Socket.IO est authentifiée une seule fois, à son ouverture. Sans ce
 * module, une connexion ouverte avant une déconnexion, une suspension ou un vol de jeton restait
 * active. Chaque connexion rejoint une salle par utilisateur et une salle par session : fermer
 * la session ou suspendre le compte coupe immédiatement les connexions concernées.
 */
import type { Server } from 'socket.io';
import { logger } from '../config/logger';

let server: Server | null = null;

export function setSocketServer(io: Server | null): void {
  server = io;
}

export const userRoom = (userId: string) => `user:${userId}`;
export const sessionRoom = (sessionId: string) => `session:${sessionId}`;

function disconnectRoom(room: string): void {
  if (!server) return;
  try {
    server.in(room).disconnectSockets(true);
  } catch (error) {
    // Jamais bloquant pour l'action d'origine (déconnexion, suspension…).
    logger.warn('Fermeture des connexions temps réel impossible', { room, error: error instanceof Error ? error.message : String(error) });
  }
}

/** Coupe les connexions ouvertes avec une session précise (déconnexion d'un appareil). */
export function disconnectSession(sessionId: string): void {
  disconnectRoom(sessionRoom(sessionId));
}

/** Coupe toutes les connexions d'un utilisateur (suspension, bannissement, déconnexion forcée). */
export function disconnectUser(userId: string): void {
  disconnectRoom(userRoom(userId));
}

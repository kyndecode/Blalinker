/**
 * Révocation des connexions temps réel (29/11/2026). Une connexion Socket.IO n'est authentifiée
 * qu'à son ouverture : avant, elle restait active après une déconnexion, une suspension ou une
 * déconnexion forcée. Vrai serveur Socket.IO et vrai client, en mémoire.
 */
jest.mock('../../src/utils/jwt.util', () => ({
  ...jest.requireActual('../../src/utils/jwt.util'),
  // Jeton de test « utilisateur:session » (la signature RSA est couverte par jwt.util.test.ts).
  verifyAccessToken: (token: string) => {
    const [userId, sessionId] = token.split(':');
    if (!userId || !sessionId) throw new Error('Token invalide');
    return { userId, sessionId, role: 'client' };
  },
  isTokenRevoked: jest.fn().mockResolvedValue(false),
}));
jest.mock('../../src/config/redis', () => ({ redis: { get: jest.fn(), setex: jest.fn(), on: jest.fn() } }));

import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import { registerSocketHandlers } from '../../src/realtime/socketHandlers';
import { disconnectSession, disconnectUser, setSocketServer } from '../../src/realtime/socketRegistry';

let http: HttpServer;
let ioServer: Server;
let url = '';
const clients: Socket[] = [];

function open(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 4000 });
    clients.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}
const closedByServer = (socket: Socket) => new Promise<string>((resolve) => socket.once('disconnect', resolve));

beforeAll(async () => {
  http = createServer();
  ioServer = new Server(http, { cors: { origin: '*' } });
  registerSocketHandlers(ioServer);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

afterEach(() => { while (clients.length) clients.pop()!.close(); });

afterAll(async () => {
  setSocketServer(null);
  await new Promise<void>((resolve) => ioServer.close(() => resolve()));
});

describe('révocation des connexions temps réel', () => {
  it('déconnexion d’un appareil : sa connexion est coupée, celle de l’autre appareil reste ouverte', async () => {
    const phone = await open('u1:session-telephone');
    const laptop = await open('u1:session-ordinateur');
    const reason = closedByServer(phone);
    disconnectSession('session-telephone');
    await expect(reason).resolves.toBe('io server disconnect');
    await new Promise((r) => setTimeout(r, 100));
    expect(laptop.connected).toBe(true);
  });

  it('compte suspendu ou déconnexion forcée : toutes les connexions de l’utilisateur sont coupées, pas celles des autres', async () => {
    const a = await open('u2:s1');
    const b = await open('u2:s2');
    const other = await open('u3:s3');
    const closed = Promise.all([closedByServer(a), closedByServer(b)]);
    disconnectUser('u2');
    await expect(closed).resolves.toEqual(['io server disconnect', 'io server disconnect']);
    await new Promise((r) => setTimeout(r, 100));
    expect(other.connected).toBe(true);
  });

  it('jeton absent ou invalide : connexion refusée dès l’ouverture', async () => {
    await expect(open('')).rejects.toThrow('Token manquant');
    await expect(open('pas-un-jeton')).rejects.toThrow('Token invalide');
  });
});

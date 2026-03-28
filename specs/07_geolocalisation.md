# Géolocalisation & Suivi GPS temps réel — BLA

## 1. Recherche par géolocalisation

### 1.1 Flux de géolocalisation client
```
1. Client ouvre la page de recherche
2. App demande permission GPS (une seule fois, avec explication)
3. Si accordée → position précise via GPS
4. Si refusée ou non disponible → fallback sur saisie manuelle de ville
5. Position envoyée au backend pour recherche de proximité
6. Résultats affichés sur carte + liste triée par distance
```

### 1.2 Fallback sans GPS
- Saisie d'une ville/quartier avec autocomplétion
- Liste de villes principales pré-chargée (cache local)
- Résolution via API de géocodage (OpenStreetMap Nominatim, gratuit)

---

## 2. Suivi en temps réel (architecture Socket.IO)

### 2.1 Architecture WebSocket
```
Client (Passager)              Socket.IO Server              Prestataire
      │                              │                              │
      │ join room: booking_xyz       │                              │
      │─────────────────────────────>│                              │
      │                              │                              │
      │                              │<─────────────────────────────│
      │                              │  emit: location_update       │
      │                              │  {lat, lng, heading, speed}  │
      │                              │                              │
      │<─────────────────────────────│                              │
      │  emit: provider_location     │                              │
      │  {lat, lng, eta_minutes}     │                              │
      │                              │                              │
      │                              │<─────────────────────────────│
      │                              │  emit: status_update         │
      │                              │  {status: 'arrived'}         │
      │<─────────────────────────────│                              │
      │  emit: booking_status        │                              │
      │  {status: 'arrived',         │                              │
      │   message: "Arrivé !"}       │                              │
```

### 2.2 Implémentation serveur Socket.IO
```typescript
// src/server.ts
import { Server } from 'socket.io';
import { authMiddleware } from './middlewares/auth.middleware';

const io = new Server(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN },
  transports: ['websocket', 'polling'] // polling fallback pour 2G
});

// Auth middleware sur les WebSockets
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  const user = await verifyJWT(token);
  if (!user) return next(new Error('Non autorisé'));
  socket.data.user = user;
  next();
});

io.on('connection', (socket) => {
  const user = socket.data.user;

  // Prestataire rejoint sa salle de booking
  socket.on('join_booking', async ({ bookingId }) => {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId }
    });
    if (!booking) return;
    if (booking.clientId !== user.id && booking.providerId !== user.id) return;

    socket.join(`booking:${bookingId}`);
  });

  // Mise à jour position (prestataire uniquement)
  socket.on('location_update', async ({ bookingId, lat, lng, heading, speed }) => {
    if (user.role !== 'provider') return;

    // Validation des coordonnées
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

    // Sauvegarder en base (rate-limitée à 1/5s)
    const lastUpdate = await redis.get(`location_throttle:${user.id}`);
    if (!lastUpdate) {
      await prisma.location.create({
        data: { userId: user.id, bookingId, latitude: lat, longitude: lng, heading, speed }
      });
      await redis.setex(`location_throttle:${user.id}`, 5, '1');
    }

    // Calculer ETA (distance / vitesse estimée)
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    const eta = calculateETA(lat, lng, booking.clientLat, booking.clientLng);

    // Broadcast au client
    io.to(`booking:${bookingId}`).emit('provider_location', {
      lat, lng, heading, speed,
      etaMinutes: eta,
      timestamp: Date.now()
    });
  });

  // Mise à jour statut
  socket.on('status_update', async ({ bookingId, status }) => {
    const VALID_TRANSITIONS = {
      provider: ['in_progress', 'completed'],
      client: ['validated', 'disputed']
    };

    if (!VALID_TRANSITIONS[user.role]?.includes(status)) return;

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status,
        ...(status === 'in_progress' && { startedAt: new Date() }),
        ...(status === 'completed' && { completedAt: new Date() })
      }
    });

    io.to(`booking:${bookingId}`).emit('booking_status', { status, updatedAt: new Date() });
  });

  socket.on('disconnect', () => {
    console.log(`User ${user.id} disconnected`);
  });
});
```

### 2.3 Client mobile — suivi position prestataire
```typescript
// hooks/useProviderTracking.ts
export function useProviderTracking(bookingId: string) {
  const [providerLocation, setProviderLocation] = useState<LatLng | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const socket = useSocket();

  useEffect(() => {
    socket.emit('join_booking', { bookingId });

    socket.on('provider_location', ({ lat, lng, etaMinutes }) => {
      setProviderLocation({ latitude: lat, longitude: lng });
      setEta(etaMinutes);
    });

    return () => {
      socket.off('provider_location');
    };
  }, [bookingId]);

  return { providerLocation, eta };
}
```

### 2.4 Prestataire — émission de position
```typescript
// hooks/useLocationBroadcast.ts
export function useLocationBroadcast(bookingId: string) {
  const socket = useSocket();

  useEffect(() => {
    const subscription = Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,      // toutes les 5 secondes
        distanceInterval: 10,    // ou tous les 10 mètres
      },
      (location) => {
        socket.emit('location_update', {
          bookingId,
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          heading: location.coords.heading,
          speed: location.coords.speed
        });
      }
    );

    return () => subscription.then(s => s.remove());
  }, [bookingId]);
}
```

---

## 3. Calcul d'ETA (Estimated Time of Arrival)

```typescript
// utils/eta.util.ts
const AVERAGE_SPEED_KMH = 25; // vitesse moyenne Dakar (trafic)

export function calculateETA(
  providerLat: number, providerLng: number,
  clientLat: number, clientLng: number
): number {
  const distanceKm = haversineDistance(
    { lat: providerLat, lng: providerLng },
    { lat: clientLat, lng: clientLng }
  );

  const durationHours = distanceKm / AVERAGE_SPEED_KMH;
  return Math.ceil(durationHours * 60); // en minutes
}

function haversineDistance(a: {lat:number;lng:number}, b: {lat:number;lng:number}): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}
```

---

## 4. Confidentialité de la position

- La position du prestataire n'est partagée avec le client **qu'après acceptation** de la réservation
- La position du client n'est visible par le prestataire **qu'au moment de la mission**
- Les données GPS sont supprimées automatiquement après 30 jours
- Le prestataire peut désactiver le partage de position en dehors des missions actives
- Conformité RGPD : consentement explicite avant activation du GPS

# API Backend Node.js — BLA

## 1. Structure du projet backend

```
backend/
├── src/
│   ├── app.ts                    # Entry point Express
│   ├── server.ts                 # Démarrage serveur + Socket.IO
│   ├── config/
│   │   ├── database.ts           # Prisma client
│   │   ├── redis.ts              # Redis client
│   │   ├── env.ts                # Validation variables d'environnement
│   │   └── logger.ts             # Winston logger
│   ├── middlewares/
│   │   ├── auth.middleware.ts    # Vérification JWT
│   │   ├── admin.middleware.ts   # Vérification rôle admin
│   │   ├── rateLimit.middleware.ts
│   │   ├── validate.middleware.ts # Validation Zod
│   │   ├── upload.middleware.ts  # Multer + Cloudinary
│   │   └── security.middleware.ts # Helmet, CORS, XSS filter
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── providers/
│   │   ├── services/
│   │   ├── bookings/
│   │   ├── payments/
│   │   ├── reviews/
│   │   ├── geolocation/
│   │   ├── notifications/
│   │   ├── reports/
│   │   └── admin/
│   └── utils/
│       ├── jwt.util.ts
│       ├── otp.util.ts
│       ├── hash.util.ts
│       ├── sms.util.ts
│       └── pagination.util.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── tests/
├── .env.example
└── package.json
```

---

## 2. Endpoints REST — Liste complète

### Auth (`/api/v1/auth`)

| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| POST | `/register` | Inscription + envoi OTP | - |
| POST | `/verify-otp` | Vérification OTP inscription | - |
| POST | `/login` | Connexion (email/phone + mdp) | - |
| POST | `/login/verify-mfa` | Validation OTP MFA | - |
| POST | `/refresh-token` | Renouvellement access token | Refresh Token |
| POST | `/logout` | Révocation token | JWT |
| POST | `/forgot-password` | Envoi OTP reset mdp | - |
| POST | `/reset-password` | Nouveau mot de passe | OTP |
| POST | `/resend-otp` | Renvoi OTP | - |

### Users (`/api/v1/users`)

| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| GET | `/me` | Profil de l'utilisateur connecté | JWT |
| PUT | `/me` | Mise à jour profil | JWT |
| POST | `/me/avatar` | Upload photo de profil | JWT |
| POST | `/me/id-card` | Upload pièce d'identité | JWT |
| PUT | `/me/location` | Mise à jour localisation | JWT |
| GET | `/me/bookings` | Historique réservations | JWT |
| GET | `/me/notifications` | Notifications | JWT |
| PUT | `/me/notifications/:id/read` | Marquer comme lu | JWT |
| DELETE | `/me` | Suppression compte (soft) | JWT |

### Providers (`/api/v1/providers`)

| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| GET | `/search` | Recherche avec filtres + géoloc | - |
| GET | `/:id` | Profil public prestataire | - |
| GET | `/:id/reviews` | Avis du prestataire | - |
| GET | `/:id/availability` | Disponibilités | - |
| POST | `/me/profile` | Créer profil prestataire | JWT |
| PUT | `/me/profile` | Mettre à jour profil pro | JWT |
| PUT | `/me/availability` | Gérer disponibilités | JWT |
| GET | `/me/stats` | Statistiques personnelles | JWT |
| POST | `/me/services` | Ajouter un service | JWT |
| PUT | `/me/services/:id` | Modifier un service | JWT |
| DELETE | `/me/services/:id` | Supprimer un service | JWT |

### Bookings (`/api/v1/bookings`)

| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| POST | `/` | Créer une réservation | JWT (client) |
| GET | `/:id` | Détail d'une réservation | JWT |
| PUT | `/:id/accept` | Accepter (prestataire) | JWT (provider) |
| PUT | `/:id/reject` | Refuser (prestataire) | JWT (provider) |
| PUT | `/:id/start` | Démarrer la mission | JWT (provider) |
| PUT | `/:id/complete` | Marquer comme terminé | JWT (provider) |
| PUT | `/:id/validate` | Valider par le client | JWT (client) |
| PUT | `/:id/cancel` | Annuler | JWT |
| POST | `/:id/dispute` | Ouvrir un litige | JWT |

### Payments (`/api/v1/payments`)

| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| POST | `/initiate` | Initier un paiement | JWT |
| POST | `/webhook/wave` | Webhook Wave | Signature |
| POST | `/webhook/orange` | Webhook Orange Money | Signature |
| GET | `/:booking_id/status` | Statut d'un paiement | JWT |
| POST | `/:booking_id/refund` | Demande de remboursement | JWT |

### Reviews (`/api/v1/reviews`)

| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| POST | `/` | Créer un avis | JWT (client) |
| GET | `/:provider_id` | Avis d'un prestataire | - |

### Reports (`/api/v1/reports`)

| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| POST | `/` | Signaler un utilisateur | JWT |
| GET | `/me` | Mes signalements | JWT |

### Admin (`/api/v1/admin`)

| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| GET | `/dashboard` | Statistiques globales | JWT (admin) |
| GET | `/users` | Liste utilisateurs | JWT (admin) |
| GET | `/users/:id` | Détail utilisateur | JWT (admin) |
| PUT | `/users/:id/status` | Modifier statut | JWT (admin) |
| POST | `/users/:id/verify-id` | Valider pièce d'identité | JWT (admin) |
| GET | `/providers/pending` | Prestataires en attente | JWT (admin) |
| GET | `/reviews/pending` | Avis en attente de modération | JWT (admin) |
| PUT | `/reviews/:id/approve` | Approuver avis | JWT (admin) |
| DELETE | `/reviews/:id` | Supprimer avis | JWT (admin) |
| GET | `/reports` | Liste des signalements | JWT (admin) |
| PUT | `/reports/:id/resolve` | Résoudre signalement | JWT (admin) |
| GET | `/transactions` | Toutes les transactions | JWT (admin) |
| GET | `/categories` | Gestion catégories | JWT (admin) |
| POST | `/categories` | Créer catégorie | JWT (admin) |
| PUT | `/categories/:id` | Modifier catégorie | JWT (admin) |

---

## 3. Exemples d'implémentation

### 3.1 Middleware d'authentification JWT
```typescript
// src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { redis } from '../config/redis';

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token manquant' });

  // Vérifier si le token est révoqué (logout)
  const isRevoked = await redis.get(`revoked:${token}`);
  if (isRevoked) return res.status(401).json({ error: 'Token révoqué' });

  try {
    const payload = jwt.verify(token, process.env.JWT_PUBLIC_KEY!, {
      algorithms: ['RS256']
    }) as { userId: string; role: string };

    const user = await prisma.user.findUnique({
      where: { id: payload.userId, deletedAt: null }
    });

    if (!user || user.status === 'banned') {
      return res.status(401).json({ error: 'Accès refusé' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide' });
  }
}
```

### 3.2 Endpoint de recherche de prestataires
```typescript
// src/modules/providers/providers.controller.ts
export async function searchProviders(req: Request, res: Response) {
  const {
    lat, lng,            // position client
    radius = 10,         // km
    category_id,
    min_rating = 0,
    max_price,
    available_only = true,
    page = 1,
    limit = 20
  } = req.query;

  // Validation
  const schema = z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    radius: z.coerce.number().min(1).max(100),
    category_id: z.string().uuid().optional(),
    min_rating: z.coerce.number().min(0).max(5).optional(),
    max_price: z.coerce.number().positive().optional(),
    available_only: z.coerce.boolean().optional(),
    page: z.coerce.number().min(1).optional(),
    limit: z.coerce.number().min(1).max(50).optional()
  });

  const params = schema.parse(req.query);
  const offset = (params.page - 1) * params.limit;

  const providers = await prisma.$queryRaw`
    SELECT
      u.id,
      p.first_name,
      p.last_name,
      p.avatar_url,
      p.city,
      pp.rating_average,
      pp.rating_count,
      pp.hourly_rate,
      pp.is_available,
      pp.completed_jobs,
      ROUND(ST_Distance(
        ST_MakePoint(p.longitude::float, p.latitude::float)::geography,
        ST_MakePoint(${params.lng}::float, ${params.lat}::float)::geography
      ) / 1000, 1) AS distance_km,
      json_agg(DISTINCT c.name) AS categories
    FROM users u
    JOIN profiles p ON p.user_id = u.id
    JOIN provider_profiles pp ON pp.user_id = u.id
    JOIN provider_services ps ON ps.provider_id = u.id
    JOIN categories c ON c.id = ps.category_id
    WHERE u.role = 'provider'
      AND u.status = 'active'
      AND p.id_verified = true
      AND pp.rating_average >= ${params.min_rating}
      AND (${params.available_only} = false OR pp.is_available = true)
      AND (${params.category_id}::uuid IS NULL OR ps.category_id = ${params.category_id}::uuid)
      AND ST_DWithin(
        ST_MakePoint(p.longitude::float, p.latitude::float)::geography,
        ST_MakePoint(${params.lng}::float, ${params.lat}::float)::geography,
        ${params.radius * 1000}
      )
    GROUP BY u.id, p.first_name, p.last_name, p.avatar_url, p.city,
             pp.rating_average, pp.rating_count, pp.hourly_rate,
             pp.is_available, pp.completed_jobs, p.longitude, p.latitude
    ORDER BY pp.rating_average DESC, distance_km ASC
    LIMIT ${params.limit} OFFSET ${offset}
  `;

  res.json({ data: providers, page: params.page, limit: params.limit });
}
```

### 3.3 Initiation d'un paiement Wave
```typescript
// src/modules/payments/wave.service.ts
export async function initiateWavePayment(booking: Booking): Promise<string> {
  const response = await axios.post('https://api.wave.com/v1/checkout/sessions', {
    currency: 'XOF',
    amount: booking.amount,
    error_url: `${process.env.APP_URL}/payment/error`,
    success_url: `${process.env.APP_URL}/payment/success?booking=${booking.id}`,
    client_reference: booking.id,
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.WAVE_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  // Enregistrer la référence externe
  await prisma.transaction.create({
    data: {
      bookingId: booking.id,
      payerId: booking.clientId,
      payeeId: booking.providerId,
      amount: booking.amount,
      commission: booking.commissionAmt,
      netAmount: booking.amount - booking.commissionAmt,
      currency: 'XOF',
      method: 'wave',
      status: 'pending',
      externalRef: response.data.id
    }
  });

  return response.data.wave_launch_url;
}
```

---

## 4. Variables d'environnement

```env
# Application
NODE_ENV=production
PORT=3000
APP_URL=https://bla-app.com

# Base de données
DATABASE_URL=postgresql://user:password@localhost:5432/bla_db
REDIS_URL=redis://localhost:6379

# JWT (paire de clés RSA)
JWT_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----...
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----...
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=30d

# SMS OTP
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_PHONE_NUMBER=+15555555555

# Stockage fichiers
CLOUDINARY_CLOUD_NAME=bla
CLOUDINARY_API_KEY=xxxxxxxx
CLOUDINARY_API_SECRET=xxxxxxxx

# Paiements
WAVE_API_KEY=xxxxxxxx
WAVE_WEBHOOK_SECRET=xxxxxxxx
ORANGE_MONEY_API_KEY=xxxxxxxx
ORANGE_MONEY_WEBHOOK_SECRET=xxxxxxxx

# IA
AI_SERVICE_URL=http://ai-service:8000

# Monitoring
SENTRY_DSN=https://xxxxxxxx@sentry.io/xxxxxxxx
```

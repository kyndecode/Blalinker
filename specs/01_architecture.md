# Architecture globale — BLA

## 1. Vue d'ensemble de l'architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ React Native │  │  React Web   │  │   Admin Dashboard    │  │
│  │   (Mobile)   │  │  (Browser)   │  │     (React Web)      │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼─────────────────┼─────────────────────┼──────────────┘
          │                 │                       │
          └─────────────────┴───────────────────────┘
                            │  HTTPS / WSS
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY (Nginx)                        │
│              Rate limiting · SSL termination · CORS             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          ┌────────────────┴────────────────┐
          ▼                                 ▼
┌─────────────────┐               ┌─────────────────┐
│  REST API       │               │  WebSocket      │
│  Node.js/Express│               │  Socket.IO      │
│  (Auth, Users,  │               │  (GPS temps     │
│   Services,     │               │   réel, chat,   │
│   Payments...)  │               │   notifications)│
└────────┬────────┘               └────────┬────────┘
         │                                 │
         └─────────────┬───────────────────┘
                       │
          ┌────────────┴─────────────┐
          ▼                          ▼
┌──────────────────┐       ┌──────────────────┐
│   PostgreSQL 15  │       │   Redis (Cache)  │
│   (Données       │       │   Sessions OTP   │
│    principales)  │       │   Rate limiting  │
└──────────────────┘       └──────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────┐
│              Services externes                        │
│  ┌──────────┐ ┌────────────┐ ┌───────────────────┐  │
│  │  Twilio  │ │ Wave API   │ │ Orange Money API  │  │
│  │  (SMS    │ │ (Paiement) │ │   (Paiement)      │  │
│  │   OTP)   │ └────────────┘ └───────────────────┘  │
│  └──────────┘ ┌────────────┐ ┌───────────────────┐  │
│               │ Cloudinary │ │  IA Microservice  │  │
│               │ (Photos)   │ │  (FastAPI/Python) │  │
│               └────────────┘ └───────────────────┘  │
└──────────────────────────────────────────────────────┘
```

---

## 2. Principes d'architecture

### 2.1 API-First
Toute la logique métier est exposée via des endpoints REST versionnés (`/api/v1/...`). Le frontend web et mobile consomment la même API.

### 2.2 Stateless
Le backend est sans état. Les sessions sont gérées via JWT (access token + refresh token). Redis gère les tokens révoqués et les codes OTP temporaires.

### 2.3 Résilience réseau (marchés africains)
- **Cache local** (AsyncStorage sur mobile, localStorage + IndexedDB sur web) pour afficher les données hors connexion
- **Queue de requêtes** : les actions effectuées hors-ligne sont mises en file et rejouées à la reconnexion
- **Retry avec backoff exponentiel** sur toutes les requêtes critiques
- **Compression GZIP** activée sur Nginx pour réduire la consommation data

### 2.4 Sécurité en profondeur
- TLS 1.3 obligatoire
- JWT signés avec RS256 (clés asymétriques)
- Helmet.js pour les headers HTTP
- Rate limiting par IP et par utilisateur
- Validation stricte des entrées (Joi / Zod)
- Sanitisation contre XSS et injection SQL (Prisma ORM paramétrisé)

### 2.5 Séparation des responsabilités
```
backend/
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── services/
│   │   ├── bookings/
│   │   ├── payments/
│   │   ├── reviews/
│   │   ├── geolocation/
│   │   ├── notifications/
│   │   └── admin/
│   ├── middlewares/
│   ├── config/
│   ├── utils/
│   └── app.ts
```

---

## 3. Environnements

| Env | URL | Base de données | Notes |
|-----|-----|-----------------|-------|
| Development | localhost:3000 | PostgreSQL local | Seeders activés |
| Staging | staging.bla-app.com | PostgreSQL Cloud | Données anonymisées |
| Production | bla-app.com | PostgreSQL Cloud (HA) | Backups quotidiens |

---

## 4. Scalabilité

- Backend : instances Node.js derrière un load balancer Nginx (horizontal scaling)
- Base de données : read replicas PostgreSQL pour les requêtes de lecture intensives
- Redis cluster pour la haute disponibilité du cache
- CDN (Cloudflare) pour les assets statiques et les images de profil
- Microservice IA isolé (FastAPI Python) scalable indépendamment

---

## 5. Contraintes spécifiques marchés africains

| Contrainte | Solution |
|------------|----------|
| Connexion instable / 2G/3G | Mode offline, compression des réponses, pagination |
| Faible puissance des appareils | Bundle React Native optimisé, lazy loading |
| Paiements cash/Mobile Money | Intégration Wave, Orange Money, Free Money |
| Langues (français, wolof, etc.) | i18n avec react-i18next, fichiers de traduction |
| Faible taux de bancarisation | Pas de carte bancaire obligatoire |
| Confiance dans la plateforme | Vérification d'identité manuelle, avis certifiés |

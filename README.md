# BLA — Application de mise en relation de services

**Version** : 1.0.0
**Date** : 2026-03-28
**Marchés cibles** : Afrique francophone (Sénégal, Côte d'Ivoire, Mali, Cameroun, etc.)

---

## Vue d'ensemble

BLA est une plateforme mobile et web qui met en relation des prestataires de services (plombiers, électriciens, menuisiers, etc.) avec des clients particuliers ou professionnels. Elle est conçue pour fonctionner dans des environnements à connectivité limitée, avec une intégration native des solutions de paiement local (Mobile Money, Orange Money, Wave).

---

## Structure des fichiers de spécifications

```
bla/
├── README.md                          ← Ce fichier
├── specs/
│   ├── 01_architecture.md             ← Architecture globale
│   ├── 02_base_de_donnees.md          ← Schéma PostgreSQL
│   ├── 03_backend_api.md              ← API Node.js / endpoints
│   ├── 04_authentification.md        ← Auth, OTP, JWT, MFA
│   ├── 05_frontend_web.md             ← React (web)
│   ├── 06_frontend_mobile.md          ← React Native (mobile)
│   ├── 07_geolocalisation.md          ← GPS, cartes, suivi temps réel
│   ├── 08_paiements.md                ← Mobile Money, Orange Money, Wave
│   ├── 09_admin_dashboard.md          ← Tableau de bord admin
│   ├── 10_securite.md                 ← Sécurité, anti-phishing, RGPD
│   ├── 11_ia_recommandation.md        ← Fonctionnalités IA
│   ├── 12_tests.md                    ← Tests unitaires, intégration, charge
│   ├── 13_notifications.md            ← Push, SMS, email
│   ├── 14_offline_cache.md            ← Mode hors-ligne, sync asynchrone
│   └── 15_deploiement.md              ← CI/CD, monitoring, DevOps
```

---

## Fonctionnalités principales

| Module | Description |
|--------|-------------|
| Profils & Vérification | Création de compte avec validation OTP + pièce d'identité |
| Authentification | JWT + MFA (OTP SMS) + détection de session suspecte |
| Recherche géolocalisée | Filtres avancés, carte interactive, favoris |
| Suivi GPS temps réel | Tracking prestataire (modèle Uber), statuts de mission |
| Paiements sécurisés | Mobile Money, Orange Money, Wave + commission admin |
| Tableau de bord admin | Modération, litiges, commissions, statistiques |
| IA & recommandation | Matching intelligent, optimisation parcours, qualité |
| Mode hors-ligne | Cache local, synchronisation asynchrone |
| Notifications | SMS OTP, push notifications, alertes email |
| Sécurité | Anti-XSS, anti-injection SQL, chiffrement, RGPD |

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Base de données | PostgreSQL 15 + Redis (cache) |
| Backend | Node.js 20 + Express + Prisma ORM |
| Authentification | JWT + bcrypt + TOTP/OTP SMS (Twilio) |
| Frontend Web | React 18 + Tailwind CSS + React Query |
| Frontend Mobile | React Native 0.73 + Expo |
| Temps réel | Socket.IO (WebSocket) |
| Cartes | Leaflet.js (web) + React Native Maps |
| Paiements | Wave API, Orange Money API, Free Money API |
| IA | TensorFlow.js / Python microservice (FastAPI) |
| Tests | Jest, React Testing Library, Supertest, k6 |
| CI/CD | GitHub Actions + Docker + Nginx |
| Monitoring | Sentry + Prometheus + Grafana |

---

## Démarrage rapide (développement)

```bash
# Cloner le dépôt
git clone https://github.com/bla-app/bla.git
cd bla

# Backend
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev

# Frontend web
cd ../frontend-web
npm install
npm run dev

# Mobile
cd ../mobile
npm install
npx expo start
```

---

## Contacts & équipe

- Chef de projet : à définir
- Lead Backend : à définir
- Lead Frontend/Mobile : à définir
- Designer UX/UI : à définir

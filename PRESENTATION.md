# 📋 BLA Services — Présentation du projet

> Résumé simple pour comprendre le projet en 2 minutes.

---

## C'est quoi ?

**Une marketplace de services à la demande** (dans l'esprit d'Uber / Airbnb, mais pour les services du quotidien), destinée à l'**Afrique de l'Ouest** (Côte d'Ivoire, Togo, Mali, Burkina Faso…).

Elle met en relation :
- 👤 des **clients** qui cherchent un service (plomberie, électricité, ménage, coiffure, transport, cours particuliers…) ;
- 🔧 des **prestataires** qui proposent leurs services près de chez eux.

---

## Comment ça marche ?

1. Le client **recherche** un prestataire par catégorie, distance, note et prix (avec une **carte interactive**).
2. Il **réserve** une prestation et **paie en ligne** (Mobile Money / Orange Money / Wave via CinetPay, ou carte bancaire via Stripe).
3. Le prestataire **accepte**, réalise la prestation ; le client **valide** puis **laisse un avis**.
4. La plateforme prélève une **commission** sur chaque transaction.

---

## Les 3 espaces

| Espace | Pour qui | Adresse |
|---|---|---|
| **Site public** | clients & prestataires | www.blalinker.com |
| **Dashboard admin** | modération & gestion | admin.blalinker.com |
| **API (serveur)** | le « cerveau » de l'app | api.blalinker.com |

*(Une application mobile React Native / Expo est également amorcée.)*

---

## La technique (simplifiée)

| Brique | Techno | Hébergeur |
|---|---|---|
| Site public + admin | React (Vite) | **Vercel** |
| Serveur / API | Node.js (Express, Prisma) | **Render** |
| Base de données | PostgreSQL | **Supabase** |
| Cache / sécurité | Redis | **Upstash** |
| E-mails | Brevo | — |
| Paiements | Stripe + CinetPay | — |
| Nom de domaine + DNS | — | **OVHcloud** |

---

## Fonctionnalités déjà en place ✅

- Inscription / connexion **sécurisée** (code OTP par e-mail, JWT, cookies protégés)
- Recherche **géolocalisée** de prestataires (carte, filtres distance/note/prix)
- **Réservation** + **paiement en ligne** (carte & Mobile Money)
- **Avis & notation**, **notifications**, **signalements**
- **Espace admin** (utilisateurs, prestataires, réservations, transactions, modération)
- Multilingue (FR / EN / Wolof), mode hors-ligne, mode sombre

---

## Où en est le projet ?

🚧 **Niveau de préparation à la production : ~55-60 %.**

Il reste principalement :
- le **versement automatique aux prestataires** (escrow / remboursements) — le vrai enjeu marketplace ;
- l'**upload de pièce d'identité (KYC)** pour vérifier les prestataires ;
- la **saisie de la position GPS** côté prestataire (pour être trouvable) ;
- l'**anti-robot** (CAPTCHA) et la mise en place des sauvegardes / monitoring.

---

## Objectif

Lancer d'abord un **pilote sur un pays** (Côte d'Ivoire), puis étendre à plusieurs pays d'Afrique de l'Ouest, avec l'ambition d'atteindre plusieurs milliers d'utilisateurs.

---

*Pour les détails techniques de déploiement, voir [GUIDE-DEPLOIEMENT.md](GUIDE-DEPLOIEMENT.md). Pour l'état de sécurité et les priorités, voir [AUDIT.md](AUDIT.md).*

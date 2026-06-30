# 🏢 Rapport d'audit — BLA Services

*Audit pluridisciplinaire — préparation à une mise en production multi-pays (CI, TG, ML, BF).*
État du code au moment de l'audit (après les correctifs déjà appliqués : paiement webhook, IDOR, cookies, JWT, commissions, etc.).

> **Limite** : analyse statique du code + infrastructure. Pas de test de charge réel ni de scan dynamique exécuté.

---

## Partie 1 — Audit global (notes /10)

| Domaine | Note | Points faibles principaux |
|---|---|---|
| Architecture | 7 | logique métier dans les controllers |
| Organisation / structure | 7 | couche service incohérente |
| Qualité code | 6.5 | `catch{}` génériques, casts |
| Performances | 6 | plan free, géo non indexée, pas de CDN API |
| UX / UI / Responsive | 6 | pas de chat/avis/notifs |
| SEO | 6 | SPA sans SSR |
| Accessibilité | 5 | pas d'audit a11y |
| Sécurité | 6.5 | secrets à roter, faille prix, anti-bot absent |
| API | 6 | pas d'OpenAPI |
| Base de données | 7 | index géo manquant, AuditLog/Consent inutilisés |
| Authentification | 7.5 | OTP loggé / dans le sujet email |
| Autorisations | 6.5 | admin = super_admin |
| Paiement | 4 | pas de versement / remboursement / escrow |
| Notifications | 3 | pas d'API utilisateur |
| Emails | 6.5 | DKIM/SPF à configurer |
| OTP | 7 | — |
| Logs | 5 | code OTP loggé, pas d'agrégation |
| Monitoring | 2 | Sentry/metrics non branchés, health superficiel |
| Sauvegardes | 3 | non configurées |
| Déploiement | 7 | plan free, 2 chaînes |
| Gestion erreurs | 5 | 500 génériques |
| Industrialisation | 5 | pas de staging, pas d'exports |

**Note globale : ~5.8/10**

---

## Partie 2 — Cybersécurité (synthèse)

✅ **OK / corrigé** : injection SQL (Prisma + $queryRaw paramétré), XSS (React + emails échappés + CSP), IDOR (scoping), JWT (RS256 + type + révocation), webhooks paiement (Stripe signé, CinetPay re-vérifié), CORS, headers/CSP, cookies HttpOnly.

🔴 **Critique** :
- **Secrets exposés** (`KeyValueDelete.txt`, `render-missing-vars.env`) → clé privée JWT, DATABASE_URL, ENCRYPTION_KEY, BREVO_API_KEY, STRIPE_SECRET_KEY. Gitignorés mais **à ROTER**.
- **Manipulation de prix** : `POST /bookings` accepte un `amount` envoyé par le client → paiement à un montant arbitraire. **(Corrigé dans la Phase 1 ci-dessous.)**

🟠 **Important** : pas de CAPTCHA (spam + comptes massifs), pas de WAF/CDN devant l'API, rate-limit en mémoire (non partagé), `admin` = `super_admin`, OTP loggé / dans le sujet email.

🟡 **Moyen** : CSRF résiduel sur le refresh (cookie SameSite=None), `role` choisi librement à l'inscription, `admin getUser` renvoie `passwordHash`/`mfaSecret`.

---

## Partie 3 — Simulation d'attaque (état au moment de l'audit)

| Scénario | Possible ? |
|---|---|
| Contourner un paiement | ✅ Non (corrigé) |
| **Payer moins cher (prix client)** | 🔴 Oui → corrigé Phase 1 |
| Voler / modifier une réservation d'autrui | ✅ Non |
| Modifier un autre utilisateur | ✅ Non |
| Créer des comptes en masse | 🟠 Oui (pas de captcha) |
| Usurper / contourner KYC | 🟡 Partiel (upload KYC absent) |
| Voler des données (via secrets) | 🔴 Oui si secrets non rotés |
| Spam contact / DDoS API | 🟠 Oui (captcha/WAF absents) |

---

## Partie 4 — Audit fonctionnel

**Client** : compte/OTP ✅, profil ✅, recherche (distance/note/prix) ✅, réserver ✅, payer ✅, annuler ✅, historique ✅ — **manquants** : avis, signalement, chat, factures, notifications, favoris, avatar, moyens de paiement, adresses multiples.

**Prestataire** : compte/profil ✅, services/prix ✅, accepter/refuser/démarrer/terminer ✅ — **manquants** : upload KYC, horaires/agenda, revenus/commissions, retraits, versements, réponse aux avis, statistiques, notifications.

---

## Partie 5 — Espace admin

✅ utilisateurs, prestataires, réservations, transactions (lecture), avis (modération), signalements (résolution), contacts, catégories (créer/modifier).
❌ retraits, villes/pays, paramètres, promos/codes promo, exports CSV/Excel, journal d'audit, gestion fine des rôles, fraude, KYC documents.
⚠️ `admin` et `super_admin` ont les mêmes droits.

---

## Partie 6 — Marketplace (flux d'argent)

- Collecte sécurisée ✅. Commission calculée ✅ (`netAmount` enregistré).
- 🔴 **Aucun versement prestataire** (pas de Stripe Connect / payout) → l'argent reste sur le compte plateforme.
- 🔴 **Aucun remboursement**, **aucun escrow**, no-show non géré.
- 🟡 Litiges via `Report` mais non liés à l'argent. Multi-devises non géré.

➡️ **Ce n'est pas encore une marketplace au sens paiement.** Bloquant : Stripe Connect (ou payout CinetPay/Wave) + remboursements + escrow + politique d'annulation.

---

## Partie 7 — Améliorations attendues

Prioritaires : avis & notation, messagerie, notifications (in-app/push/SMS), KYC upload, agenda prestataire, **versements + remboursements + escrow**, factures PDF, signalements, favoris, CAPTCHA, exports admin, journal d'audit.
Plus tard : photos avant/après, signature électronique, abonnements, fidélité/parrainage, coupons, IA matching, multi-pays/devises, WhatsApp, PWA/app mobile.

---

## Partie 8 — Roadmap

- **Phase 1 (critique)** : roter secrets, corriger faille prix, sauvegardes, monitoring.
- **Phase 2 (sécurité)** : captcha, WAF Cloudflare, rate-limit Redis, rôles admin, ne plus logger l'OTP.
- **Phase 3 (marketplace)** : versements/remboursements/escrow, KYC upload, avis, signalements.
- **Phase 4 (paiement)** : Wave/Orange Money directs, multi-devises, factures PDF.
- **Phase 5 (UX)** : notifications, push/SMS, DKIM, recherche par ville.
- **Phase 6 (fonctionnalités)** : chat, agenda, favoris, exports, audit, parrainage.
- **Phase 7 (optimisation)** : PostGIS, SSR, tests e2e/charge, CDN.

---

## Évaluation globale

**Préparation production : ≈ 45 %.** Socle technique solide, sécurité fortement améliorée, paiement collecté de façon sûre — mais **flux marketplace (versements/remboursements/escrow), avis, notifications, KYC upload, anti-bot, sauvegardes et monitoring manquent**.

Après Phases 1→3 : ~80 % (lançable en pilote sur 1 pays avant extension multi-pays).

---

## Journal des correctifs appliqués (suite à cet audit)

Voir l'historique Git. Les éléments codables des Phases 1-2-3 ont été traités ; les actions nécessitant des tableaux de bord externes (rotation de secrets, Stripe Connect, Cloudflare, backups Supabase, clés CAPTCHA) sont listées comme **à faire manuellement** dans le résumé de livraison.

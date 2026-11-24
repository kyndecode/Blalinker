# Mise en production — lots 0 à 4 (branche `fix/admin-login-reconstruction`)

Procédure à suivre **dans l'ordre**. Aucune valeur secrète n'est écrite ici : chaque
variable se renseigne directement dans le tableau de bord concerné.

## 0. Accès nécessaires

| Action | Où | Qui |
|---|---|---|
| Pousser la branche | GitHub `kyndecode/Blalinker` (droit d'écriture) | propriétaire du dépôt |
| Variables et déploiement du backend | Render, service qui sert `api.blalinker.com` | propriétaire Render |
| Site et administration | Vercel, projets `blalinker` et `blalinker-admin` | propriétaire Vercel |
| Sauvegarde de la base | Supabase | propriétaire Supabase |
| Expéditeur e-mail | Brevo | propriétaire Brevo |

⚠️ Ne pas modifier l'ancien service Render (créé en mars 2026, base expirée) : il ne sert
plus le domaine et ne doit jamais être pointé vers Supabase.

## 1. Sauvegarde Supabase (obligatoire avant tout déploiement)

1. Supabase → *Database* → *Backups* : noter la date de la dernière sauvegarde.
2. Si elle date de plus de 24 h ou si l'offre ne propose pas de restauration à un instant
   donné : faire un export manuel (`pg_dump` depuis un poste de confiance, fichier
   chiffré, hors dépôt Git).

## 2. Variables Render (service de production)

| Variable | Valeur attendue | Pourquoi |
|---|---|---|
| `ADMIN_EMAIL` | `contact@blalinker.com` | le code de démarrage actuellement en ligne pourrait sinon recréer un compte super-administrateur ; le nouveau code ne le fait plus |
| `GOOGLE_CLIENT_ID` | même valeur que `VITE_GOOGLE_CLIENT_ID` sur Vercel | sans elle, la connexion Google est refusée en production |
| `ADMIN_TOTP_REQUIRED` | ne pas définir pour l'instant | à activer une fois l'application d'authentification configurée par l'équipe |
| `CLOUDINARY_*` | déjà présentes (vérifier) | pièces d'identité protégées, médiathèque |
| Commande de démarrage | doit contenir `prisma migrate deploy` (jamais `db push`) | applique les migrations additives |

Noter aussi **la branche** qui déclenche le déploiement automatique.

## 3. Brevo

Brevo → *Sécurité* → *Adresses IP autorisées* : ajouter les plages sortantes indiquées par
Render (service → *Connect* → *Outbound*). Sans cela, l'envoi des codes par e-mail échoue.

## 4. Migrations appliquées au démarrage

| Migration | Contenu | Risque |
|---|---|---|
| `20261124_admin_totp_mfa` | 2 colonnes facultatives sur `users`, table `mfa_recovery_codes` | additive |
| `20261125_site_content` | type `ContentStatus`, tables `content_pages`, `faq_items`, `announcements`, `site_settings`, `countries`, `media_assets` | additive |

Toutes deux testées sur PostgreSQL 17 jetable : aucune ligne modifiée ni perdue,
rejouables sans effet. L'ancien code reste compatible avec la base migrée (tables et
colonnes supplémentaires ignorées).

## 5. Déploiement progressif

1. Pousser la branche, attendre la CI (lint, tests, tests sur base réelle, audit de sécurité).
2. Vérifier les prévisualisations Vercel du site et de l'administration.
3. Fusionner vers la branche de déploiement **juste avant** de déployer.
4. Backend Render : suivre les journaux (migrations « applied », démarrage sans erreur).
5. Contrôles du point 6, puis administration Vercel, puis site public.

## 6. Contrôles après déploiement

- `GET https://api.blalinker.com/health` → `200`, `"status":"ok"`.
- `GET /api/v1/site/health` → `200` ; `GET /api/v1/site/config` → uniquement des booléens.
- Fiche publique d'un prestataire (`GET /api/v1/providers/<id>`) : aucun champ e-mail,
  téléphone, adresse ou mot de passe dans la réponse.
- `GET /api/v1/search?q=plomberie` → `200`.
- Connexion à l'administration (code e-mail ou application), puis menu, tableau de bord.
- Site : accueil, recherche, fiche prestataire, réservation de test sur un compte de test.

## 7. Après la mise en ligne

1. Pièces d'identité déposées avant la protection : depuis un shell sécurisé disposant des
   variables de production (shell Render par exemple) :
   `npm run kyc:protect-documents` (simulation), puis `npm run kyc:protect-documents -- --confirm`.
2. Équipe : configurer l'application d'authentification (page « Mon compte »), puis
   envisager `ADMIN_TOTP_REQUIRED=true`.
3. Contenus : pays desservis, paramètres (coordonnées, réseaux), pages légales et FAQ
   depuis l'administration (le site garde ses textes intégrés tant que rien n'est publié).

## 8. Retour arrière

- Backend : Render → *Rollback* vers le déploiement précédent.
- Frontends : Vercel → *Instant Rollback*.
- Base : rien à annuler (migrations additives) ; ne jamais supprimer les nouvelles tables
  en urgence.

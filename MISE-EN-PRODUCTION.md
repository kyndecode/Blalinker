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

### Pousser la branche (accès GitHub)

Le compte GitHub enregistré sur le poste de travail (`goweelZ50`) appartient à un autre
projet et n'a pas le droit d'écrire sur `kyndecode/Blalinker` : il ne doit pas être utilisé.
Dans un terminal :

```
gh auth login --hostname github.com --git-protocol https --web    (choisir le compte kyndecode)
gh auth switch --user kyndecode
cd C:\Users\Jean-YvesDG\Downloads\BLA-SERVICE-PROPRE
git push -u origin fix/admin-login-reconstruction
```

Le dépôt local est configuré pour s'identifier en `kyndecode` (configuration propre au dépôt).

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
| `TRUST_PROXY_HOPS` | ne pas définir au départ (défaut 1) ; si l'historique des connexions n'affiche que des IP en 10.x, mettre 2 | IP réelle des clients (limites de fréquence, journal) |
| Offre (*Settings → Instance Type*) | offre payante recommandée (au moins *Starter*) | l'offre gratuite s'endort après 15 min : réveil mesuré à 32 s le 2026-11-25, d'où les écrans qui « moulinent » |

Noter aussi **la branche** qui déclenche le déploiement automatique.

## 2 bis. Vercel et Google

| Où | Quoi |
|---|---|
| Vercel → projet `blalinker` → *Settings → Environment Variables* | `VITE_GOOGLE_CLIENT_ID` = **même valeur** que `GOOGLE_CLIENT_ID` sur Render (Production et Preview), puis *Deployments → Redeploy* : Vite intègre la valeur à la compilation. Constat du 2026-11-25 : absente du site en ligne. |
| Vercel → projet `blalinker` | `VITE_API_URL` = `https://api.blalinker.com/api/v1` (constaté correct en ligne) |
| Vercel → projet `blalinker-admin` | `VITE_API_URL` identique ; pas d'identifiant Google (connexion Google refusée aux comptes d'administration) |
| Google Cloud Console → *APIs & Services → Credentials* → client OAuth « Web » de BLALINKER | *Authorized JavaScript origins* : `https://www.blalinker.com` et `https://blalinker.com`. Aucune URI de redirection n'est nécessaire (Google Identity Services). |

Un client OAuth distinct par projet (BLALINKER, WeLe, E-SCOLAR) : le serveur BLALINKER accepte
tout jeton émis pour son identifiant ; un identifiant partagé ferait accepter ici des jetons
obtenus sur un autre site.

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

## 5 bis. Données visibles sur le site

Constat du 2026-11-25 : l'API de production renvoie **0 service actif**. Le site n'affiche que les
services actifs de prestataires au statut « actif » (un prestataire inscrit reste « en attente »
jusqu'à la validation de sa pièce d'identité dans l'administration). Pour vérifier, Supabase →
*SQL Editor*, requêtes en lecture seule (comptages uniquement) :

```sql
SELECT role, status, count(*) FROM users WHERE deleted_at IS NULL GROUP BY role, status ORDER BY role, status;
SELECT is_active, count(*) FROM provider_services GROUP BY is_active;
SELECT count(*) FILTER (WHERE id_card_url IS NOT NULL AND NOT id_verified) AS pieces_a_valider,
       count(*) FILTER (WHERE id_verified) AS identites_validees FROM profiles;
```

Ne jamais insérer de données de test en production : le jeu de diagnostic
(`npm run db:diagnostic -- --create`) refuse toute base non locale.

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

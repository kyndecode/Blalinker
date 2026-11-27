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
| `ADMIN_TOTP_REQUIRED` | `true` depuis le 27/11/2026 | un administrateur sans application d'authentification est conduit à la configurer dès sa connexion (code e-mail), puis accède à l'administration |
| `ADMIN_PASSWORD` | à **supprimer** | ne sert qu'à créer le tout premier super-administrateur, qui existe déjà : inutile, et c'est un mot de passe en clair qui traîne |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | **absentes au 27/11/2026 : à créer** (compte Cloudinary gratuit, voir point 2 quater) | sans elles, tout envoi de fichier répond « Stockage de fichiers non configuré » : pièces d'identité des prestataires (donc aucune validation possible), photos de profil, médiathèque |
| Commande de démarrage | doit contenir `prisma migrate deploy` (jamais `db push`) | applique les migrations additives |
| `TRUST_PROXY_HOPS` | ne pas définir au départ (défaut 1) ; si l'historique des connexions n'affiche que des IP en 10.x, mettre 2 | IP réelle des clients (limites de fréquence, journal) |
| Offre (*Settings → Instance Type*) | *Free* (pas de budget) | l'offre gratuite s'endort après 15 min (réveil mesuré à 32 s) : compensé gratuitement, voir point 2 quater |
| `MFA_ENABLED` | ne pas définir (défaut : actif) ; jamais `false` durablement | interrupteur de secours pour une panne d'e-mail. Depuis le nouveau code, un administrateur ayant configuré son application d'authentification doit **toujours** saisir son code, même avec `false` |
| `METRICS_TOKEN` | facultatif | `/metrics` est fermé en production (404) ; ne définir ce jeton que si un outil de supervision doit lire les métriques (`Authorization: Bearer …`) |
| `CORS_ORIGIN` | `https://www.blalinker.com,https://blalinker.com,https://admin.blalinker.com` | les origines `localhost` ne sont plus acceptées par défaut en production ; ajouter ici une adresse de prévisualisation si nécessaire |

Noter aussi **la branche** qui déclenche le déploiement automatique.

## 2 bis. Vercel et Google

| Où | Quoi |
|---|---|
| Vercel → projet `blalinker` → *Settings → Environment Variables* | `VITE_GOOGLE_CLIENT_ID` = **même valeur** que `GOOGLE_CLIENT_ID` sur Render (Production et Preview), puis *Deployments → Redeploy* : Vite intègre la valeur à la compilation. Fait le 2026-11-25 (connexion Google vérifiée en ligne). |
| Vercel → projet `blalinker` | `VITE_API_URL` = `https://api.blalinker.com/api/v1` (constaté correct en ligne) |
| Vercel → projet `blalinker-admin` | `VITE_API_URL` identique ; pas d'identifiant Google (connexion Google refusée aux comptes d'administration) |
| Google Cloud Console → *APIs & Services → Credentials* → client OAuth « Web » de BLALINKER | *Authorized JavaScript origins* : `https://www.blalinker.com` et `https://blalinker.com`. Aucune URI de redirection n'est nécessaire (Google Identity Services). |

Un client OAuth distinct par projet (BLALINKER, WeLe, E-SCOLAR) : le serveur BLALINKER accepte
tout jeton émis pour son identifiant ; un identifiant partagé ferait accepter ici des jetons
obtenus sur un autre site.

## 2 ter. Supabase — accès à la base hors API

Le site et l'administration n'utilisent jamais Supabase directement : seul le backend (Prisma)
accède à la base. Les tables du schéma `public` ne doivent donc pas être lisibles par l'API
automatique de Supabase (clé `anon`).

1. Supabase → *Advisors → Security Advisor* : noter les alertes « RLS disabled in public ».
2. Vérification en lecture seule (*SQL Editor*) :

   ```sql
   SELECT c.relname AS table_name, c.relrowsecurity AS rls_active
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1;
   ```

3. Si des tables ont `rls_active = false` : **après la sauvegarde du point 1**, activer la sécurité
   par ligne sur chacune, sans aucune règle d'accès (refus pour `anon` et `authenticated`).
   Le backend n'est pas affecté : il se connecte avec le rôle propriétaire des tables, qui
   n'est pas soumis à ces règles. Exemple pour une table : `ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;`
   Variante plus simple si l'API automatique ne sert à rien : *Settings → API → Exposed schemas*,
   retirer `public`.
4. Vérifier ensuite `GET https://api.blalinker.com/health` → `200` (le backend lit toujours la base).

## 2 quater. Fonctionner sans abonnement payant

| Besoin | Solution gratuite |
|---|---|
| Service endormi après 15 min (réveil de 30 s) | Tâche GitHub Actions `.github/workflows/keep-alive.yml` : appel de `/health` toutes les 10 min de 05:00 à 23:59 UTC. Environ 590 h par mois, sous le quota gratuit Render de 750 h **pour tout le compte** : garder l'ancien service `bla-backend.onrender.com` suspendu et ne pas créer d'autre service gratuit qui tourne en continu. |
| Être prévenu d'une panne | Compte gratuit [UptimeRobot](https://uptimerobot.com) : moniteur HTTP(s) sur `https://api.blalinker.com/health`, toutes les 5 min, alerte par e-mail. Il garde aussi le service éveillé. |
| Stockage des fichiers | Compte gratuit [Cloudinary](https://cloudinary.com) (sans carte bancaire) : *Settings → API Keys* donne le nom du cloud, la clé et le secret, à copier dans les 3 variables `CLOUDINARY_*` de Render (*Save, rebuild, and deploy*). Les pièces d'identité sont stockées en accès « authenticated » (jamais publiques). |
| Base Supabase mise en pause après 7 jours sans activité | Évité par l'appel régulier à `/health`, qui interroge la base. |
| Sauvegardes (non incluses dans l'offre gratuite Supabase) | Export manuel `pg_dump` (point 1) au moins une fois par mois et avant chaque mise en production, conservé hors du dépôt et hors de tout dossier synchronisé. Ne jamais automatiser l'export dans GitHub Actions : sur un dépôt public, les fichiers produits seraient téléchargeables. |
| Shell Render (réservé aux offres payantes) | Les scripts de maintenance se lancent depuis le poste de confiance, voir point 7. |

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

1. Pousser la branche puis **ouvrir une Pull Request vers `main`** : la CI ne se lance que sur
   les Pull Requests vers `main` et les pushs sur `main`/`develop`. Attendre qu'elle soit verte
   (lint, tests, tests sur base réelle, audit de sécurité, builds).
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

## 6 bis. GitHub (une fois, propriétaire du dépôt)

- *Settings → Branches* : protéger `main` (Pull Request obligatoire, CI verte exigée : jobs
  « Tests Backend », « Tests Frontend Web », « Tests Frontend Admin », « Audit sécurité »).
  Aujourd'hui `main` n'est pas protégée : un push direct déclenche le déploiement Render
  sans passer par la CI.
- *Actions → Security Scan* : réactiver le workflow (désactivé automatiquement par GitHub après
  60 jours sans activité sur le dépôt).

## 7. Après la mise en ligne

1. Pièces d'identité déposées avant la protection. D'abord compter, en lecture seule
   (Supabase → *SQL Editor*) :

   ```sql
   SELECT count(*) AS documents FROM profiles WHERE id_card_url IS NOT NULL;
   ```

   - `0` (cas attendu : Cloudinary n'était pas configuré, aucun envoi n'a pu aboutir) : rien à faire.
   - Sinon, depuis le poste de confiance (pas de Shell Render sur l'offre gratuite), dans
     `backend/`, en définissant les variables **dans le terminal uniquement** (jamais dans un
     fichier du dépôt), puis en fermant le terminal :

     ```powershell
     $env:DATABASE_URL = "<adresse Supabase, port 5432>"
     $env:CLOUDINARY_CLOUD_NAME = "<nom>"; $env:CLOUDINARY_API_KEY = "<clé>"; $env:CLOUDINARY_API_SECRET = "<secret>"
     npm run kyc:protect-documents                 # simulation
     npm run kyc:protect-documents -- --confirm    # exécution
     ```
2. Équipe : chaque administrateur configure son application d'authentification (page
   « Mon compte » ; imposé à la connexion depuis `ADMIN_TOTP_REQUIRED=true`) et conserve
   ses codes de récupération hors ligne.
3. Contenus : pays desservis, paramètres (coordonnées, réseaux), pages légales et FAQ
   depuis l'administration (le site garde ses textes intégrés tant que rien n'est publié).

## 8. Retour arrière

- Backend : Render → *Rollback* vers le déploiement précédent.
- Frontends : Vercel → *Instant Rollback*.
- Base : rien à annuler (migrations additives) ; ne jamais supprimer les nouvelles tables
  en urgence.

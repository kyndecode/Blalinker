# Guide complet de déploiement d'un nouveau site web

> Manuel de référence réutilisable pour mettre en ligne un site (frontend + backend + base de données + paiements) avec **OVHcloud, Vercel, Render, Supabase, Upstash, Stripe**.
> Basé sur le projet **BLA / blalinker.com**. Pour un autre client, remplace simplement `blalinker.com` par son domaine et les noms de services.

---

## 1. Vue d'ensemble

On sépare le projet en **plusieurs services spécialisés**, chacun avec un rôle précis :

| Brique | Service utilisé | Rôle | Niveau / Plan |
|---|---|---|---|
| Nom de domaine | **OVHcloud** | Adresse du site + **DNS** (aiguille les sous-domaines vers les bons services) | Domaine payant/an |
| Site public | **Vercel** (projet 1) | Héberge le **site visible par les clients** (React/Vite) | Hobby (gratuit) |
| Dashboard admin | **Vercel** (projet 2) | Héberge le **back-office** (React/Vite), séparé pour la sécurité | Hobby (gratuit) |
| API / backend | **Render** | Fait tourner le **serveur Node.js** (logique, auth, paiements) | Free (⚠️ se met en veille) → payant en prod |
| Base de données | **Supabase** | **PostgreSQL** : stocke utilisateurs, données… | Free → payant si trafic |
| Cache / sessions | **Upstash Redis** | Jetons révoqués, OTP temporaires, anti-bruteforce | Free (serverless) |
| Paiements | **Stripe** + CinetPay | Cartes (Stripe) + Mobile Money Afrique (CinetPay) | Test puis Production |
| E-mails | **Brevo** | Envoi des codes OTP et notifications | Free |
| Code source | **GitHub** | Stocke le code ; déclenche les déploiements auto | Gratuit |

### Schéma simple (qui parle à qui)

```
                         ┌──────────────── OVHcloud (DNS) ─────────────────┐
                         │  www / @  →  Vercel        api  →  Render        │
                         │  admin    →  Vercel        (MX/SPF → e-mails)    │
                         └──────────────────────────────────────────────────┘
   Navigateur
      │  www.blalinker.com  ───────────►  Vercel (site public)
      │  admin.blalinker.com ──────────►  Vercel (dashboard admin)
      │
      └─ appels API ──►  api.blalinker.com  ──►  Render (Node.js)
                                                   │
                          ┌────────────────────────┼─────────────────────┐
                          ▼                         ▼                      ▼
                    Supabase (PostgreSQL)    Upstash (Redis)        Stripe / CinetPay
                                                                    + Brevo (e-mails)
```

**Pourquoi séparer ?** Chaque service est le meilleur dans son domaine, les offres gratuites suffisent pour démarrer, et si une brique tombe, les autres tiennent. Le **site (Vercel)** et l'**API (Render)** sont sur des sous-domaines différents mais **le même domaine racine** → indispensable pour que les cookies de session fonctionnent (voir §11).

---

## 2. Prérequis (à cocher avant de commencer)

- ☐ Nom de domaine (OVHcloud)
- ☐ Compte **GitHub** (celui qui possède le dépôt du code)
- ☐ Compte **OVHcloud**
- ☐ Compte **Vercel** (⚠️ **1 seul par numéro de téléphone**, voir piège §4)
- ☐ Compte **Render**
- ☐ Compte **Supabase**
- ☐ Compte **Upstash**
- ☐ Compte **Stripe**
- ☐ Compte **Brevo** (e-mails)
- ☐ Accès à une **boîte e-mail** pour les vérifications
- ☐ **Git** installé + le code poussé sur GitHub
- ☐ **Node.js** + **OpenSSL** (fournis avec Git Bash sous Windows)

> 💡 **Astuce comptes** : pour éviter les blocages, utilise **les mêmes identifiants** (Google/email) partout, et **réutilise** un compte existant plutôt que d'en créer un nouveau quand un service limite par téléphone.

---

## 3. Configuration d'OVHcloud (DNS)

**But :** dire à Internet « pour `api.` va sur Render, pour `www.` et le domaine nu va sur Vercel ».

> ⚠️ **Règle d'or : on ajoute d'abord le domaine DANS Render/Vercel**, qui affichent la **cible exacte** à mettre, **puis** on crée l'entrée chez OVH.

### Enregistrements à créer (OVH → *Domaine → Zone DNS*)

| Sous-domaine | Type | Cible (exemple BLA) | Rôle |
|---|---|---|---|
| `api` | CNAME | `mon-service.onrender.com.` | Pointe l'API vers Render |
| `www` | CNAME | `cname.vercel-dns.com.` (ou la valeur affichée par Vercel) | Site public |
| `@` (racine) | A | `76.76.21.21` (ou l'IP affichée par Vercel) | Domaine nu → Vercel |
| `admin` | CNAME | `cname.vercel-dns.com.` | Dashboard admin |

### ⛔ À NE JAMAIS toucher (sinon les e-mails / la zone cassent)
`@ NS`, `@ MX`, `@ SPF (v=spf1…)`, `imap` `pop3` `smtp` `mail` `ftp`, `autoconfig` `autodiscover`, `_*._tcp`, et les DKIM `ovhmo-selector-*`.

### Points clés
- **SSL** : automatique (Let's Encrypt) côté Render et Vercel **une fois le DNS validé**. Rien à faire manuellement.
- **Propagation** : de quelques minutes à **24 h max** (souvent < 1 h).
- Un nom **ne peut pas** avoir un `CNAME` **et** un `A`/`AAAA` en même temps → supprime les anciens A/AAAA avant de mettre un CNAME.
- L'apex (`@`) **ne peut pas** être un CNAME chez OVH → on utilise un **A** vers l'IP de Vercel.

### Checklist OVH
- ☐ `api` → CNAME vers le host Render
- ☐ `www` → CNAME vers Vercel
- ☐ `@` → A vers l'IP Vercel (supprimer l'ancien AAAA si présent)
- ☐ `admin` → CNAME vers Vercel
- ☐ Enregistrements e-mail (MX/SPF/DKIM/NS) **laissés intacts**
- ☐ Attendre la propagation + cadenas SSL

### Erreurs fréquentes
| Erreur | Cause | Solution |
|---|---|---|
| `api` boucle | CNAME `api` → `api.blalinker.com` (lui-même) | Mettre la cible `*.onrender.com` |
| « Connexion pas privée » sur www | Certificat pas encore émis | Attendre, vérifier « Valid » dans Vercel |
| Les e-mails ne marchent plus | MX/SPF supprimés par erreur | Les remettre (OVH) |

---

## 4. Configuration de Vercel (les frontends)

**Pourquoi 2 projets Vercel ?** Le **site public** et le **dashboard admin** sont 2 applications différentes → 2 projets séparés (sécurité + l'admin est mis en `noindex`). **Niveau d'hébergement : Hobby (gratuit)** suffit pour des sites statiques React/Vite.

### Création (pour CHAQUE projet : site, puis admin)
1. Vercel → **Add New → Project** → importer le dépôt GitHub.
2. **Root Directory** = le dossier du frontend (`frontend-web` puis `frontend-admin`).
3. Framework détecté : **Vite** (laisser les valeurs par défaut). Le fichier `vercel.json` du dépôt gère le routing SPA + en-têtes de sécurité.
4. **Environment Variables** :
   - `VITE_API_URL` = `https://api.blalinker.com/api/v1`
   - `VITE_GOOGLE_CLIENT_ID` = *(site public seulement, si login Google)*
5. **Deploy**.
6. **Settings → Domains** : ajouter les domaines
   - projet site : `www.blalinker.com` **+** `blalinker.com`
   - projet admin : `admin.blalinker.com`

### Déploiement automatique
Chaque `git push` sur `main` redéploie automatiquement (une fois le dépôt connecté). Sinon, déploiement manuel par **CLI** :
```bash
npm i -g vercel
vercel login
cd frontend-web && vercel --prod
```

### Checklist Vercel
- ☐ Projet site créé (Root = `frontend-web`)
- ☐ Projet admin créé (Root = `frontend-admin`)
- ☐ `VITE_API_URL` renseignée (les 2)
- ☐ Domaines ajoutés + SSL « Valid »
- ☐ Déploiement réussi

### Piège vécu
| Problème | Solution |
|---|---|
| Vercel demande un téléphone déjà utilisé | **1 numéro = 1 compte** → se reconnecter au **compte existant** (ne pas en créer un nouveau) |
| Le dépôt n'apparaît pas | *Adjust GitHub App Permissions* → autoriser le repo, ou déployer via **CLI** |

---

## 5. Configuration de Render (le backend Node.js)

**Niveau :** plan **Free** pour tester (⚠️ se met en veille après 15 min → 1ère requête lente). Passer en **payant** pour la vraie prod.

### Création
1. Render → **New → Blueprint** (lit le `render.yaml`) **ou** **New → Web Service**.
2. Repository = le dépôt GitHub. Branche = `main`.
3. **Root Directory** = `backend`.
4. **Build Command** : `npm ci && npx prisma generate && npm run build`
5. **Start Command** : `npx prisma migrate deploy && node dist/server.js`
   *(`migrate deploy` crée/maj les tables au démarrage)*
6. **Port** : `3000` (l'app lit `PORT`).
7. **Health Check Path** : `/health`
8. Renseigner **toutes les variables d'environnement** (voir §9).
9. **Deploy** → surveiller l'onglet **Logs**.

### Vérification dans les logs (succès attendu)
```
PostgreSQL connecté
Redis connecté
🚀 BLA Backend démarré
Your service is live 🎉
```
Puis tester : `https://api.blalinker.com/health` → doit répondre `ok`.

### Domaine
**Settings → Custom Domains → Add** `api.blalinker.com`, puis créer le CNAME chez OVH (§3).

### Checklist Render
- ☐ Root = `backend`, Build & Start commands OK
- ☐ Toutes les variables saisies (§9)
- ☐ Déploiement « Live » + `/health` = ok
- ☐ Domaine `api.` ajouté + SSL

### Pièges vécus
| Erreur dans les logs | Cause | Solution |
|---|---|---|
| `WRONGPASS` Redis | `REDIS_URL` faux | Recopier l'URL **exacte** d'Upstash |
| Crash au boot (env invalides) | Une variable manquante/incorrecte | Vérifier `ADMIN_EMAIL` (1 seul email), clés, etc. |
| Déconnexion immédiate après login | **Clés JWT non appariées** | Régénérer la **paire** ensemble (§9) |
| Échec connexion DB | Mot de passe non encodé / mauvais pooler | Pooler **Session 5432** + mot de passe **sans caractères spéciaux** |

---

## 6. Configuration de Supabase (PostgreSQL)

### Création
1. Supabase → **New project**.
2. **Région** : la plus proche des utilisateurs (ex. *Frankfurt / eu-central* ou *eu-west*).
3. **Mot de passe DB** : en choisir un **fort SANS caractères spéciaux** (que des lettres + chiffres) → évite les bugs d'URL.
4. Bouton **Connect → ORMs / Prisma → « Session pooler » (port 5432)** → copier l'URL.

> Format attendu :
> `postgresql://postgres.<ref>:<MDP>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require`
> ⚠️ **Ne pas** prendre le « Transaction pooler » (port 6543) → il casse les migrations Prisma.

- **Authentification / Storage / RLS** : *non utilisés dans ce projet* (l'auth et les fichiers sont gérés par notre backend + Cloudinary). À activer seulement si un futur projet s'appuie directement sur Supabase Auth.
- **Migrations** : automatiques au démarrage de Render (`prisma migrate deploy`). Les extensions (`pg_trgm`, `pgcrypto`, `uuid-ossp`) sont créées par les migrations.

### Variables Supabase
| Variable | Où la récupérer | À quoi elle sert | Où la coller |
|---|---|---|---|
| `DATABASE_URL` | Supabase → Connect → Prisma → **Session pooler** | Connexion PostgreSQL | **Render** |

### Checklist Supabase
- ☐ Projet créé + région choisie
- ☐ Mot de passe DB simple noté
- ☐ URL **Session pooler** copiée (`?sslmode=require`)
- ☐ Collée dans Render → migrations OK (« No pending migrations »)

---

## 7. Configuration d'Upstash Redis

### Création
1. Upstash → **Create Database** → type **Redis**, région proche, **TLS activé**.
2. Section **Connect → Node (ioredis)** → copier l'URL **complète** `rediss://…`.

> Format : `rediss://default:<LONG_TOKEN>@<nom>.upstash.io:6379`

### Variables Upstash
| Variable | Où la récupérer | À quoi elle sert | Où la coller |
|---|---|---|---|
| `REDIS_URL` | Upstash → Connect → Node (ioredis) | Cache, OTP temporaires, anti-bruteforce | **Render** |

### Vérification
Dans les logs Render au démarrage : `Redis connecté`. Si `WRONGPASS` → l'URL/token est mauvais, recopier l'exact.

### Checklist Upstash
- ☐ Base Redis créée (TLS)
- ☐ `REDIS_URL` copiée et collée dans Render
- ☐ « Redis connecté » dans les logs

---

## 8. Configuration de Stripe (paiements carte)

### Étapes
1. Créer le compte Stripe → renseigner l'entreprise.
2. **Mode Test** d'abord (clés `sk_test_…` / `pk_test_…`).
3. (Optionnel) Créer **Produits** et **Prix** si tu vends des articles fixes. *(Dans BLA, le montant vient de la réservation → pas de produit fixe.)*
4. **Webhook** : Developers → Webhooks → **Add endpoint**
   - URL : `https://api.blalinker.com/api/v1/payments/webhook/stripe`
   - Événement : `checkout.session.completed`
   - Copier le **Signing secret** (`whsec_…`).
5. Récupérer les **clés API** (Developers → API keys).

### Variables Stripe
| Variable | Où la récupérer | Où la coller | Utilité |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | API keys (`sk_…`) | Render | Créer les paiements |
| `STRIPE_PUBLIC_KEY` | API keys (`pk_…`) | Render | Clé publique |
| `STRIPE_WEBHOOK_SECRET` | Webhook (`whsec_…`) | Render | Vérifier les webhooks |

### Passer du mode Test au mode Production
- ☐ Compte Stripe **activé** (identité/entreprise validées)
- ☐ Basculer le **toggle Test → Live** dans Stripe
- ☐ Récupérer les **clés Live** (`sk_live_…`, `pk_live_…`)
- ☐ Recréer le **webhook en mode Live** → nouveau `whsec_…`
- ☐ Remplacer les 3 variables dans Render → redéployer

> **CinetPay** (Mobile Money Afrique), si utilisé : variables `CINETPAY_API_KEY`, `CINETPAY_SITE_ID`, `CINETPAY_SECRET_KEY` (vérif HMAC du webhook), et les URLs `CINETPAY_NOTIFY_URL` / `CINETPAY_RETURN_URL`. À compléter avec les valeurs du tableau de bord CinetPay.

---

## 9. Variables d'environnement (récapitulatif complet)

### 🔐 Générer les secrets (Git Bash) — à faire à CHAQUE nouveau projet
```bash
# Paire de clés JWT (signe/vérifie les sessions)
openssl genrsa -out jwt_private.pem 2048
openssl rsa -in jwt_private.pem -pubout -out jwt_public.pem
# Vérifier qu'elles forment une paire (doit afficher MATCH) :
openssl rsa -in jwt_private.pem -pubout 2>/dev/null | diff - jwt_public.pem >/dev/null && echo MATCH || echo "PAS DE MATCH"
cat jwt_private.pem   # → JWT_PRIVATE_KEY (tout le contenu, multi-ligne)
cat jwt_public.pem    # → JWT_PUBLIC_KEY  (tout le contenu, multi-ligne)

# Clé de chiffrement (32 octets)
openssl rand -hex 32  # → ENCRYPTION_KEY
```
> ⚠️ **Erreur classique** : ne colle **PAS** la commande (`openssl …`) dans la variable — colle le **résultat** ! Et `JWT_PRIVATE_KEY` + `JWT_PUBLIC_KEY` doivent venir de la **même génération** (sinon déconnexion immédiate).

### Tableau des variables (toutes sur **Render**, sauf `VITE_*` sur **Vercel**)

| Variable | Description | Où la récupérer | Service | Exemple |
|---|---|---|---|---|
| `NODE_ENV` | Mode | — | Render | `production` |
| `PORT` | Port serveur | — | Render | `3000` |
| `APP_URL` | URL du **site public** (liens, retours paiement) | ton domaine | Render | `https://www.blalinker.com` |
| `CORS_ORIGIN` | Origines autorisées | tes domaines | Render | `https://www.blalinker.com,https://blalinker.com,https://admin.blalinker.com` |
| `DATABASE_URL` | Connexion PostgreSQL | Supabase (Session pooler) | Render | `postgresql://…pooler.supabase.com:5432/postgres?sslmode=require` |
| `REDIS_URL` | Connexion Redis | Upstash (Node) | Render | `rediss://default:TOKEN@xxx.upstash.io:6379` |
| `JWT_PRIVATE_KEY` | Signe les jetons | OpenSSL | Render | `-----BEGIN PRIVATE KEY-----…` |
| `JWT_PUBLIC_KEY` | Vérifie les jetons | OpenSSL | Render | `-----BEGIN PUBLIC KEY-----…` |
| `JWT_ACCESS_EXPIRY` | Durée jeton accès | — | Render | `15m` |
| `JWT_REFRESH_EXPIRY` | Durée jeton refresh | — | Render | `30d` |
| `ENCRYPTION_KEY` | Chiffrement données | OpenSSL | Render | `3a80…` (64 hex) |
| `ADMIN_EMAIL` | Compte admin créé au boot | toi | Render | `admin@exemple.com` *(un seul email)* |
| `ADMIN_PASSWORD` | Mot de passe admin | toi (fort) | Render | `••••••••` |
| `BREVO_API_KEY` | Envoi e-mails | Brevo → SMTP & API | Render | `xkeysib-…` |
| `BREVO_FROM_EMAIL` | Expéditeur | toi | Render | `noreply@blalinker.com` |
| `BREVO_FROM_NAME` | Nom expéditeur | toi | Render | `BLA Services` |
| `STRIPE_SECRET_KEY` | Paiement carte | Stripe | Render | `sk_test_…` / `sk_live_…` |
| `STRIPE_PUBLIC_KEY` | Clé publique | Stripe | Render | `pk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | Vérif webhook | Stripe webhook | Render | `whsec_…` |
| `CINETPAY_API_KEY` | Mobile Money | CinetPay | Render | *(à compléter)* |
| `CINETPAY_SITE_ID` | Identifiant site | CinetPay | Render | *(à compléter)* |
| `CINETPAY_SECRET_KEY` | Vérif HMAC webhook | CinetPay | Render | *(à compléter)* |
| `GOOGLE_CLIENT_ID` | Login Google | Google Cloud | Render | *(optionnel)* |
| `SENTRY_DSN` | Suivi d'erreurs | Sentry | Render | *(optionnel)* |
| `VITE_API_URL` | URL de l'API | ton domaine | **Vercel** | `https://api.blalinker.com/api/v1` |
| `VITE_GOOGLE_CLIENT_ID` | Login Google (front) | Google Cloud | **Vercel** | *(optionnel)* |

---

## 10. Déploiement final (procédure pas à pas)

1. **Vérifier Git** : `git status` (rien d'oublié, pas de secret commité).
2. **Push GitHub** : `git push origin main`.
3. **Render** : déploie le backend → logs « live » → `/health` = ok.
4. **Vercel** : déploie les 2 frontends → URLs `.vercel.app` OK.
5. **Supabase** : tables créées (Table editor) ; migrations « No pending ».
6. **Upstash** : « Redis connecté » dans les logs Render.
7. **Stripe** : webhook reçoit les événements (Stripe → Webhooks → Logs).
8. **DNS** : `api`, `www`, `@`, `admin` configurés chez OVH.
9. **SSL** : cadenas vert sur `www`, `admin`, `api`.
10. **Tests finaux** : inscription, réception OTP (e-mail), connexion, navigation, paiement test.

---

## 11. Dépannage (problèmes rencontrés → solutions)

| Problème | Cause probable | Solution |
|---|---|---|
| DNS non propagé | Trop tôt | Attendre (jusqu'à 24 h), vider le cache, tester en navigation privée |
| « Connexion pas privée » | Certificat SSL pas encore émis | Attendre que Vercel/Render affiche « Valid » |
| **Déconnexion juste après l'OTP** | **Clés JWT non appariées** sur Render | Régénérer la **paire** (`MATCH`) et recoller |
| Déconnexion après reload | On teste sur `*.vercel.app` (autre domaine) → cookie supprimé | Tester sur `www.<domaine>` (même domaine que `api.`) |
| `WRONGPASS` (logs Render) | `REDIS_URL` incorrect | Recopier l'URL exacte d'Upstash |
| Backend crash au boot | Variable manquante/invalide | `ADMIN_EMAIL` = 1 email valide, clés non vides, DB OK |
| Connexion DB échoue | Mauvais pooler / mot de passe à caractères spéciaux | Session pooler 5432 + mot de passe simple + `?sslmode=require` |
| « Erreur serveur » sur le site | API injoignable | Vérifier `api` (DNS), backend « live », `CORS_ORIGIN` |
| Pas de code OTP reçu | E-mail en spam / expéditeur non authentifié | Vérifier spam ; configurer **DKIM/SPF Brevo** dans OVH |
| Stripe webhook en erreur | Mauvais `whsec_` ou URL | Reprendre le Signing secret du bon mode (Test/Live) |
| Vercel : impossible d'importer le repo | App GitHub sans accès / téléphone | *Adjust GitHub App Permissions* ou **CLI** ; réutiliser le compte existant |
| Push GitHub refusé (403) | Identifiants d'un autre compte | `git-credential-manager erase` (host github.com) puis se reconnecter au bon compte ; ou mettre `https://USER@github.com/...` |

---

## 12. Checklist « Nouveau client »

- ☐ Acheter / récupérer le **domaine** (OVH)
- ☐ Créer les **comptes** nécessaires (ou réutiliser les tiens)
- ☐ Cloner le code + l'adapter (nom, domaine, branding)
- ☐ **Supabase** : projet + `DATABASE_URL`
- ☐ **Upstash** : base + `REDIS_URL`
- ☐ **Brevo** : clé API + expéditeur
- ☐ **Stripe** (+ CinetPay) : clés + webhook
- ☐ Générer **JWT (paire)** + `ENCRYPTION_KEY`
- ☐ **Render** : backend + toutes les variables
- ☐ **Vercel** : site + admin + `VITE_API_URL`
- ☐ **OVH** : DNS `api`/`www`/`@`/`admin`
- ☐ Tester le site, les paiements (test), les e-mails, le SSL
- ☐ Prévoir les **sauvegardes** (Supabase backups)

---

## 13. Checklist avant mise en production

- ☐ Toutes les variables renseignées (aucune valeur « exemple » / commande oubliée)
- ☐ DNS OK (`api`, `www`, `@`, `admin`)
- ☐ **SSL** actif partout (cadenas vert)
- ☐ **Stripe en mode Production** (clés `live` + webhook live)
- ☐ Base **Supabase** accessible + migrations à jour
- ☐ **Redis** fonctionne (« Redis connecté »)
- ☐ Logs Render **propres** (pas d'erreur)
- ☐ **Paiements** testés (carte + Mobile Money si applicable)
- ☐ **E-mails** reçus (OTP) → DKIM/SPF configurés
- ☐ Site **accessible** sur le domaine final
- ☐ **Redirections** OK (apex → www, etc.)
- ☐ **Sauvegardes** activées (Supabase)
- ☐ Secrets jamais commités ; aucun fichier `*.env` / notes dans Git
- ☐ Compte **admin** : mot de passe fort, unique

---

### Notes « à compléter » (selon le client)
- Enregistrements **DKIM/SPF Brevo** exacts (fournis par Brevo lors de l'authentification de l'expéditeur).
- Valeurs **CinetPay** (clé, site id, secret) selon le tableau de bord du client.
- **Google OAuth Client ID** si le login Google est activé.
- IP/cible **exactes** affichées par Vercel/Render (peuvent changer) → toujours recopier celles du tableau de bord, pas de mémoire.

---

*Fin du guide — conserve ce fichier à la racine de chaque projet et coche les étapes au fur et à mesure.*

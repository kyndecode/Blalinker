# Guide de contribution — BLA

## Démarrage rapide en local

### Prérequis
- Node.js 22 (version de la CI)
- PostgreSQL 15 ou plus récent, **local et jetable** (jamais la base de production)
- Redis 7
- Git

### 1. Cloner le projet
```bash
git clone https://github.com/kyndecode/Blalinker.git
cd Blalinker
```

### 2. Variables d'environnement
```bash
cp backend/.env.example backend/.env
# Remplir backend/.env (DATABASE_URL et REDIS_URL locaux)

cp frontend-web/.env.example frontend-web/.env
cp frontend-admin/.env.example frontend-admin/.env
```

### 3. Générer les clés JWT
```bash
# Sur Linux/Mac
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem

# Copier dans backend/.env (sur une ligne avec \n)
```

### 4. Générer la clé de chiffrement
```bash
openssl rand -hex 32
# Copier dans ENCRYPTION_KEY de backend/.env
```

### 5. Lancer en local
```bash
# API (base locale : migrations puis jeu de données de démonstration)
cd backend
npm ci
npx prisma migrate deploy
npm run db:seed
npm run dev

# Site public (autre terminal)
cd frontend-web
npm ci
npm run dev

# Administration (autre terminal)
cd frontend-admin
npm ci
npm run dev
```

Ne jamais lancer `prisma db push`, `prisma migrate dev` ni `prisma migrate reset` sur la base
de production (voir [MISE-EN-PRODUCTION.md](MISE-EN-PRODUCTION.md)).

### 6. Accès local
| Service | URL |
|---------|-----|
| Backend API     | http://localhost:3000 |
| Site public     | http://localhost:5173 |
| Administration  | http://localhost:5174 |

---

## Workflow Git

```
main         → Production (déploiement automatique Render + Vercel)
develop      → Intégration (contrôles CI uniquement)
feature/xxx  → Nouvelles fonctionnalités
fix/xxx      → Corrections de bugs
hotfix/xxx   → Correctifs urgents production
```

### Convention de commits (Conventional Commits)
```
feat:     Nouvelle fonctionnalité
fix:      Correction de bug
docs:     Documentation
style:    Formatage (pas de changement logique)
refactor: Refactoring sans changement fonctionnel
test:     Ajout/modification de tests
chore:    Maintenance (deps, config)
security: Correctif de sécurité
```

Exemples :
```
feat(auth): ajouter la vérification OTP par email
fix(payment): corriger le webhook Wave qui échoue en timeout
security(jwt): rotation automatique des refresh tokens
```

---

## Standards de code

- **TypeScript strict** : pas de `any` sauf exception justifiée
- **Tests** : toute nouvelle fonctionnalité doit avoir des tests
- **Couverture** : minimum 80% sur les modules critiques
- **Sécurité** : validation de toutes les entrées avec Zod
- **Accessibilité** : WCAG 2.1 AA sur tous les composants UI

---

## Secrets GitHub requis

| Secret | Description |
|--------|-------------|
| `JWT_PRIVATE_KEY_TEST` | Clé RSA privée pour les tests |
| `JWT_PUBLIC_KEY_TEST`  | Clé RSA publique pour les tests |
| `ENCRYPTION_KEY_TEST`  | Clé AES-256 pour les tests (64 hex) |
| `CODECOV_TOKEN`        | Token Codecov pour la couverture |

Le déploiement ne passe pas par GitHub : Render (API) et Vercel (site, administration)
compilent directement depuis la branche `main`.

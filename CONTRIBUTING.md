# Guide de contribution — BLA

## Démarrage rapide en local

### Prérequis
- Docker Desktop 4.x+
- Node.js 20+
- Git

### 1. Cloner le projet
```bash
git clone https://github.com/votre-org/bla.git
cd bla
```

### 2. Variables d'environnement
```bash
cp .env.example .env
# Remplir .env avec les valeurs

cp backend/.env.example backend/.env
# Remplir backend/.env
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

### 5. Lancer avec Docker
```bash
docker compose up -d
# Attendre que tous les services soient healthy

# Appliquer les migrations + seed
docker compose exec backend npx prisma migrate dev
docker compose exec backend npm run db:seed
```

### 6. Accès local
| Service | URL |
|---------|-----|
| Application | http://localhost |
| Backend API | http://localhost:3000 |
| Frontend    | http://localhost:5173 |
| Admin DB    | http://localhost:8080 (avec --profile tools) |

---

## Workflow Git

```
main         → Production (releases stables)
develop      → Staging (intégration continue)
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
| `STAGING_HOST`         | IP/domaine serveur staging |
| `STAGING_USER`         | Utilisateur SSH staging |
| `STAGING_SSH_KEY`      | Clé SSH privée staging |
| `PROD_HOST`            | IP/domaine serveur production |
| `PROD_USER`            | Utilisateur SSH production |
| `PROD_SSH_KEY`         | Clé SSH privée production |
| `SLACK_WEBHOOK`        | URL webhook Slack pour alertes |
| `CODECOV_TOKEN`        | Token Codecov pour la couverture |

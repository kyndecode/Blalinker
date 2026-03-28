# Déploiement, CI/CD & Monitoring — BLA

## 1. Infrastructure de déploiement

```
┌─────────────────────────────────────────────────────────────────┐
│                       PRODUCTION                                │
│                                                                 │
│  ┌─────────────────┐   ┌─────────────────┐                     │
│  │   Cloudflare    │   │   Cloudflare    │                     │
│  │   CDN/WAF       │   │   DNS           │                     │
│  └────────┬────────┘   └────────┬────────┘                     │
│           │                     │                               │
│  ┌────────▼─────────────────────▼────────┐                     │
│  │              Nginx (Load Balancer)    │                     │
│  │              + SSL Termination        │                     │
│  └────────┬─────────────┬───────────────┘                     │
│           │             │                                       │
│  ┌────────▼──────┐  ┌───▼────────────┐                        │
│  │ API Node.js   │  │ AI Service     │                        │
│  │ (2 instances) │  │ FastAPI Python │                        │
│  └────────┬──────┘  └────────────────┘                        │
│           │                                                     │
│  ┌────────▼──────┐  ┌────────────────┐  ┌────────────────┐   │
│  │ PostgreSQL    │  │ Redis Cluster  │  │ Cloudinary     │   │
│  │ (Primary +    │  │ (3 nodes)      │  │ (images/docs)  │   │
│  │  Read Replica)│  │                │  │                │   │
│  └───────────────┘  └────────────────┘  └────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Docker Compose (développement)

```yaml
# docker-compose.yml
version: '3.8'

services:
  db:
    image: postgis/postgis:15-3.4
    environment:
      POSTGRES_DB: bla_db
      POSTGRES_USER: bla_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bla_user -d bla_db"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  backend:
    build: ./backend
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    environment:
      DATABASE_URL: postgresql://bla_user:${DB_PASSWORD}@db:5432/bla_db
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
    ports:
      - "3000:3000"
    volumes:
      - ./backend/src:/app/src
    command: npm run dev

  ai-service:
    build: ./ai-service
    ports:
      - "8000:8000"
    volumes:
      - ./ai-service:/app
    command: uvicorn main:app --reload --host 0.0.0.0

  frontend-web:
    build: ./frontend-web
    ports:
      - "5173:5173"
    volumes:
      - ./frontend-web/src:/app/src
    environment:
      VITE_API_URL: http://localhost:3000

volumes:
  postgres_data:
  redis_data:
```

---

## 3. Pipeline CI/CD (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgis/postgis:15-3.4
        env:
          POSTGRES_DB: bla_test
          POSTGRES_USER: bla_user
          POSTGRES_PASSWORD: testpass
        ports:
          - 5432:5432
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - name: Install dependencies
        run: cd backend && npm ci

      - name: Run migrations
        run: cd backend && npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://bla_user:testpass@localhost:5432/bla_test

      - name: Run tests
        run: cd backend && npm test -- --coverage
        env:
          DATABASE_URL: postgresql://bla_user:testpass@localhost:5432/bla_test
          REDIS_URL: redis://localhost:6379
          JWT_PRIVATE_KEY: ${{ secrets.JWT_PRIVATE_KEY_TEST }}

      - name: Upload coverage
        uses: codecov/codecov-action@v4

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd frontend-web && npm ci
      - run: cd frontend-web && npm test -- --coverage
      - run: cd frontend-web && npm run build

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Audit npm dependencies
        run: |
          cd backend && npm audit --audit-level=high
          cd ../frontend-web && npm audit --audit-level=high
      - name: Semgrep security scan
        uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/nodejs
            p/jwt
            p/sql-injection
            p/xss

  deploy-staging:
    needs: [test-backend, test-frontend, security-scan]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    steps:
      - name: Deploy to staging
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ${{ secrets.STAGING_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            cd /app/bla
            git pull origin develop
            docker compose -f docker-compose.prod.yml up -d --build
            docker compose exec backend npx prisma migrate deploy

  deploy-production:
    needs: [test-backend, test-frontend, security-scan]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: production    # Requiert approbation manuelle
    steps:
      - name: Deploy to production
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            cd /app/bla
            git pull origin main
            docker compose -f docker-compose.prod.yml up -d --build --no-deps backend
            docker compose exec backend npx prisma migrate deploy
```

---

## 4. Monitoring & Observabilité

### 4.1 Sentry (erreurs applicatives)
```typescript
// src/config/sentry.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  profilesSampleRate: 0.1,
  integrations: [
    Sentry.prismaIntegration(),
    Sentry.expressIntegration()
  ],
  beforeSend(event) {
    // Ne pas envoyer d'infos personnelles
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
    }
    return event;
  }
});
```

### 4.2 Métriques Prometheus + Grafana
```typescript
// Métriques exposées à /metrics
const metrics = {
  httpRequestsTotal:    new Counter({ name: 'http_requests_total' }),
  httpRequestDuration:  new Histogram({ name: 'http_request_duration_seconds' }),
  activeWebSockets:     new Gauge({ name: 'active_websockets' }),
  activeBookings:       new Gauge({ name: 'active_bookings' }),
  paymentSuccessRate:   new Gauge({ name: 'payment_success_rate' }),
};
```

### 4.3 Alertes automatiques
| Condition | Seuil | Action |
|-----------|-------|--------|
| Taux d'erreur API | > 1% | Alerte Slack + Sentry |
| Latence P95 | > 1 seconde | Alerte Slack |
| CPU serveur | > 80% | Alerte + auto-scaling |
| Échecs paiements | > 5% | Alerte Slack + email |
| Espace disque DB | < 20% | Alerte email admin |

---

## 5. Backups

```bash
# Backup PostgreSQL quotidien (cron 2h00)
pg_dump $DATABASE_URL | gzip | \
  aws s3 cp - s3://bla-backups/postgres/$(date +%Y-%m-%d).sql.gz

# Rétention : 30 jours de backups quotidiens
# + snapshots hebdomadaires conservés 1 an
```

---

## 6. Checklist de mise en production

- [ ] Variables d'environnement configurées (toutes)
- [ ] Clés JWT RSA générées (2048 bits minimum)
- [ ] Migrations PostgreSQL appliquées
- [ ] Seeds des données de base (catégories)
- [ ] Webhooks Wave/Orange Money configurés
- [ ] Sentry DSN configuré
- [ ] Cloudflare WAF activé
- [ ] Certificat SSL valide (Let's Encrypt ou Cloudflare)
- [ ] Rate limiting Nginx configuré
- [ ] Backups automatiques testés
- [ ] Monitoring Grafana opérationnel
- [ ] Tests de charge validés (200 utilisateurs simultanés)
- [ ] Scan sécurité OWASP passé sans critique
- [ ] RGPD : page politique de confidentialité en ligne
- [ ] Admin super_admin créé

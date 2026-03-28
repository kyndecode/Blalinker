# Tests — BLA

## 1. Stratégie de tests (pyramide)

```
              ┌─────────────────────┐
              │   Tests E2E (10%)   │  Playwright / Detox
              │  Scénarios complets │
              └──────────┬──────────┘
           ┌─────────────┴──────────────┐
           │   Tests intégration (30%)  │  Supertest + Jest
           │   API endpoints complets   │
           └─────────────┬──────────────┘
      ┌────────────────────┴──────────────────┐
      │         Tests unitaires (60%)          │  Jest
      │  Fonctions, services, composants React │
      └────────────────────────────────────────┘
```

---

## 2. Tests unitaires (Jest)

### 2.1 Tests des utilitaires
```typescript
// tests/unit/otp.util.test.ts
import { generateOTP, hashOTP, verifyOTP } from '../../src/utils/otp.util';

describe('OTP Utilities', () => {
  it('génère un OTP à 6 chiffres', () => {
    const otp = generateOTP();
    expect(otp).toMatch(/^\d{6}$/);
  });

  it('deux OTPs générés sont différents', () => {
    const otp1 = generateOTP();
    const otp2 = generateOTP();
    expect(otp1).not.toBe(otp2);
  });

  it('hashOTP produit un hash différent du code', async () => {
    const otp = generateOTP();
    const hash = await hashOTP(otp);
    expect(hash).not.toBe(otp);
  });

  it('verifyOTP retourne true pour un code correct', async () => {
    const otp = '123456';
    const hash = await hashOTP(otp);
    const result = await verifyOTP(otp, hash);
    expect(result).toBe(true);
  });

  it('verifyOTP retourne false pour un code incorrect', async () => {
    const hash = await hashOTP('123456');
    const result = await verifyOTP('000000', hash);
    expect(result).toBe(false);
  });
});
```

### 2.2 Tests des services métier
```typescript
// tests/unit/commission.service.test.ts
import { calculateCommission } from '../../src/modules/payments/commission.service';

describe('Commission Calculator', () => {
  it('applique 5% pour un prestataire standard', () => {
    const result = calculateCommission(20000, { isPremium: false, isNew: false });
    expect(result.commission).toBe(1000);
    expect(result.netAmount).toBe(19000);
  });

  it('applique 3% pour un nouveau prestataire', () => {
    const result = calculateCommission(20000, { isPremium: false, isNew: true });
    expect(result.commission).toBe(600);
    expect(result.netAmount).toBe(19400);
  });

  it('applique le minimum de 500 XOF', () => {
    const result = calculateCommission(5000, { isPremium: false, isNew: false });
    expect(result.commission).toBe(500);
  });

  it('applique le maximum de 50 000 XOF', () => {
    const result = calculateCommission(2000000, { isPremium: false, isNew: false });
    expect(result.commission).toBe(50000);
  });
});
```

### 2.3 Tests des composants React
```tsx
// tests/unit/ProviderCard.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ProviderCard } from '../../src/components/provider/ProviderCard';

const mockProvider = {
  id: 'uuid-123',
  firstName: 'Moussa',
  lastName: 'Diop',
  ratingAverage: 4.8,
  ratingCount: 127,
  hourlyRate: 5000,
  distanceKm: 2.3,
  isAvailable: true,
  categories: ['Électricité']
};

describe('ProviderCard', () => {
  it('affiche le nom complet du prestataire', () => {
    render(<ProviderCard provider={mockProvider} onSelect={jest.fn()} />);
    expect(screen.getByText('Moussa Diop')).toBeInTheDocument();
  });

  it('affiche la note et le nombre d\'avis', () => {
    render(<ProviderCard provider={mockProvider} onSelect={jest.fn()} />);
    expect(screen.getByText('4.8')).toBeInTheDocument();
    expect(screen.getByText('127 avis')).toBeInTheDocument();
  });

  it('affiche "Disponible" quand is_available = true', () => {
    render(<ProviderCard provider={mockProvider} onSelect={jest.fn()} />);
    expect(screen.getByText('Disponible')).toBeInTheDocument();
  });

  it('appelle onSelect au clic', () => {
    const onSelect = jest.fn();
    render(<ProviderCard provider={mockProvider} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /contacter/i }));
    expect(onSelect).toHaveBeenCalledWith(mockProvider.id);
  });
});
```

---

## 3. Tests d'intégration (Supertest)

```typescript
// tests/integration/auth.test.ts
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { redis } from '../../src/config/redis';

describe('POST /api/v1/auth/register', () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { phone: '+221700000001' } });
    await redis.flushdb();
  });

  it('crée un compte avec un numéro de téléphone valide', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        phone: '+221700000001',
        password: 'TestPass123',
        role: 'client'
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toContain('OTP');

    // Vérifier que l'utilisateur est créé en base
    const user = await prisma.user.findUnique({
      where: { phone: '+221700000001' }
    });
    expect(user).not.toBeNull();
    expect(user!.status).toBe('pending');
  });

  it('rejette un numéro déjà utilisé (409)', async () => {
    // Créer d'abord le compte
    await request(app).post('/api/v1/auth/register').send({
      phone: '+221700000001',
      password: 'TestPass123',
      role: 'client'
    });

    // Deuxième tentative
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        phone: '+221700000001',
        password: 'TestPass123',
        role: 'client'
      });

    expect(res.status).toBe(409);
  });

  it('rejette un mot de passe trop court (422)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        phone: '+221700000002',
        password: '123',
        role: 'client'
      });

    expect(res.status).toBe(422);
    expect(res.body.errors).toBeDefined();
  });
});

describe('Flux complet de réservation', () => {
  let clientToken: string;
  let providerToken: string;
  let bookingId: string;

  beforeAll(async () => {
    // Créer et authentifier un client et un prestataire
    // (code de setup)
  });

  it('le client peut créer une réservation', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ providerId: 'uuid', serviceId: 'uuid', scheduledAt: new Date() });
    expect(res.status).toBe(201);
    bookingId = res.body.id;
  });

  it('le prestataire peut accepter la réservation', async () => {
    const res = await request(app)
      .put(`/api/v1/bookings/${bookingId}/accept`)
      .set('Authorization', `Bearer ${providerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('accepted');
  });
});
```

---

## 4. Tests de charge (k6)

```javascript
// tests/load/search.test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '1m', target: 50  },   // montée à 50 utilisateurs
    { duration: '3m', target: 200 },   // pic à 200 utilisateurs
    { duration: '1m', target: 0   },   // descente
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% des requêtes < 500ms
    errors: ['rate<0.01'],            // moins de 1% d'erreurs
  },
};

export default function () {
  const res = http.get('https://staging.bla-app.com/api/v1/providers/search', {
    headers: { 'Content-Type': 'application/json' },
    qs: {
      lat: 14.6937,   // Dakar
      lng: -17.4441,
      radius: 10,
      category_id: 'uuid-electricite'
    }
  });

  check(res, {
    'statut 200': (r) => r.status === 200,
    'moins de 500ms': (r) => r.timings.duration < 500,
    'contient des résultats': (r) => JSON.parse(r.body).data.length > 0,
  });

  errorRate.add(res.status !== 200);
  sleep(1);
}
```

---

## 5. Tests de sécurité automatisés

```bash
# scripts/security-test.sh

# 1. Scan OWASP ZAP (injection SQL, XSS, etc.)
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t https://staging.bla-app.com \
  -r security-report.html

# 2. Audit des dépendances npm
npm audit --audit-level=high

# 3. Scan de secrets dans le code
trufflehog git file://. --only-verified

# 4. Analyse statique de sécurité (Semgrep)
semgrep --config=p/nodejs --config=p/jwt --config=p/sql-injection ./backend/src
```

---

## 6. Couverture de tests cible

| Module | Couverture cible |
|--------|-----------------|
| Auth (inscription, connexion, MFA) | 95% |
| Paiements | 95% |
| Géolocalisation | 80% |
| Composants UI critiques | 80% |
| API endpoints | 90% |
| Services métier | 90% |
| **Global** | **≥ 85%** |

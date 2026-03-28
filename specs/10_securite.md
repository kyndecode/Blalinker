# Sécurité — BLA

## 1. Modèle de menaces

| Menace | Probabilité | Impact | Mitigation |
|--------|------------|--------|------------|
| Injection SQL | Haute | Critique | ORM Prisma (requêtes paramétrées) |
| XSS (Cross-Site Scripting) | Haute | Élevé | DOMPurify, CSP, Helmet.js |
| CSRF | Moyenne | Élevé | Tokens CSRF, SameSite cookies |
| Phishing / Arnaque | Haute | Élevé | Filtres contenu, séquestre paiements |
| Vol de compte | Haute | Élevé | MFA, détection IP anormale |
| Fuite de données | Faible | Critique | Chiffrement, accès minimum |
| Attaque DDoS | Moyenne | Élevé | Rate limiting, Cloudflare |
| Faux profils | Haute | Élevé | Vérification ID manuelle, scoring IA |
| Fraude paiement | Haute | Critique | Séquestre, validation OTP paiements élevés |
| Man-in-the-Middle | Faible | Critique | TLS 1.3, HSTS |

---

## 2. Sécurité HTTP (Helmet.js)

```typescript
// src/middlewares/security.middleware.ts
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';

export function applySecurityMiddlewares(app: Express) {
  // Headers sécurisés
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'nonce-{nonce}'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
        connectSrc: ["'self'", "https://api.wave.com", "wss://bla-app.com"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      }
    },
    hsts: {
      maxAge: 31536000,       // 1 an
      includeSubDomains: true,
      preload: true
    },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  }));

  // Rate limiting global
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 100,                   // 100 requêtes par IP
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: 'Trop de requêtes. Réessayez dans quelques minutes.'
      });
    }
  }));

  // Rate limiting strict pour l'auth
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,                    // 10 tentatives de connexion / 15min
    skipSuccessfulRequests: true
  });
  app.use('/api/v1/auth', authLimiter);

  // Sanitisation des entrées
  app.use(mongoSanitize());
}
```

---

## 3. Validation et sanitisation des entrées

```typescript
// Toutes les entrées sont validées avec Zod
import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';

// Schéma de validation inscription
export const registerSchema = z.object({
  phone: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, 'Format téléphone invalide')
    .optional(),
  email: z
    .string()
    .email('Email invalide')
    .max(255)
    .toLowerCase()
    .optional(),
  password: z
    .string()
    .min(8, 'Minimum 8 caractères')
    .max(128)
    .regex(/[A-Z]/, 'Doit contenir une majuscule')
    .regex(/[a-z]/, 'Doit contenir une minuscule')
    .regex(/[0-9]/, 'Doit contenir un chiffre'),
  role: z.enum(['client', 'provider']),
}).refine(data => data.phone || data.email, {
  message: 'Email ou téléphone requis'
});

// Sanitiser le HTML dans les champs texte libres
function sanitizeHtml(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],    // aucun HTML autorisé
    ALLOWED_ATTR: []
  });
}
```

---

## 4. Chiffrement des données sensibles

```typescript
// utils/encryption.util.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedData: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Champs chiffrés en base de données :
// - users.mfa_secret
// - profiles.id_card_url
// - profiles.date_of_birth
```

---

## 5. Protection RGPD

### 5.1 Droits des utilisateurs
| Droit | Implémentation |
|-------|---------------|
| Accès aux données | Endpoint `GET /users/me/data-export` → JSON complet |
| Rectification | `PUT /users/me` pour toutes les données |
| Suppression | `DELETE /users/me` → soft delete + anonymisation 30j |
| Portabilité | Export JSON/CSV téléchargeable |
| Opposition | Préférences de notification + opt-out marketing |

### 5.2 Consentements
```typescript
// Table des consentements
CREATE TABLE consents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  type        VARCHAR(50) CHECK (type IN (
                'terms_of_service',
                'privacy_policy',
                'marketing_emails',
                'sms_notifications',
                'gps_tracking',
                'data_sharing_partners'
              )),
  granted     BOOLEAN NOT NULL,
  version     VARCHAR(20),        -- version du document accepté
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);
```

### 5.3 Retention des données
| Donnée | Durée de conservation |
|--------|-----------------------|
| Compte actif | Indéfinie |
| Compte supprimé | 30 jours (anonymisation automatique) |
| Logs de connexion | 90 jours |
| Positions GPS | 30 jours |
| Transactions | 10 ans (obligation légale) |
| Pièces d'identité | Durée du compte + 1 an |

---

## 6. Sécurité des uploads de fichiers

```typescript
// Validation stricte des fichiers uploadés
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Type de fichier non autorisé'));
    }
    cb(null, true);
  }
});

// Scan antivirus avant stockage (optionnel selon budget)
async function scanFile(buffer: Buffer): Promise<boolean> {
  // Intégration ClamAV ou service cloud
  return true;
}

// Re-encoder l'image pour supprimer les métadonnées EXIF
async function processImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .withMetadata(false)  // Supprimer toutes les métadonnées
    .toBuffer();
}
```

---

## 7. Monitoring de sécurité

```typescript
// Alertes automatiques Sentry + alertes admin
const SECURITY_EVENTS = {
  SUSPICIOUS_LOGIN:     'Connexion depuis localisation inhabituelle',
  BRUTE_FORCE:          'Tentatives de connexion répétées',
  MASS_REPORT:          'Utilisateur signalé par plusieurs personnes',
  PAYMENT_ANOMALY:      'Paiement suspect (montant, fréquence)',
  API_ABUSE:            'Dépassement rate limit répété',
  XSS_ATTEMPT:          'Tentative XSS détectée',
};

// Toutes ces alertes sont :
// 1. Loggées dans audit_logs
// 2. Envoyées à Sentry
// 3. Notifiées à l'admin en temps réel (WebSocket)
// 4. Archivées pour audit
```

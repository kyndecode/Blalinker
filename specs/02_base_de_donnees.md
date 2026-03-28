# Schéma de base de données PostgreSQL — BLA

## 1. Conventions

- Toutes les tables ont `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `created_at` et `updated_at` sur toutes les tables
- Soft delete via `deleted_at TIMESTAMP NULL` (pas de suppression physique)
- Données sensibles chiffrées au niveau application (AES-256)

---

## 2. Schéma complet

### 2.1 Table `users`
```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           VARCHAR(20) UNIQUE,
  email           VARCHAR(255) UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  role            VARCHAR(20) NOT NULL CHECK (role IN ('client','provider','admin')),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','active','suspended','banned')),
  mfa_enabled     BOOLEAN DEFAULT true,
  mfa_secret      VARCHAR(255),               -- chiffré
  last_login_at   TIMESTAMP,
  login_attempts  INTEGER DEFAULT 0,
  locked_until    TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),
  deleted_at      TIMESTAMP
);

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role  ON users(role);
CREATE INDEX idx_users_status ON users(status);
```

### 2.2 Table `profiles`
```sql
CREATE TABLE profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  bio               TEXT,
  avatar_url        VARCHAR(500),
  id_card_url       VARCHAR(500),              -- pièce d'identité (chiffrée en stockage)
  id_verified       BOOLEAN DEFAULT false,
  id_verified_at    TIMESTAMP,
  id_verified_by    UUID REFERENCES users(id), -- admin qui a validé
  date_of_birth     DATE,
  city              VARCHAR(100),
  country           VARCHAR(100) DEFAULT 'SN',
  address           TEXT,
  latitude          DECIMAL(10, 8),
  longitude         DECIMAL(11, 8),
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_location ON profiles USING GIST (
  ST_MakePoint(longitude, latitude)
);
```

### 2.3 Table `provider_profiles`
```sql
CREATE TABLE provider_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_name     VARCHAR(200),
  years_experience  INTEGER DEFAULT 0,
  hourly_rate       DECIMAL(10,2),
  daily_rate        DECIMAL(10,2),
  currency          VARCHAR(10) DEFAULT 'XOF',
  radius_km         INTEGER DEFAULT 10,       -- rayon d'intervention
  is_available      BOOLEAN DEFAULT true,
  rating_average    DECIMAL(3,2) DEFAULT 0,
  rating_count      INTEGER DEFAULT 0,
  completed_jobs    INTEGER DEFAULT 0,
  bio_pro           TEXT,
  certifications    JSONB DEFAULT '[]',        -- liste de certifications
  languages         VARCHAR[] DEFAULT '{fr}',
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);
```

### 2.4 Table `categories`
```sql
CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  icon_url    VARCHAR(500),
  is_active   BOOLEAN DEFAULT true,
  sort_order  INTEGER DEFAULT 0,
  parent_id   UUID REFERENCES categories(id), -- sous-catégories
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- Données initiales
INSERT INTO categories (name, slug, icon_url) VALUES
  ('Plomberie', 'plomberie', '/icons/plomberie.svg'),
  ('Électricité', 'electricite', '/icons/electricite.svg'),
  ('Menuiserie', 'menuiserie', '/icons/menuiserie.svg'),
  ('Climatisation', 'climatisation', '/icons/clim.svg'),
  ('Peinture', 'peinture', '/icons/peinture.svg'),
  ('Jardinage', 'jardinage', '/icons/jardinage.svg'),
  ('Déménagement', 'demenagement', '/icons/demenagement.svg'),
  ('Sécurité / Alarme', 'securite', '/icons/securite.svg'),
  ('Informatique', 'informatique', '/icons/informatique.svg'),
  ('Nettoyage', 'nettoyage', '/icons/nettoyage.svg');
```

### 2.5 Table `provider_services`
```sql
CREATE TABLE provider_services (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  UUID NOT NULL REFERENCES users(id),
  category_id  UUID NOT NULL REFERENCES categories(id),
  title        VARCHAR(200) NOT NULL,
  description  TEXT,
  price_type   VARCHAR(20) CHECK (price_type IN ('fixed','hourly','quote')),
  price        DECIMAL(10,2),
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW(),
  UNIQUE(provider_id, category_id)
);
```

### 2.6 Table `bookings`
```sql
CREATE TABLE bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES users(id),
  provider_id     UUID NOT NULL REFERENCES users(id),
  service_id      UUID REFERENCES provider_services(id),
  status          VARCHAR(30) NOT NULL DEFAULT 'pending'
                  CHECK (status IN (
                    'pending','accepted','rejected','in_progress',
                    'completed','cancelled','disputed'
                  )),
  description     TEXT,
  scheduled_at    TIMESTAMP,
  started_at      TIMESTAMP,
  completed_at    TIMESTAMP,
  client_lat      DECIMAL(10,8),
  client_lng      DECIMAL(11,8),
  client_address  TEXT,
  amount          DECIMAL(10,2),
  currency        VARCHAR(10) DEFAULT 'XOF',
  commission_rate DECIMAL(5,2) DEFAULT 5.00,
  commission_amt  DECIMAL(10,2),
  notes           TEXT,
  cancellation_reason TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bookings_client   ON bookings(client_id);
CREATE INDEX idx_bookings_provider ON bookings(provider_id);
CREATE INDEX idx_bookings_status   ON bookings(status);
CREATE INDEX idx_bookings_date     ON bookings(scheduled_at);
```

### 2.7 Table `transactions`
```sql
CREATE TABLE transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       UUID NOT NULL REFERENCES bookings(id),
  payer_id         UUID NOT NULL REFERENCES users(id),
  payee_id         UUID NOT NULL REFERENCES users(id),
  amount           DECIMAL(10,2) NOT NULL,
  commission       DECIMAL(10,2) NOT NULL DEFAULT 0,
  net_amount       DECIMAL(10,2) NOT NULL,
  currency         VARCHAR(10) DEFAULT 'XOF',
  method           VARCHAR(30) CHECK (method IN (
                     'wave','orange_money','free_money',
                     'cash','bank_transfer'
                   )),
  status           VARCHAR(20) DEFAULT 'pending'
                   CHECK (status IN ('pending','processing','completed','failed','refunded')),
  external_ref     VARCHAR(255),    -- référence de la passerelle de paiement
  external_status  VARCHAR(100),
  metadata         JSONB DEFAULT '{}',
  paid_at          TIMESTAMP,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_transactions_booking  ON transactions(booking_id);
CREATE INDEX idx_transactions_payer    ON transactions(payer_id);
CREATE INDEX idx_transactions_status   ON transactions(status);
```

### 2.8 Table `reviews`
```sql
CREATE TABLE reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID NOT NULL REFERENCES bookings(id) UNIQUE,
  reviewer_id  UUID NOT NULL REFERENCES users(id),
  reviewed_id  UUID NOT NULL REFERENCES users(id),
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT,
  is_approved  BOOLEAN DEFAULT false,
  approved_by  UUID REFERENCES users(id),
  approved_at  TIMESTAMP,
  is_flagged   BOOLEAN DEFAULT false,
  flag_reason  TEXT,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_reviews_reviewed ON reviews(reviewed_id);
CREATE INDEX idx_reviews_approved ON reviews(is_approved);
```

### 2.9 Table `locations` (suivi GPS temps réel)
```sql
CREATE TABLE locations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  booking_id   UUID REFERENCES bookings(id),
  latitude     DECIMAL(10,8) NOT NULL,
  longitude    DECIMAL(11,8) NOT NULL,
  accuracy     DECIMAL(8,2),
  heading      DECIMAL(6,2),
  speed        DECIMAL(8,2),
  recorded_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_locations_user    ON locations(user_id);
CREATE INDEX idx_locations_booking ON locations(booking_id);
CREATE INDEX idx_locations_time    ON locations(recorded_at DESC);

-- Nettoyage automatique : conservation 30 jours max
CREATE OR REPLACE FUNCTION delete_old_locations() RETURNS void AS $$
  DELETE FROM locations WHERE recorded_at < NOW() - INTERVAL '30 days';
$$ LANGUAGE sql;
```

### 2.10 Table `notifications`
```sql
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  type       VARCHAR(50) NOT NULL,
  title      VARCHAR(200),
  body       TEXT,
  data       JSONB DEFAULT '{}',
  is_read    BOOLEAN DEFAULT false,
  read_at    TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notif_user   ON notifications(user_id);
CREATE INDEX idx_notif_unread ON notifications(user_id) WHERE is_read = false;
```

### 2.11 Table `reports` (signalements)
```sql
CREATE TABLE reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  UUID NOT NULL REFERENCES users(id),
  reported_id  UUID NOT NULL REFERENCES users(id),
  booking_id   UUID REFERENCES bookings(id),
  reason       VARCHAR(50) CHECK (reason IN (
                 'fraud','inappropriate','fake_profile',
                 'no_show','harassment','other'
               )),
  description  TEXT,
  status       VARCHAR(20) DEFAULT 'pending'
               CHECK (status IN ('pending','reviewed','resolved','dismissed')),
  resolved_by  UUID REFERENCES users(id),
  resolved_at  TIMESTAMP,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);
```

### 2.12 Table `otp_codes`
```sql
CREATE TABLE otp_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  phone       VARCHAR(20),
  email       VARCHAR(255),
  code        VARCHAR(10) NOT NULL,           -- stocké hashé
  purpose     VARCHAR(30) CHECK (purpose IN (
                'registration','login','password_reset','payment_confirm'
              )),
  expires_at  TIMESTAMP NOT NULL,
  used_at     TIMESTAMP,
  attempts    INTEGER DEFAULT 0,
  ip_address  INET,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_otp_phone   ON otp_codes(phone);
CREATE INDEX idx_otp_expires ON otp_codes(expires_at);
```

### 2.13 Table `audit_logs`
```sql
CREATE TABLE audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id),
  action     VARCHAR(100) NOT NULL,
  entity     VARCHAR(50),
  entity_id  UUID,
  old_data   JSONB,
  new_data   JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_user   ON audit_logs(user_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX idx_audit_time   ON audit_logs(created_at DESC);
```

---

## 3. Extensions PostgreSQL requises

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";       -- géolocalisation avancée
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- recherche textuelle floue
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- chiffrement natif
```

---

## 4. Requêtes critiques optimisées

### Recherche de prestataires par proximité
```sql
SELECT
  u.id,
  p.first_name,
  p.last_name,
  pp.rating_average,
  pp.hourly_rate,
  pp.is_available,
  ST_Distance(
    ST_MakePoint(p.longitude, p.latitude)::geography,
    ST_MakePoint(:lng, :lat)::geography
  ) / 1000 AS distance_km
FROM users u
JOIN profiles p ON p.user_id = u.id
JOIN provider_profiles pp ON pp.user_id = u.id
JOIN provider_services ps ON ps.provider_id = u.id
WHERE u.role = 'provider'
  AND u.status = 'active'
  AND p.id_verified = true
  AND pp.is_available = true
  AND ps.category_id = :category_id
  AND ST_DWithin(
    ST_MakePoint(p.longitude, p.latitude)::geography,
    ST_MakePoint(:lng, :lat)::geography,
    :radius_meters
  )
ORDER BY
  pp.rating_average DESC,
  distance_km ASC
LIMIT 20;
```

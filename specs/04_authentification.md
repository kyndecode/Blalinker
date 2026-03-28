# Authentification & Sécurité des accès — BLA

## 1. Flux d'inscription

```
Client                          API Backend                    Twilio SMS
  │                                 │                               │
  │──POST /auth/register ──────────>│                               │
  │  {phone, email, password,       │                               │
  │   role: 'client'|'provider'}    │                               │
  │                                 │── Valider les entrées         │
  │                                 │── Vérifier unicité            │
  │                                 │── Hasher mot de passe (bcrypt)│
  │                                 │── Créer user (status=pending) │
  │                                 │── Générer OTP 6 chiffres      │
  │                                 │── Stocker OTP hashé (Redis    │
  │                                 │   TTL: 10 min)                │
  │                                 │──────────────────────────────>│
  │                                 │  Envoyer SMS OTP              │
  │<──── 200 {message: "OTP envoyé"}│                               │
  │                                 │                               │
  │──POST /auth/verify-otp ────────>│                               │
  │  {phone, code: "123456"}        │                               │
  │                                 │── Vérifier OTP (Redis)        │
  │                                 │── Activer compte              │
  │                                 │── Générer JWT access+refresh  │
  │<──── 200 {accessToken,          │                               │
  │           refreshToken,         │                               │
  │           user}                 │                               │
```

---

## 2. Flux de connexion avec MFA

```
Client                          API Backend                    Twilio SMS
  │                                 │                               │
  │──POST /auth/login ─────────────>│                               │
  │  {email|phone, password}        │                               │
  │                                 │── Trouver l'utilisateur       │
  │                                 │── Vérifier si compte bloqué   │
  │                                 │── Comparer password (bcrypt)  │
  │                                 │── Si échec: incrémenter       │
  │                                 │   login_attempts              │
  │                                 │   (blocage après 5 échecs)    │
  │                                 │── Si succès + MFA activé:     │
  │                                 │   générer OTP MFA             │
  │                                 │──────────────────────────────>│
  │                                 │  Envoyer SMS OTP              │
  │<──── 200 {mfaRequired: true,    │                               │
  │           tempToken}            │                               │
  │                                 │                               │
  │──POST /auth/login/verify-mfa ──>│                               │
  │  {tempToken, otpCode}           │                               │
  │                                 │── Vérifier tempToken          │
  │                                 │── Vérifier OTP MFA            │
  │                                 │── Générer JWT final           │
  │<──── 200 {accessToken,          │                               │
  │           refreshToken, user}   │                               │
```

---

## 3. Gestion des tokens JWT

### 3.1 Structure des tokens
```json
// Access Token (durée: 15 minutes)
{
  "header": { "alg": "RS256", "typ": "JWT" },
  "payload": {
    "userId": "uuid",
    "role": "client|provider|admin",
    "sessionId": "uuid",
    "iat": 1711574400,
    "exp": 1711575300
  }
}

// Refresh Token (durée: 30 jours)
{
  "header": { "alg": "RS256", "typ": "JWT" },
  "payload": {
    "userId": "uuid",
    "tokenFamily": "uuid",   // détection réutilisation
    "iat": 1711574400,
    "exp": 1714166400
  }
}
```

### 3.2 Rotation des refresh tokens
- À chaque utilisation du refresh token, un nouveau est émis
- L'ancien est immédiatement révoqué dans Redis
- Si un token révoqué est réutilisé → révocation de **toute la famille** (détection de vol)

### 3.3 Révocation à la déconnexion
```typescript
async function logout(userId: string, accessToken: string, refreshToken: string) {
  const ttl = 15 * 60; // 15 minutes (durée résiduelle du access token)
  await redis.setex(`revoked:${accessToken}`, ttl, '1');
  await redis.del(`refresh:${userId}`);
}
```

---

## 4. Validation de la pièce d'identité

### 4.1 Processus
1. L'utilisateur upload une photo recto/verso de sa pièce d'identité
2. L'image est stockée chiffrée dans Cloudinary (dossier privé, accès signé)
3. L'URL d'accès temporaire est stockée dans `profiles.id_card_url`
4. Statut : `id_verified = false`, `status = 'pending'`
5. Notification à l'admin pour validation manuelle
6. L'admin consulte le document via l'interface admin (URL signée, expiration 1h)
7. L'admin valide ou rejette avec commentaire
8. Notification SMS + in-app à l'utilisateur

### 4.2 Règles de validation (guide pour l'admin)
- Vérifier que la photo correspond au profil
- Vérifier que la pièce n'est pas expirée
- Vérifier lisibilité des informations (nom, prénom, date de naissance)
- En cas de doute : demander une deuxième pièce ou un selfie avec la pièce

### 4.3 Stockage sécurisé des documents
```typescript
// Upload avec chiffrement Cloudinary
const result = await cloudinary.uploader.upload(filePath, {
  folder: 'id-documents',
  type: 'private',          // inaccessible sans signature
  access_mode: 'authenticated',
  resource_type: 'image',
  public_id: `id_${userId}_${Date.now()}`,
  transformation: [
    { quality: 'auto:low' }  // réduire la taille
  ]
});
```

---

## 5. Protection anti-phishing et anti-arnaque

### 5.1 Détection de comportements suspects
| Comportement | Déclencheur | Action |
|-------------|-------------|--------|
| 5 tentatives de connexion échouées | login_attempts >= 5 | Blocage 30 min + SMS alerte |
| Connexion depuis un nouveau pays | IP geolocation | Notification + re-vérification OTP |
| Changement d'email/téléphone | Modification profil | OTP requis sur l'ancien + le nouveau |
| Paiement > 100 000 XOF | Montant élevé | Confirmation OTP obligatoire |
| Demande de remboursement < 24h | Transaction récente | Délai forcé de 24h + validation admin |
| Multiples comptes même IP | Analyse IP | Alerte admin |
| Avis frauduleux | ML scoring | Mise en attente de modération |

### 5.2 Filtres anti-phishing dans les messages
```typescript
// Interdire les URLs dans les messages/descriptions
const PHISHING_PATTERNS = [
  /https?:\/\//i,                          // URLs
  /\bpaypal\b/i,                           // références à d'autres plateformes de paiement
  /\bwhatsapp\b.*\bpayer\b/i,              // invitation à payer via WhatsApp
  /\b(01|02|03|04|05|06|07|08|09)\d{7}\b/ // numéros suspects (hors Sénégal)
];

function sanitizeUserContent(text: string): { safe: boolean; reason?: string } {
  for (const pattern of PHISHING_PATTERNS) {
    if (pattern.test(text)) {
      return { safe: false, reason: 'Contenu suspect détecté' };
    }
  }
  return { safe: true };
}
```

### 5.3 Règles métier anti-arnaque
- Les paiements se font **exclusivement via la plateforme** (pas d'échange de coordonnées bancaires)
- Les coordonnées de contact ne sont partagées qu'**après acceptation de la réservation**
- Le paiement est **séquestre** : débloqué uniquement après validation client
- Système de **réputation** : les nouveaux prestataires ont un plafond de 50 000 XOF/mois
- **Vérification d'identité obligatoire** avant toute transaction

---

## 6. Politique de mots de passe

```typescript
const PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: false,   // optionnel pour accessibilité
  preventCommonPasswords: true, // liste des 10 000 mots de passe les plus communs
  preventPersonalInfo: true,    // ne pas contenir nom, email, téléphone
  bcryptRounds: 12
};
```

---

## 7. Sessions et appareils

- Chaque connexion crée une **session** avec: appareil, navigateur, IP, localisation
- L'utilisateur peut voir et révoquer ses sessions actives
- Limite : **5 sessions simultanées** par compte
- Alerte si connexion depuis un appareil/localisation inconnu(e)

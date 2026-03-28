# Frontend Mobile React Native — BLA

## 1. Structure du projet

```
mobile/
├── app/                          # Expo Router (file-based routing)
│   ├── (auth)/
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   ├── verify-otp.tsx
│   │   └── forgot-password.tsx
│   ├── (tabs)/
│   │   ├── index.tsx             # Accueil / Recherche
│   │   ├── bookings.tsx          # Mes réservations
│   │   ├── notifications.tsx
│   │   └── profile.tsx
│   ├── provider/
│   │   ├── [id].tsx              # Profil prestataire
│   │   └── tracking/[id].tsx     # Suivi GPS
│   ├── booking/
│   │   ├── new.tsx               # Créer une réservation
│   │   └── [id].tsx              # Détail réservation
│   └── payment/
│       ├── [id].tsx
│       └── success.tsx
├── components/
│   ├── common/
│   │   ├── Button.tsx
│   │   ├── TextInput.tsx
│   │   ├── BottomSheet.tsx       # @gorhom/bottom-sheet
│   │   ├── Toast.tsx
│   │   ├── RatingStars.tsx
│   │   └── Avatar.tsx
│   ├── maps/
│   │   ├── SearchMapView.tsx     # react-native-maps
│   │   └── TrackingMapView.tsx
│   └── provider/
│       └── ProviderCard.tsx
├── hooks/
│   ├── useAuth.ts
│   ├── useLocation.ts
│   ├── useSocket.ts
│   └── useOfflineQueue.ts
├── store/                        # Zustand
├── services/
│   └── api.ts                    # Axios + offline queue
├── utils/
│   ├── cache.ts                  # AsyncStorage
│   └── permissions.ts            # Permissions GPS/Notifications
└── app.json                      # Config Expo
```

---

## 2. Navigation

```
App
├── Stack
│   ├── (auth) — non authentifié
│   │   ├── /login
│   │   ├── /register
│   │   └── /verify-otp
│   └── (main) — authentifié
│       ├── Tabs (bottom navigation)
│       │   ├── 🏠 Accueil/Recherche
│       │   ├── 📋 Réservations
│       │   ├── 🔔 Notifications (badge)
│       │   └── 👤 Profil
│       ├── /provider/:id          (modal)
│       ├── /booking/new           (stack)
│       ├── /booking/:id
│       ├── /payment/:id
│       └── /tracking/:booking_id  (plein écran)
```

---

## 3. Flux utilisateur clé

### 3.1 Recherche et réservation (client)

```
Écran 1 : Recherche
┌─────────────────────────┐
│ 🔍 Rechercher            │
│ ┌───────────────────┐   │
│ │ Catégorie ▾       │   │
│ └───────────────────┘   │
│ ┌───────────────────┐   │
│ │ 📍 Ma position    │   │
│ └───────────────────┘   │
│ [──────────────────]    │
│  0km                50km│
│                         │
│ ─── Prestataires ───    │
│ ┌─────────────────────┐ │
│ │ 👤 Moussa Diop      │ │
│ │ ⭐ 4.8 (127 avis)   │ │
│ │ 🔧 Électricien      │ │
│ │ 📍 2.3 km           │ │
│ │ 💰 5 000 XOF/h      │ │
│ │           [Contacter]│ │
│ └─────────────────────┘ │
└─────────────────────────┘

Écran 2 : Profil prestataire
┌─────────────────────────┐
│ ← Moussa Diop           │
│                         │
│      [Photo]            │
│   ⭐⭐⭐⭐⭐ 4.8       │
│   Électricien certifié  │
│   Dakar · 2.3 km        │
│                         │
│ À propos                │
│ 10 ans d'expérience...  │
│                         │
│ Services                │
│ • Installation tableau  │
│ • Dépannage urgence     │
│                         │
│ Avis récents (127)      │
│ "Excellent travail" ⭐⭐⭐⭐⭐ │
│                         │
│ [   Réserver   ]        │
└─────────────────────────┘

Écran 3 : Création réservation
┌─────────────────────────┐
│ ← Réserver              │
│                         │
│ Service                 │
│ ○ Installation tableau  │
│ ● Dépannage urgence     │
│                         │
│ Date et heure           │
│ [Aujourd'hui ▾] [14:00▾]│
│                         │
│ Adresse d'intervention  │
│ [📍 Utiliser ma position]│
│ ─ ou ─                  │
│ [Saisir une adresse]    │
│                         │
│ Description du problème │
│ ┌─────────────────────┐ │
│ │ Décrivez...         │ │
│ └─────────────────────┘ │
│                         │
│ Estimation : ~15 000 XOF│
│                         │
│ [   Confirmer   ]       │
└─────────────────────────┘
```

### 3.2 Suivi GPS temps réel

```
Écran de suivi
┌─────────────────────────┐
│ Moussa est en route     │
│ ─────────────────────── │
│                         │
│  [  Carte dynamique   ] │
│  [  avec itinéraire   ] │
│  [  Client 📍 ←→ 🔧   ] │
│  [  Prestataire        ] │
│                         │
│ ─────────────────────── │
│ Arrivée estimée: 12 min │
│                         │
│ Statut: 🚗 En route     │
│                         │
│ ┌──────────────────────┐│
│ │ 💬 Envoyer un message││
│ └──────────────────────┘│
│ ┌──────────────────────┐│
│ │ 📞 Appeler Moussa    ││
│ └──────────────────────┘│
└─────────────────────────┘
```

---

## 4. Mode hors-ligne

```typescript
// hooks/useOfflineQueue.ts
interface QueuedAction {
  id: string;
  type: 'booking' | 'review' | 'location';
  payload: unknown;
  createdAt: number;
  retryCount: number;
}

export function useOfflineQueue() {
  const [queue, setQueue] = useAsyncStorage<QueuedAction[]>('offline_queue', []);

  // Ajouter une action à la file
  const enqueue = async (action: Omit<QueuedAction, 'id' | 'createdAt' | 'retryCount'>) => {
    const item: QueuedAction = {
      ...action,
      id: uuid(),
      createdAt: Date.now(),
      retryCount: 0
    };
    await setQueue(prev => [...prev, item]);
  };

  // Rejouer quand la connexion revient
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      if (state.isConnected && queue.length > 0) {
        await processQueue();
      }
    });
    return () => unsubscribe();
  }, [queue]);

  return { enqueue, queue };
}
```

---

## 5. Notifications push

```typescript
// Expo Notifications + FCM
async function registerForPushNotifications() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;

  const token = await Notifications.getExpoPushTokenAsync({
    projectId: process.env.EXPO_PROJECT_ID
  });

  // Enregistrer le token sur le serveur
  await api.put('/users/me/push-token', { token: token.data });
}

// Types de notifications
const NOTIFICATION_TYPES = {
  BOOKING_ACCEPTED:    '📋 Votre réservation a été acceptée',
  PROVIDER_EN_ROUTE:   '🚗 Votre prestataire est en route',
  PROVIDER_ARRIVED:    '✅ Votre prestataire est arrivé',
  PAYMENT_CONFIRMED:   '💰 Paiement confirmé',
  NEW_REVIEW:          '⭐ Vous avez reçu un avis',
  IDENTITY_VERIFIED:   '✅ Votre identité a été vérifiée',
  IDENTITY_REJECTED:   '❌ Vérification d\'identité échouée',
  REPORT_RESOLVED:     '🔍 Votre signalement a été traité',
};
```

---

## 6. Permissions requises

```json
// app.json — Expo permissions
{
  "expo": {
    "android": {
      "permissions": [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "RECEIVE_BOOT_COMPLETED",
        "VIBRATE"
      ]
    },
    "ios": {
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "BLA utilise votre position pour trouver des prestataires proches",
        "NSLocationAlwaysUsageDescription": "BLA utilise votre position en arrière-plan pour le suivi de mission",
        "NSCameraUsageDescription": "Prendre une photo de votre pièce d'identité",
        "NSPhotoLibraryUsageDescription": "Choisir une photo depuis votre galerie"
      }
    }
  }
}
```

---

## 7. Performance mobile

| Optimisation | Détail |
|-------------|--------|
| Lazy loading des écrans | `React.lazy` + `Suspense` |
| Images optimisées | `expo-image` avec cache disque |
| Listes performantes | `FlashList` (Shopify) au lieu de FlatList |
| Animations fluides | `react-native-reanimated` (thread UI) |
| Bundle splitting | Code splitting par routes |
| Hermes engine | Activé pour performances JS |
| Compression réseau | GZIP + images WebP |

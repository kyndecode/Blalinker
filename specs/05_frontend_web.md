# Frontend Web React — BLA

## 1. Structure du projet

```
frontend-web/
├── public/
│   ├── index.html
│   └── icons/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── router/
│   │   └── index.tsx              # React Router v6
│   ├── pages/
│   │   ├── Home/                  # Landing page publique
│   │   ├── Auth/
│   │   │   ├── Login.tsx
│   │   │   ├── Register.tsx
│   │   │   ├── VerifyOTP.tsx
│   │   │   └── ForgotPassword.tsx
│   │   ├── Dashboard/             # Dashboard client/prestataire
│   │   ├── Search/                # Recherche + carte
│   │   ├── ProviderProfile/       # Profil public prestataire
│   │   ├── Booking/               # Flux de réservation
│   │   ├── Payment/               # Paiement
│   │   ├── Profile/               # Mon profil
│   │   ├── Notifications/
│   │   └── Admin/                 # Dashboard admin
│   │       ├── AdminDashboard.tsx
│   │       ├── UserManagement.tsx
│   │       ├── ReviewModeration.tsx
│   │       ├── Transactions.tsx
│   │       └── Reports.tsx
│   ├── components/
│   │   ├── common/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Toast.tsx
│   │   │   ├── Skeleton.tsx
│   │   │   ├── RatingStars.tsx
│   │   │   └── Avatar.tsx
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Footer.tsx
│   │   ├── maps/
│   │   │   ├── SearchMap.tsx      # Leaflet.js
│   │   │   └── TrackingMap.tsx    # Suivi GPS temps réel
│   │   └── provider/
│   │       ├── ProviderCard.tsx
│   │       └── ProviderList.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useGeolocation.ts
│   │   ├── useSocket.ts
│   │   └── useOffline.ts
│   ├── store/
│   │   ├── authStore.ts           # Zustand
│   │   ├── bookingStore.ts
│   │   └── notifStore.ts
│   ├── services/
│   │   ├── api.ts                 # Axios instance + interceptors
│   │   ├── auth.service.ts
│   │   ├── providers.service.ts
│   │   ├── bookings.service.ts
│   │   └── payments.service.ts
│   ├── i18n/
│   │   ├── index.ts               # react-i18next config
│   │   ├── fr.json
│   │   └── wo.json                # Wolof
│   └── styles/
│       └── globals.css            # Tailwind base
├── tailwind.config.ts
├── vite.config.ts
└── package.json
```

---

## 2. Design System & Thème

### 2.1 Palette de couleurs
```typescript
// tailwind.config.ts
const colors = {
  primary: {
    50:  '#f0fdf4',
    100: '#dcfce7',
    500: '#22c55e',   // Vert principal (couleur BLA)
    600: '#16a34a',
    700: '#15803d',
  },
  secondary: {
    500: '#f97316',   // Orange (secondaire)
    600: '#ea580c',
  },
  neutral: {
    50:  '#fafafa',
    100: '#f5f5f5',
    200: '#e5e5e5',
    700: '#404040',
    900: '#171717',
  },
  danger:  { 500: '#ef4444' },
  warning: { 500: '#f59e0b' },
  info:    { 500: '#3b82f6' },
};
```

### 2.2 Typographie
- Police principale : **Inter** (Google Fonts) — lisibilité excellente
- Taille de base : 16px (rem)
- Contraste WCAG AA minimum sur tous les textes

### 2.3 Composants de base
```tsx
// Bouton accessible avec états
<Button
  variant="primary"   // primary | secondary | ghost | danger
  size="md"           // sm | md | lg
  loading={isLoading}
  disabled={disabled}
  leftIcon={<SearchIcon />}
>
  Rechercher
</Button>

// Input avec gestion d'erreur
<Input
  label="Numéro de téléphone"
  placeholder="+221 77 000 00 00"
  error={errors.phone?.message}
  helperText="Format : +221 suivi de 9 chiffres"
/>
```

---

## 3. Pages principales

### 3.1 Page d'accueil (publique)
- Hero section avec barre de recherche (catégorie + ville)
- Catégories populaires avec icônes (plomberie, électricité, etc.)
- Compteurs : nombre de prestataires, villes couvertes, avis
- Section "Comment ça marche" (3 étapes)
- Témoignages clients
- CTA inscription prestataire

### 3.2 Page de recherche
```tsx
// Structure de la page de recherche
<SearchPage>
  {/* Panneau filtres gauche */}
  <FilterPanel>
    <CategoryFilter />
    <RatingFilter min={0} max={5} />
    <PriceRangeFilter currency="XOF" />
    <DistanceFilter maxKm={50} />
    <AvailabilityToggle />
  </FilterPanel>

  {/* Résultats + carte */}
  <div className="flex-1 flex">
    {/* Liste */}
    <ProviderList providers={providers} loading={isLoading} />

    {/* Carte interactive Leaflet */}
    <SearchMap
      providers={providers}
      userLocation={userLocation}
      onProviderSelect={setSelectedProvider}
    />
  </div>
</SearchPage>
```

### 3.3 Dashboard admin
```
┌────────────────────────────────────────────────────────────────┐
│  BLA Admin                                    Admin@bla.com ▾  │
├──────────┬─────────────────────────────────────────────────────┤
│          │                                                      │
│ ▸ Vue    │  Statistiques globales                               │
│   d'ens. │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│          │  │ 12 450   │ │  8 231   │ │  3 102   │ │ 95.2%  │ │
│ ▸ Util.  │  │ Utilisat.│ │ Presta.  │ │ Réserv.  │ │ Satisf.│ │
│          │  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
│ ▸ Presta.│                                                      │
│          │  ┌──────────────────────────┐ ┌────────────────────┐│
│ ▸ Avis   │  │ Revenus ce mois          │ │ Signalements        ││
│          │  │ 4 250 000 XOF            │ │ 12 en attente       ││
│ ▸ Pmt.   │  │ ████████████░░ +12%      │ │ [Voir tout]         ││
│          │  └──────────────────────────┘ └────────────────────┘│
│ ▸ Sign.  │                                                      │
│          │  Vérifications en attente                            │
│ ▸ Catég. │  [Photo] Ali Diallo — Électricien — [Valider][❌]   │
│          │  [Photo] Fatou Ndiaye — Plombier  — [Valider][❌]   │
└──────────┴─────────────────────────────────────────────────────┘
```

---

## 4. Accessibilité (WCAG 2.1 AA)

- Ratio de contraste ≥ 4.5:1 pour le texte normal
- Navigation clavier complète (tabindex, focus visible)
- Attributs ARIA sur tous les composants interactifs
- Textes alternatifs sur toutes les images
- Annonces de changements d'état avec `aria-live`
- Support des lecteurs d'écran (NVDA, TalkBack)
- Taille de police ajustable sans perte de contenu
- Évitement des animations qui peuvent déclencher l'épilepsie

---

## 5. Internationalisation

```typescript
// Langues supportées
const SUPPORTED_LANGUAGES = [
  { code: 'fr', label: 'Français', flag: '🇸🇳' },
  { code: 'wo', label: 'Wolof', flag: '🇸🇳' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
];

// Usage
const { t } = useTranslation();
<h1>{t('search.title')}</h1>
// fr: "Trouver un prestataire"
// wo: "Seet ku liggéeykat"
```

---

## 6. Gestion des erreurs et états de chargement

```tsx
// Composant générique de gestion d'état
function AsyncContent<T>({
  query,
  children
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  if (query.isLoading) return <Skeleton />;
  if (query.isError)   return <ErrorBoundary error={query.error} />;
  if (!query.data)     return <EmptyState />;
  return <>{children(query.data)}</>;
}
```

---

## 7. Indicateurs de réseau

```tsx
// Bannière offline
function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div role="alert" className="bg-warning-500 text-white text-center py-2">
      Connexion perdue. Les données affichées peuvent ne pas être à jour.
    </div>
  );
}
```

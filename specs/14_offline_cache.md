# Mode hors-ligne & Gestion réseau — BLA

## 1. Contexte

Les marchés africains se caractérisent par :
- Connexions 2G/3G fréquentes avec latences élevées (200-500ms)
- Coupures réseau régulières
- Coût élevé des données mobiles
- Appareils avec peu de mémoire RAM

**Objectif** : L'application doit rester utilisable en mode dégradé et synchroniser les données à la reconnexion.

---

## 2. Stratégie de cache par couche

### 2.1 Frontend Mobile (AsyncStorage + MMKV)

```typescript
// utils/cache.ts
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  cachedAt: number;
}

export const cache = {
  // Stocker avec TTL
  set<T>(key: string, data: T, ttlSeconds: number): void {
    const entry: CacheEntry<T> = {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
      cachedAt: Date.now()
    };
    storage.set(key, JSON.stringify(entry));
  },

  // Lire (avec gestion expiration)
  get<T>(key: string): T | null {
    const raw = storage.getString(key);
    if (!raw) return null;

    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      storage.delete(key);
      return null;
    }
    return entry.data;
  },

  // Lire même si expiré (mode offline)
  getStale<T>(key: string): { data: T; isStale: boolean } | null {
    const raw = storage.getString(key);
    if (!raw) return null;

    const entry: CacheEntry<T> = JSON.parse(raw);
    return {
      data: entry.data,
      isStale: Date.now() > entry.expiresAt
    };
  },

  invalidate(pattern: string): void {
    storage.getAllKeys()
      .filter(k => k.startsWith(pattern))
      .forEach(k => storage.delete(k));
  }
};

// Durées de cache par ressource
export const CACHE_TTL = {
  PROVIDER_LIST:    5 * 60,      // 5 minutes
  PROVIDER_PROFILE: 15 * 60,     // 15 minutes
  CATEGORIES:       24 * 60 * 60, // 24 heures
  USER_PROFILE:     10 * 60,     // 10 minutes
  BOOKINGS:         2 * 60,      // 2 minutes
  NOTIFICATIONS:    1 * 60,      // 1 minute
};
```

### 2.2 Frontend Web (React Query + IndexedDB)

```typescript
// services/api.ts
import axios from 'axios';
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,     // données fraîches 5 min
      cacheTime: 30 * 60 * 1000,    // cache gardé 30 min
      retry: (failureCount, error) => {
        // Ne pas réessayer si offline
        if (!navigator.onLine) return false;
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) =>
        Math.min(1000 * 2 ** attemptIndex, 30000), // backoff exponentiel
    }
  }
});
```

---

## 3. Queue de requêtes hors-ligne

```typescript
// services/offlineQueue.ts
interface QueuedRequest {
  id: string;
  method: 'POST' | 'PUT' | 'DELETE';
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
  createdAt: number;
  retryCount: number;
  maxRetries: number;
}

class OfflineQueue {
  private readonly STORAGE_KEY = 'offline_queue';

  // Ajouter une requête à la file
  async push(request: Omit<QueuedRequest, 'id' | 'createdAt' | 'retryCount'>): Promise<string> {
    const entry: QueuedRequest = {
      ...request,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: request.maxRetries || 3
    };

    const queue = this.getQueue();
    queue.push(entry);
    this.saveQueue(queue);

    return entry.id;
  }

  // Traiter la file à la reconnexion
  async flush(): Promise<void> {
    const queue = this.getQueue();
    if (queue.length === 0) return;

    const results = await Promise.allSettled(
      queue.map(req => this.processRequest(req))
    );

    // Retirer les requêtes réussies, conserver les échouées
    const remaining = queue.filter((req, idx) => {
      const result = results[idx];
      if (result.status === 'fulfilled') return false;
      if (req.retryCount >= req.maxRetries) {
        console.warn(`Request ${req.id} abandonée après ${req.maxRetries} essais`);
        return false;
      }
      req.retryCount++;
      return true;
    });

    this.saveQueue(remaining);
  }

  private async processRequest(req: QueuedRequest): Promise<void> {
    await axios({
      method: req.method,
      url: req.url,
      data: req.data,
      headers: req.headers
    });
  }

  private getQueue(): QueuedRequest[] {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  private saveQueue(queue: QueuedRequest[]): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(queue));
  }
}

export const offlineQueue = new OfflineQueue();

// Déclencher le traitement à la reconnexion
window.addEventListener('online', () => offlineQueue.flush());
```

---

## 4. Indicateur de connectivité

```tsx
// hooks/useNetworkStatus.ts
import NetInfo from '@react-native-community/netinfo';

export function useNetworkStatus() {
  const [networkState, setNetworkState] = useState({
    isConnected: true,
    connectionType: 'unknown',
    isSlowConnection: false
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setNetworkState({
        isConnected: state.isConnected ?? false,
        connectionType: state.type,
        // 2G/EDGE = connexion lente
        isSlowConnection: ['2g', 'edge', 'gprs'].includes(
          (state.details as any)?.cellularGeneration
        )
      });
    });
    return () => unsubscribe();
  }, []);

  return networkState;
}
```

---

## 5. Optimisations réseau spécifiques Afrique

### 5.1 Compression maximale
```nginx
# nginx.conf
gzip on;
gzip_comp_level 6;
gzip_types text/plain application/json application/javascript text/css;
gzip_min_length 1000;
brotli on;
brotli_comp_level 6;
```

### 5.2 Pagination agressive
- Listes limitées à 10 éléments par page sur mobile (vs 20 sur web)
- Chargement à la demande ("Voir plus")
- Images chargées uniquement quand visibles (IntersectionObserver)

### 5.3 Images optimisées
```typescript
// Formats adaptés à la connexion
function getImageUrl(cloudinaryId: string, options: ImageOptions): string {
  const { isSlowConnection } = useNetworkStatus();

  const quality = isSlowConnection ? 40 : 80;
  const format = 'webp';

  return `https://res.cloudinary.com/bla/image/upload/q_${quality},f_${format}/${cloudinaryId}`;
}
```

### 5.4 Timeout adaptatif
```typescript
const axiosInstance = axios.create({
  baseURL: process.env.API_URL,
  timeout: networkState.isSlowConnection ? 15000 : 8000,
});
```

---

## 6. Données disponibles hors-ligne

| Données | Disponible offline | Mode |
|---------|--------------------|------|
| Liste des catégories | ✅ | Cache permanent |
| Villes principales | ✅ | Cache permanent |
| Profils favoris | ✅ | Cache 24h |
| Mes réservations | ✅ (lecture seule) | Cache 2h |
| Mes notifications | ✅ (lecture seule) | Cache 1h |
| Recherche de prestataires | ❌ | Requiert connexion |
| Paiements | ❌ | Requiert connexion |
| Suivi GPS | ❌ | Requiert connexion |

/**
 * Session côté navigateur : effacement local, synchronisation entre onglets, déconnexion
 * serveur en attente. Aucune dépendance au client API (évite un import circulaire).
 *
 * Données d'authentification du site, et rien d'autre :
 * - jeton d'accès : en mémoire (store) ;
 * - utilisateur : `localStorage['bla_auth']` (persistance du store) ;
 * - jeton de renouvellement : cookie HttpOnly posé par l'API (effacé par POST /auth/logout) ;
 * - données privées en cache : React Query (vidé ici).
 * La langue (`bla_lang`), le thème (`bla_theme`) et les annonces masquées sont conservés.
 */
import { useAuthStore } from '../store/authStore';
import { queryClient } from './queryClient';

export const AUTH_STORAGE_KEY = 'bla_auth';
const CHANNEL_NAME = 'bla-auth';

type AuthMessage = { type: 'logout' };

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (channel) return channel;
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    channel = null;
  }
  return channel;
}

/** Efface la session de cet onglet : état d'authentification et données privées en cache. */
export function clearLocalSession(): void {
  useAuthStore.getState().logout();
  queryClient.clear();
}

/** Termine la session localement et prévient les autres onglets du même navigateur. */
export function endLocalSession({ broadcast = true }: { broadcast?: boolean } = {}): void {
  clearLocalSession();
  if (broadcast) {
    try {
      getChannel()?.postMessage({ type: 'logout' } satisfies AuthMessage);
    } catch {
      // Diffusion impossible : les autres onglets se déconnecteront à leur prochaine requête.
    }
  }
}

/**
 * Écoute les déconnexions faites dans un autre onglet : canal de diffusion, et à défaut
 * l'événement `storage` sur la clé persistée (l'utilisateur y passe à null).
 * Retourne la fonction de désabonnement.
 */
export function subscribeAuthSync(onRemoteLogout: () => void): () => void {
  const ch = getChannel();
  const onMessage = (event: MessageEvent<AuthMessage>) => {
    if (event.data?.type === 'logout') onRemoteLogout();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== AUTH_STORAGE_KEY) return;
    if (!useAuthStore.getState().isAuthenticated && !useAuthStore.getState().user) return;
    try {
      const next = event.newValue ? (JSON.parse(event.newValue) as { state?: { user?: unknown } }) : null;
      if (!next?.state?.user) onRemoteLogout();
    } catch {
      onRemoteLogout();
    }
  };
  ch?.addEventListener('message', onMessage);
  window.addEventListener('storage', onStorage);
  return () => {
    ch?.removeEventListener('message', onMessage);
    window.removeEventListener('storage', onStorage);
  };
}

export { markLogoutPending, clearLogoutPending, isLogoutPending, LOGOUT_PENDING_KEY } from '../utils/logoutPending';

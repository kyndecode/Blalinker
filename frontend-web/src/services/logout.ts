import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { getActiveApiBaseUrl, WRITE_TIMEOUT_MS } from './api';
import { clearLogoutPending, endLocalSession, isLogoutPending, markLogoutPending } from './session';

/**
 * Prévient l'API : session de cet appareil fermée, jeton d'accès révoqué, cookie de
 * renouvellement effacé. Appel direct (sans l'intercepteur du client API) : un jeton
 * d'accès expiré ne doit pas déclencher un renouvellement, qui recréerait une session
 * au moment même où l'on se déconnecte.
 * Retourne true si le serveur a confirmé ; sinon la déconnexion reste « en attente ».
 */
export async function notifyServerLogout(accessToken: string | null): Promise<boolean> {
  markLogoutPending();
  try {
    await axios.post(`${getActiveApiBaseUrl()}/auth/logout`, {}, {
      withCredentials: true,
      timeout: WRITE_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Mode': 'cookie',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
    clearLogoutPending();
    return true;
  } catch (error) {
    // 4xx : le serveur a traité la demande (rien à fermer) → plus rien en attente.
    // Réseau coupé, serveur en réveil, 5xx : nouvel essai au prochain chargement du site.
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status && status >= 400 && status < 500) clearLogoutPending();
    return false;
  }
}

/**
 * Déconnexion demandée par l'utilisateur. L'interface est mise à jour IMMÉDIATEMENT
 * (avant : elle attendait la réponse du serveur, jusqu'à 30 s et plus pendant le réveil
 * de l'API, d'où l'impression que « Se déconnecter » ne fonctionnait pas) ; la fermeture
 * côté serveur suit, et sera renvoyée au prochain chargement si elle échoue.
 */
export function logout(): Promise<boolean> {
  const accessToken = useAuthStore.getState().accessToken;
  endLocalSession({ broadcast: true });
  return notifyServerLogout(accessToken);
}

/** Au chargement : termine côté serveur une déconnexion restée en attente. */
export async function flushPendingLogout(): Promise<void> {
  if (isLogoutPending()) await notifyServerLogout(null);
}

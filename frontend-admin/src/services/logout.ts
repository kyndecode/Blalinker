import axios from 'axios';
import { useAdminAuthStore } from '../store/adminAuthStore';
import { getActiveApiBaseUrl, WRITE_TIMEOUT_MS } from './api';

/**
 * Déconnexion de l'administration. Avant : seul le stockage du navigateur était vidé, la
 * session restait valable 30 jours côté serveur. Désormais : interface déconnectée tout de
 * suite, puis l'API ferme la session (jeton d'accès révoqué, jeton de renouvellement
 * inutilisable). Appel direct, sans l'intercepteur (pas de renouvellement pendant la sortie).
 */
export async function logoutAdmin(): Promise<boolean> {
  const { accessToken, refreshToken, logout } = useAdminAuthStore.getState();
  logout();
  if (!accessToken && !refreshToken) return true;
  try {
    await axios.post(
      `${getActiveApiBaseUrl()}/auth/logout`,
      refreshToken ? { refreshToken } : {},
      {
        timeout: WRITE_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Request': '1',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      },
    );
    return true;
  } catch {
    // Serveur injoignable : les jetons ne sont plus dans le navigateur ; la session expirera.
    return false;
  }
}

/**
 * Déconnexion non confirmée par le serveur (réseau coupé, API en réveil) : drapeau conservé
 * dans le navigateur pour renvoyer la demande au prochain chargement du site.
 * Effacé dès qu'une NOUVELLE connexion réussit : le renvoi ne doit jamais fermer la session
 * ouverte ensuite. Module sans dépendance (utilisable par le store comme par les services).
 */
export const LOGOUT_PENDING_KEY = 'bla_logout_pending';

export function markLogoutPending(): void {
  try { localStorage.setItem(LOGOUT_PENDING_KEY, '1'); } catch { /* stockage indisponible */ }
}

export function clearLogoutPending(): void {
  try { localStorage.removeItem(LOGOUT_PENDING_KEY); } catch { /* stockage indisponible */ }
}

export function isLogoutPending(): boolean {
  try { return localStorage.getItem(LOGOUT_PENDING_KEY) === '1'; } catch { return false; }
}

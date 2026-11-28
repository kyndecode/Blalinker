/**
 * Message affiché une fois sur la page de connexion après une fin de session imposée
 * (avant : retour à la connexion sans explication).
 */
export const ADMIN_NOTICE_KEY = 'bla_admin_notice';

export function setAdminSessionNotice(message: string): void {
  try { sessionStorage.setItem(ADMIN_NOTICE_KEY, message); } catch { /* stockage indisponible */ }
}

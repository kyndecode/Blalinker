/**
 * Message à usage unique affiché sur la page suivante (ex. « Vous êtes déconnecté. »).
 * Passe par sessionStorage : il survit à n'importe quelle redirection (garde d'une page
 * privée, rechargement), contrairement à l'état de navigation, qui peut être remplacé.
 */
const KEY = 'bla_flash_notice';

export function setFlashNotice(text: string): void {
  try { sessionStorage.setItem(KEY, text); } catch { /* stockage indisponible */ }
}

export function peekFlashNotice(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}

export function clearFlashNotice(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* stockage indisponible */ }
}

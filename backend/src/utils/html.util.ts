/**
 * Échappement HTML pour neutraliser les injections lorsqu'on insère
 * des données fournies par l'utilisateur dans des emails (HTML).
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
};

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"'/]/g, (char) => HTML_ESCAPE_MAP[char] ?? char);
}

/** Échappe le HTML puis convertit les sauts de ligne en <br/> (pour les messages multi-lignes). */
export function escapeHtmlMultiline(value: unknown): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br/>');
}

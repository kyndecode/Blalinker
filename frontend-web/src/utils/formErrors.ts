/**
 * Guidage après une erreur de formulaire, commun à tout le site :
 * - le premier champ en erreur reçoit le focus et défile à l'écran (sous l'en-tête fixe, grâce
 *   à scroll-padding-top), sans défilement inutile s'il est déjà visible ;
 * - une section repliée (<details>) qui le contient est d'abord ouverte ;
 * - les erreurs de validation renvoyées par le serveur s'affichent sous le champ concerné.
 */
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { classifyApiError } from './apiError';

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function focusFirstInvalid(root: ParentNode = document): boolean {
  const el = root.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!el) return false;
  const details = el.closest('details');
  if (details && !details.open) details.open = true;
  const rect = el.getBoundingClientRect();
  const visible = rect.top >= 80 && rect.bottom <= window.innerHeight;
  if (!visible && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }
  el.focus({ preventScroll: true });
  return true;
}

/** Même chose après l'affichage des messages (deux images plus tard). */
export function focusFirstInvalidSoon(root?: ParentNode): void {
  requestAnimationFrame(() => requestAnimationFrame(() => { focusFirstInvalid(root); }));
}

/**
 * Erreurs de validation du serveur (422) : chaque message est placé sous son champ (s'il existe
 * dans ce formulaire) et le premier champ reçoit le focus. Retourne le nombre de champs signalés :
 * 0 signifie qu'il faut afficher le message général.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  /** Champs du formulaire, ou correspondance « nom côté serveur → nom du champ » (ex. phone → phoneLocal). */
  fields: readonly string[] | Readonly<Record<string, string>>,
): number {
  const { fieldErrors } = classifyApiError(error);
  const fieldOf = (serverField: string): string | undefined => (Array.isArray(fields)
    ? (fields.includes(serverField) ? serverField : undefined)
    : (fields as Record<string, string>)[serverField]);
  let applied = 0;
  for (const [serverField, message] of Object.entries(fieldErrors)) {
    const field = fieldOf(serverField);
    if (!field) continue;
    setError(field as Path<T>, { type: 'server', message }, { shouldFocus: applied === 0 });
    applied += 1;
  }
  return applied;
}

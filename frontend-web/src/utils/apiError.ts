/**
 * Message compréhensible à partir d'une erreur de l'API :
 * - erreur de validation (422) : premier message de champ ;
 * - erreur métier : message du serveur ;
 * - réseau / délai : message générique.
 */
export function getApiErrorMessage(error: unknown, fallback = 'Une erreur est survenue. Réessayez.'): string {
  const e = error as {
    response?: { status?: number; data?: { error?: unknown; errors?: Array<{ message?: unknown }> } };
    code?: string;
  } | null;
  const data = e?.response?.data;
  const fieldMessage = Array.isArray(data?.errors) ? data?.errors.find((x) => typeof x?.message === 'string')?.message : undefined;
  if (typeof fieldMessage === 'string' && fieldMessage.trim()) return fieldMessage;
  if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  if (!e?.response) {
    return e?.code === 'ECONNABORTED'
      ? 'Le serveur met du temps à répondre. Réessayez dans un instant.'
      : 'Connexion impossible. Vérifiez votre réseau puis réessayez.';
  }
  if (e.response.status === 403) return "Vous n'avez pas accès à cette action.";
  if (e.response.status === 404) return 'Élément introuvable.';
  return fallback;
}

/** Code métier renvoyé par l'API (ex. « BOOKING_STATUS_CONFLICT »). */
export function getApiErrorCode(error: unknown): string | undefined {
  const code = (error as { response?: { data?: { code?: unknown } } } | null)?.response?.data?.code;
  return typeof code === 'string' ? code : undefined;
}

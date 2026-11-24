/**
 * Message lisible à partir d'une erreur de l'API :
 * validation (422) → premier message de champ ; erreur métier → message du serveur ;
 * 403 → permission manquante ; réseau → message générique.
 */
export function getApiErrorMessage(error: unknown, fallback = 'Une erreur est survenue. Réessayez.'): string {
  const e = error as {
    response?: { status?: number; data?: { error?: unknown; errors?: Array<{ message?: unknown }>; missing?: unknown } };
    code?: string;
  } | null;
  const data = e?.response?.data;
  const fieldMessage = Array.isArray(data?.errors) ? data?.errors.find((x) => typeof x?.message === 'string')?.message : undefined;
  if (typeof fieldMessage === 'string' && fieldMessage.trim()) return fieldMessage;
  if (e?.response?.status === 403) {
    const missing = Array.isArray(data?.missing) ? ` (${(data?.missing as string[]).join(', ')})` : '';
    return typeof data?.error === 'string' && data.error !== 'Permission insuffisante'
      ? data.error
      : `Permission insuffisante${missing}.`;
  }
  if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  if (!e?.response) {
    return e?.code === 'ECONNABORTED'
      ? 'Le serveur met du temps à répondre (réveil possible). Réessayez dans un instant.'
      : 'Connexion au serveur impossible. Vérifiez votre réseau.';
  }
  return fallback;
}

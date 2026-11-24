/** Premier message d'erreur de validation : format serveur { champ: [messages] } (ou tableau). */
function firstValidationMessage(errors: unknown): string | undefined {
  if (Array.isArray(errors)) {
    const m = errors.find((x) => typeof (x as { message?: unknown })?.message === 'string') as { message: string } | undefined;
    return m?.message;
  }
  if (errors && typeof errors === 'object') {
    for (const list of Object.values(errors as Record<string, unknown>)) {
      const first = Array.isArray(list) ? list.find((x) => typeof x === 'string') : typeof list === 'string' ? list : undefined;
      if (typeof first === 'string' && first.trim()) return first;
    }
  }
  return undefined;
}

/**
 * Message lisible à partir d'une erreur de l'API :
 * validation (422) → premier message de champ ; erreur métier → message du serveur ;
 * 403 → permission manquante ; réseau → message générique.
 */
export function getApiErrorMessage(error: unknown, fallback = 'Une erreur est survenue. Réessayez.'): string {
  const e = error as {
    response?: { status?: number; data?: { error?: unknown; errors?: unknown; missing?: unknown } };
    code?: string;
  } | null;
  const data = e?.response?.data;
  const fieldMessage = firstValidationMessage(data?.errors);
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

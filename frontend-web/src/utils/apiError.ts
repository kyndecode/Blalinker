/**
 * Erreurs de l'API : une seule interprétation pour tout le site.
 *
 * Chaque erreur est classée (validation, identifiants, session expirée, permission, introuvable,
 * conflit, trop de tentatives, service indisponible, erreur serveur, réseau, délai) et reçoit un
 * message compréhensible, dans la langue du site, sans détail technique. Les erreurs de
 * validation gardent le détail par champ, pour être affichées à côté du champ concerné.
 */
import i18next from 'i18next';

export type ApiErrorKind =
  | 'validation' | 'auth' | 'session_expired' | 'forbidden' | 'not_found' | 'conflict'
  | 'rate_limit' | 'unavailable' | 'server' | 'network' | 'timeout' | 'business';

export interface ClassifiedApiError {
  kind: ApiErrorKind;
  status?: number;
  code?: string;
  message: string;
  /** Messages par champ (format serveur { champ: [messages] }), premier message de chaque champ. */
  fieldErrors: Record<string, string>;
  /** Vrai si le message est générique (aucun message précis du serveur). */
  generic: boolean;
}

/** Texte traduit ; repli français si les traductions ne sont pas chargées. */
function tr(key: string, fallback: string): string {
  const value = i18next.isInitialized ? i18next.t(key) : '';
  return value && value !== key ? value : fallback;
}

function fieldErrorsOf(errors: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(errors)) {
    for (const item of errors as Array<{ path?: unknown; field?: unknown; message?: unknown }>) {
      const field = Array.isArray(item?.path) ? item.path.join('.') : typeof item?.field === 'string' ? item.field : 'root';
      if (typeof item?.message === 'string' && !out[field]) out[field] = item.message;
    }
  } else if (errors && typeof errors === 'object') {
    for (const [field, list] of Object.entries(errors as Record<string, unknown>)) {
      const first = Array.isArray(list) ? list.find((x) => typeof x === 'string') : typeof list === 'string' ? list : undefined;
      if (typeof first === 'string' && first.trim()) out[field] = first.trim();
    }
  }
  return out;
}

export function classifyApiError(error: unknown): ClassifiedApiError {
  const e = error as {
    response?: { status?: number; data?: { error?: unknown; errors?: unknown; code?: unknown } };
    code?: string;
    sessionExpired?: boolean;
  } | null;
  const status = e?.response?.status;
  const data = e?.response?.data ?? {};
  const code = typeof data.code === 'string' ? data.code : undefined;
  const serverMessage = typeof data.error === 'string' && data.error.trim() ? data.error.trim() : undefined;
  const fieldErrors = fieldErrorsOf(data.errors);
  const base = { status, code, fieldErrors };
  const own = (kind: ApiErrorKind, message: string | undefined, key: string, fallback: string): ClassifiedApiError =>
    ({ ...base, kind, message: message ?? tr(key, fallback), generic: !message });

  if (!e?.response) {
    return e?.code === 'ECONNABORTED' || e?.code === 'ETIMEDOUT'
      ? own('timeout', undefined, 'errors.timeout', 'Le serveur met du temps à répondre. Réessayez dans un instant.')
      : own('network', undefined, 'errors.network', 'Connexion impossible. Vérifiez votre réseau puis réessayez.');
  }
  if (e.sessionExpired) return own('session_expired', undefined, 'errors.session_expired', 'Votre session a expiré. Veuillez vous reconnecter.');
  if (status === 400 || status === 422) {
    const firstField = Object.values(fieldErrors)[0];
    return own('validation', firstField ?? (serverMessage !== 'Données invalides' ? serverMessage : undefined), 'errors.validation', 'Certaines informations sont incorrectes. Corrigez les champs signalés.');
  }
  if (status === 401) return own('auth', serverMessage, 'errors.unauthorized', 'Identifiants incorrects.');
  if (status === 403) {
    return own('forbidden', serverMessage && serverMessage !== 'Permission insuffisante' ? serverMessage : undefined, 'errors.forbidden', "Vous n'avez pas l'autorisation d'effectuer cette action.");
  }
  if (status === 404) return own('not_found', serverMessage, 'errors.not_found_item', "Cet élément n'existe pas ou a été supprimé.");
  if (status === 409) return own('conflict', serverMessage, 'errors.conflict', 'Les informations ont changé entre-temps. Rechargez la page puis réessayez.');
  if (status === 429) return own('rate_limit', serverMessage, 'errors.rate_limit', 'Trop de tentatives. Patientez quelques minutes avant de réessayer.');
  if (status === 502 || status === 503 || status === 504) {
    return own('unavailable', status === 503 ? serverMessage : undefined, 'errors.unavailable', 'Le service est momentanément indisponible. Réessayez dans quelques instants.');
  }
  // 500 : le message du serveur n'est jamais affiché (il peut être technique).
  if (status !== undefined && status >= 500) return own('server', undefined, 'errors.server', 'Erreur du serveur. Réessayez dans quelques instants.');
  return own('business', serverMessage, 'errors.generic', 'Une erreur inattendue est survenue. Réessayez.');
}

/**
 * Message compréhensible pour une erreur de l'API. `fallback` remplace un message générique
 * (ex. « La demande n'a pas pu être envoyée. ») quand le serveur n'a rien précisé.
 */
export function getApiErrorMessage(error: unknown, fallback?: string): string {
  const c = classifyApiError(error);
  return c.generic && fallback && (c.kind === 'server' || c.kind === 'business') ? fallback : c.message;
}

/** Code métier renvoyé par l'API (ex. « BOOKING_STATUS_CONFLICT »). */
export function getApiErrorCode(error: unknown): string | undefined {
  const code = (error as { response?: { data?: { code?: unknown } } } | null)?.response?.data?.code;
  return typeof code === 'string' ? code : undefined;
}

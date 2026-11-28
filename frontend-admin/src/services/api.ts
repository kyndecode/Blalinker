import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAdminAuthStore } from '../store/adminAuthStore';
import { setAdminSessionNotice } from './sessionNotice';

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _networkRetryCount?: number;
  _fallbackRetryCount?: number;
  _retry?: boolean;
};

let refreshPromise: Promise<string> | null = null;

const NETWORK_RETRY_LIMIT = 2;
const NETWORK_RETRY_BASE_DELAY_MS = 800;
const ONLINE_WAIT_TIMEOUT_MS = 15_000;

/** Délai des lectures (rejouées automatiquement en cas d'erreur transitoire). */
export const READ_TIMEOUT_MS = 15_000;
/**
 * Délai des écritures (jamais rejouées). Assez long pour couvrir le réveil
 * d'un service Render en offre gratuite (environ une minute) : abandonner
 * plus tôt ferait croire à un échec alors que le serveur traite la requête
 * (par exemple l'envoi d'un code OTP).
 */
export const WRITE_TIMEOUT_MS = 75_000;

const IDEMPOTENT_METHODS = new Set(['get', 'head', 'options']);

/** Seules les requêtes sans effet de bord peuvent être rejouées sans risque. */
/** Déconnexion uniquement si le serveur refuse la session (401/403), jamais sur une panne passagère. */
export function shouldLogoutAfterRefreshError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 401 || status === 403;
}

export function isIdempotentRequest(method: string | undefined): boolean {
  return IDEMPOTENT_METHODS.has((method ?? 'get').toLowerCase());
}

const AUTH_ENTRY_PATHS = [
  '/auth/login',
  '/auth/login/verify-mfa',
  '/auth/login/mfa/email',
  '/auth/refresh-token',
  '/auth/forgot-password',
  '/auth/reset-password',
];

/**
 * Requêtes d'ouverture de session : un 401 y signifie « identifiants ou code
 * invalides » et doit être affiché à l'utilisateur, pas déclencher une
 * déconnexion ni un rechargement de la page.
 */
export function isAuthEntryRequest(url: string | undefined): boolean {
  const path = (url ?? '').split('?')[0].replace(/\/+$/, '');
  return AUTH_ENTRY_PATHS.some((entry) => path === entry || path.endsWith(entry));
}

function normalizeApiBaseUrl(rawBaseUrl: string | undefined): string {
  if (!rawBaseUrl) return '/api/v1';

  const trimmed = rawBaseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return '/api/v1';
  if (trimmed.startsWith('/')) return trimmed;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  if (/\/api\/v\d+$/i.test(withProtocol)) return withProtocol;
  if (/\/api$/i.test(withProtocol)) return `${withProtocol}/v1`;

  return `${withProtocol}/api/v1`;
}

function getConfiguredApiBaseUrls(): string[] {
  const primary = normalizeApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);
  const rawFallbacks = (import.meta.env.VITE_API_FALLBACK_URLS as string | undefined) ?? '';

  const fallbackBases = rawFallbacks
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => normalizeApiBaseUrl(entry));

  return Array.from(new Set([primary, ...fallbackBases]));
}

const API_BASE_URLS = getConfiguredApiBaseUrls();
let activeBaseIndex = 0;

export function getActiveApiBaseUrl(): string {
  return API_BASE_URLS[activeBaseIndex] ?? API_BASE_URLS[0] ?? '/api/v1';
}

function hasFallbackBaseUrl(config: RetryableRequestConfig): boolean {
  const retries = config._fallbackRetryCount ?? 0;
  return retries < API_BASE_URLS.length - 1;
}

function switchToNextApiBaseUrl(config: RetryableRequestConfig): string {
  const nextIndex = Math.min(activeBaseIndex + 1, API_BASE_URLS.length - 1);
  activeBaseIndex = nextIndex;
  config._fallbackRetryCount = (config._fallbackRetryCount ?? 0) + 1;
  return getActiveApiBaseUrl();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOfflineNow(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

function waitForOnline(timeoutMs = ONLINE_WAIT_TIMEOUT_MS): Promise<void> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || navigator.onLine) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Network timeout while waiting for reconnection'));
    }, timeoutMs);

    const onOnline = () => {
      cleanup();
      resolve();
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener('online', onOnline);
    };

    window.addEventListener('online', onOnline, { once: true });
  });
}

function isTransientNetworkError(error: AxiosError): boolean {
  if (!error.response) return true;
  return error.response.status >= 500;
}

const api = axios.create({
  baseURL: getActiveApiBaseUrl(),
  timeout: READ_TIMEOUT_MS,
});

api.interceptors.request.use((config: RetryableRequestConfig) => {
  const token = useAdminAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Admin-Request'] = '1';
  config.baseURL = getActiveApiBaseUrl();
  if (!isIdempotentRequest(config.method) && config.timeout === READ_TIMEOUT_MS) {
    config.timeout = WRITE_TIMEOUT_MS;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const originalRequest = (error.config ?? {}) as RetryableRequestConfig;

    const requestUrl = originalRequest.url ?? '';

    // Échec de connexion, code MFA expiré, etc. : on laisse l'écran afficher
    // le message du serveur (auparavant : déconnexion + rechargement silencieux).
    if (isAuthEntryRequest(requestUrl)) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const { refreshToken, user, setTokens, logout } = useAdminAuthStore.getState();

      const forceLogout = () => {
        // Message expliquant le retour à la connexion (seulement si une session existait).
        if (user) setAdminSessionNotice('Votre session a expiré. Veuillez vous reconnecter.');
        logout();
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      };

      if (!refreshToken || !user) {
        forceLogout();
        return Promise.reject(error);
      }

      // Plusieurs requêtes expirées en même temps (ex. tableau de bord) : un seul
      // renouvellement, partagé ; les autres l'attendent au lieu de déconnecter.
      if (!refreshPromise) {
        refreshPromise = axios.post(
          `${getActiveApiBaseUrl()}/auth/refresh-token`,
          { refreshToken },
          { headers: { 'X-Admin-Request': '1' }, timeout: WRITE_TIMEOUT_MS },
        ).then(({ data }) => {
          if (!data?.accessToken || !data?.refreshToken) {
            throw Object.assign(new Error('Session expirée'), { response: { status: 401 } });
          }
          // Déconnexion pendant le renouvellement : la session n'est pas réinstallée et celle que ce
          // renouvellement vient d'ouvrir est fermée côté serveur (avant : retour connecté après
          // avoir cliqué sur « Déconnexion »).
          if (!useAdminAuthStore.getState().user) {
            void axios.post(`${getActiveApiBaseUrl()}/auth/logout`, { refreshToken: data.refreshToken }, {
              timeout: WRITE_TIMEOUT_MS,
              headers: { 'X-Admin-Request': '1', Authorization: `Bearer ${data.accessToken}` },
            }).catch(() => { /* fermeture au mieux */ });
            throw Object.assign(new Error('Session terminée'), { response: { status: 401 } });
          }
          setTokens(data.accessToken, data.refreshToken, user);
          return data.accessToken as string;
        }).finally(() => {
          refreshPromise = null;
        });
      }
      try {
        const accessToken = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        originalRequest.baseURL = getActiveApiBaseUrl();
        return api(originalRequest);
      } catch (refreshError) {
        // Session refusée (401/403) → déconnexion ; serveur en réveil ou réseau coupé → session conservée.
        if (shouldLogoutAfterRefreshError(refreshError)) forceLogout();
        return Promise.reject(refreshError);
      }
    }

    // Une écriture (POST/PUT/PATCH/DELETE) n'est jamais rejouée : le serveur a
    // pu la traiter (ex. connexion → un nouvel OTP par tentative, seul le
    // dernier code reçu restant valide).
    if (!isTransientNetworkError(error) || !isIdempotentRequest(originalRequest.method)) {
      return Promise.reject(error);
    }

    if (isOfflineNow()) {
      try {
        await waitForOnline();
      } catch {
        return Promise.reject(error);
      }
    }

    const networkRetryCount = originalRequest._networkRetryCount ?? 0;
    if (networkRetryCount < NETWORK_RETRY_LIMIT) {
      originalRequest._networkRetryCount = networkRetryCount + 1;
      await delay(NETWORK_RETRY_BASE_DELAY_MS * (networkRetryCount + 1));
      originalRequest.baseURL = getActiveApiBaseUrl();
      return api(originalRequest);
    }

    if (hasFallbackBaseUrl(originalRequest)) {
      const nextBaseUrl = switchToNextApiBaseUrl(originalRequest);
      originalRequest.baseURL = nextBaseUrl;
      originalRequest._networkRetryCount = 0;
      return api(originalRequest);
    }

    return Promise.reject(error);
  }
);

export default api;
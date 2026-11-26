import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { create } from 'zustand';
import { useAuthStore } from '../store/authStore';
import { endLocalSession } from './session';

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _networkRetryCount?: number;
  _fallbackRetryCount?: number;
  _slowTimer?: ReturnType<typeof setTimeout>;
  _slowFlagged?: boolean;
};

/**
 * Délais : le serveur (offre gratuite Render) peut mettre 30 à 60 s à se réveiller.
 * - Lectures : 15 s, rejouées jusqu'à 2 fois (sans effet de bord).
 * - Écritures (connexion, envoi de code, réservation…) : 75 s, JAMAIS rejouées
 *   automatiquement : une connexion rejouée créait plusieurs codes OTP d'affilée.
 */
export const READ_TIMEOUT_MS = 15_000;
export const WRITE_TIMEOUT_MS = 75_000;
/** Au-delà de ce délai, l'interface indique que le serveur démarre. */
export const SLOW_REQUEST_NOTICE_MS = 6_000;

const NETWORK_RETRY_LIMIT = 2;
const NETWORK_RETRY_BASE_DELAY_MS = 800;
const ONLINE_WAIT_TIMEOUT_MS = 15_000;

/** Requête sans effet de bord : peut être rejouée sans risque. */
export function isIdempotentRequest(method: string | undefined): boolean {
  return ['get', 'head', 'options'].includes((method ?? 'get').toLowerCase());
}

/**
 * Faut-il fermer la session après l'échec du renouvellement ? Seulement si le serveur
 * a REFUSÉ la session (401/403). Une panne réseau, un délai dépassé ou une erreur 5xx
 * (serveur en réveil) ne déconnectent pas : l'utilisateur garde sa session.
 */
export function shouldLogoutAfterRefreshError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 401 || status === 403;
}

/** Requêtes lentes en cours (affiche « le serveur démarre… »). */
export const useServerStatus = create<{ slowRequests: number; add: () => void; remove: () => void }>((set) => ({
  slowRequests: 0,
  add: () => set((s) => ({ slowRequests: s.slowRequests + 1 })),
  remove: () => set((s) => ({ slowRequests: Math.max(0, s.slowRequests - 1) })),
}));

function clearSlowTracking(config: RetryableRequestConfig | undefined) {
  if (!config) return;
  if (config._slowTimer) clearTimeout(config._slowTimer);
  config._slowTimer = undefined;
  if (config._slowFlagged) {
    config._slowFlagged = false;
    useServerStatus.getState().remove();
  }
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

export const api = axios.create({
  baseURL: getActiveApiBaseUrl(),
  timeout: READ_TIMEOUT_MS,
  withCredentials: true, // envoie/reçoit le cookie HttpOnly du refresh token
  headers: {
    'Content-Type': 'application/json',
    'X-Auth-Mode': 'cookie', // demande au serveur de gérer le refresh token via cookie
  },
});

api.interceptors.request.use((config: RetryableRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.baseURL = getActiveApiBaseUrl();
  if (!isIdempotentRequest(config.method) && config.timeout === READ_TIMEOUT_MS) {
    config.timeout = WRITE_TIMEOUT_MS;
  }
  clearSlowTracking(config);
  config._slowTimer = setTimeout(() => {
    config._slowFlagged = true;
    useServerStatus.getState().add();
  }, SLOW_REQUEST_NOTICE_MS);
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

function processQueue(error: Error | null, token: string | null) {
  failedQueue.forEach((pending) => {
    if (error) pending.reject(error);
    else pending.resolve(token);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => {
    clearSlowTracking(response.config as RetryableRequestConfig);
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = (error.config ?? {}) as RetryableRequestConfig;
    clearSlowTracking(originalRequest);
    const requestUrl = originalRequest.url ?? '';
    const isRefreshRequest = requestUrl.includes('/auth/refresh-token');

    // Compte suspendu ou banni pendant la session : fin de session immédiate (tous les onglets).
    const code = (error.response?.data as { code?: string } | undefined)?.code;
    if (error.response?.status === 403 && (code === 'ACCOUNT_SUSPENDED' || code === 'ACCOUNT_BANNED')) {
      if (useAuthStore.getState().isAuthenticated) endLocalSession();
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry && !isRefreshRequest) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          originalRequest.baseURL = getActiveApiBaseUrl();
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { setTokens } = useAuthStore.getState();

        // Le refresh token est dans un cookie HttpOnly : envoyé automatiquement
        // grâce à withCredentials, sans être accessible au JavaScript.
        const { data } = await axios.post(
          `${getActiveApiBaseUrl()}/auth/refresh-token`,
          {},
          { withCredentials: true, timeout: WRITE_TIMEOUT_MS, headers: { 'X-Auth-Mode': 'cookie' } }
        );

        if (!data?.accessToken) {
          endLocalSession();
          return Promise.reject(error);
        }

        setTokens(data.accessToken);
        processQueue(null, data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        originalRequest.baseURL = getActiveApiBaseUrl();
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as Error, null);
        // Session refusée par le serveur → déconnexion ; panne passagère → session conservée.
        if (shouldLogoutAfterRefreshError(refreshError)) endLocalSession();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Une écriture n'est jamais rejouée automatiquement (risque de doublon : codes, réservations…).
    if (!isTransientNetworkError(error) || isRefreshRequest || !isIdempotentRequest(originalRequest.method)) {
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

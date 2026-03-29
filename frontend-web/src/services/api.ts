import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/authStore';

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _networkRetryCount?: number;
  _fallbackRetryCount?: number;
};

const NETWORK_RETRY_LIMIT = 2;
const NETWORK_RETRY_BASE_DELAY_MS = 800;
const ONLINE_WAIT_TIMEOUT_MS = 15_000;

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

function getActiveApiBaseUrl(): string {
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
  timeout: 8_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: RetryableRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.baseURL = getActiveApiBaseUrl();
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
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = (error.config ?? {}) as RetryableRequestConfig;
    const requestUrl = originalRequest.url ?? '';
    const isRefreshRequest = requestUrl.includes('/auth/refresh-token');

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
        const { refreshToken, setTokens, logout } = useAuthStore.getState();
        if (!refreshToken) {
          logout();
          return Promise.reject(error);
        }

        const { data } = await axios.post(`${getActiveApiBaseUrl()}/auth/refresh-token`, {
          refreshToken,
        });

        setTokens(data.accessToken, data.refreshToken);
        processQueue(null, data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        originalRequest.baseURL = getActiveApiBaseUrl();
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as Error, null);
        useAuthStore.getState().logout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (!isTransientNetworkError(error) || isRefreshRequest) {
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
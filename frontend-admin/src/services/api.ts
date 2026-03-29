import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAdminAuthStore } from '../store/adminAuthStore';

type RetryableRequestConfig = InternalAxiosRequestConfig & {
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

const api = axios.create({
  baseURL: getActiveApiBaseUrl(),
  timeout: 15_000,
});

api.interceptors.request.use((config: RetryableRequestConfig) => {
  const token = useAdminAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Admin-Request'] = '1';
  config.baseURL = getActiveApiBaseUrl();
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const originalRequest = (error.config ?? {}) as RetryableRequestConfig;

    if (error.response?.status === 401) {
      useAdminAuthStore.getState().logout();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    if (!isTransientNetworkError(error)) {
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
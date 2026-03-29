import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _networkRetryCount?: number;
  _fallbackRetryCount?: number;
};

const NETWORK_RETRY_LIMIT = 2;
const NETWORK_RETRY_BASE_DELAY_MS = 800;

function normalizeApiBaseUrl(rawBaseUrl: string | undefined): string {
  if (!rawBaseUrl) return 'http://localhost:3000/api/v1';

  const trimmed = rawBaseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return 'http://localhost:3000/api/v1';
  if (trimmed.startsWith('/')) return trimmed;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  if (/\/api\/v\d+$/i.test(withProtocol)) return withProtocol;
  if (/\/api$/i.test(withProtocol)) return `${withProtocol}/v1`;

  return `${withProtocol}/api/v1`;
}

function getConfiguredApiBaseUrls(): string[] {
  const primary = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_URL);
  const rawFallbacks = process.env.EXPO_PUBLIC_API_FALLBACK_URLS ?? '';

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
  return API_BASE_URLS[activeBaseIndex] ?? API_BASE_URLS[0] ?? 'http://localhost:3000/api/v1';
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

function isTransientNetworkError(error: AxiosError): boolean {
  if (!error.response) return true;
  return error.response.status >= 500;
}

export const api = axios.create({
  baseURL: getActiveApiBaseUrl(),
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// Injecter le JWT
api.interceptors.request.use(async (config: RetryableRequestConfig) => {
  const token = await SecureStore.getItemAsync('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.baseURL = getActiveApiBaseUrl();
  return config;
});

// Refresh automatique
let isRefreshing = false;
api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = (error.config ?? {}) as RetryableRequestConfig;
    const requestUrl = original.url ?? '';
    const isRefreshRequest = requestUrl.includes('/auth/refresh-token');

    if (error.response?.status === 401 && !original._retry && !isRefreshRequest) {
      if (isRefreshing) return Promise.reject(error);
      original._retry = true;
      isRefreshing = true;
      try {
        const refreshToken = await SecureStore.getItemAsync('refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${getActiveApiBaseUrl()}/auth/refresh-token`, { refreshToken });
        await SecureStore.setItemAsync('access_token', data.accessToken);
        await SecureStore.setItemAsync('refresh_token', data.refreshToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        original.baseURL = getActiveApiBaseUrl();
        return api(original);
      } catch {
        await SecureStore.deleteItemAsync('access_token');
        await SecureStore.deleteItemAsync('refresh_token');
        router.replace('/(auth)/login');
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    if (!isTransientNetworkError(error) || isRefreshRequest) {
      return Promise.reject(error);
    }

    const networkRetryCount = original._networkRetryCount ?? 0;
    if (networkRetryCount < NETWORK_RETRY_LIMIT) {
      original._networkRetryCount = networkRetryCount + 1;
      await delay(NETWORK_RETRY_BASE_DELAY_MS * (networkRetryCount + 1));
      original.baseURL = getActiveApiBaseUrl();
      return api(original);
    }

    if (hasFallbackBaseUrl(original)) {
      const nextBaseUrl = switchToNextApiBaseUrl(original);
      original.baseURL = nextBaseUrl;
      original._networkRetryCount = 0;
      return api(original);
    }

    return Promise.reject(error);
  }
);

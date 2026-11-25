/**
 * Session de l'administration : la connexion ne doit plus « sauter ».
 * - plusieurs requêtes expirées en même temps → UN seul renouvellement, aucune déconnexion ;
 * - échec passager du renouvellement (réseau, serveur en réveil) → session conservée ;
 * - session refusée par le serveur (401) → déconnexion.
 */
import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api, { shouldLogoutAfterRefreshError } from '../services/api';
import { useAdminAuthStore } from '../store/adminAuthStore';

function http(status: number, config: InternalAxiosRequestConfig, data: unknown = {}) {
  const response = { data, status, statusText: String(status), headers: {}, config, request: {} };
  if (status < 400) return response;
  throw new AxiosError(`HTTP ${status}`, status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST, config, {}, response);
}

beforeEach(() => {
  useAdminAuthStore.getState().setTokens('expired', 'refresh-1', { id: 'a1', role: 'super_admin', email: 'admin@example.test' });
});
afterEach(() => {
  vi.restoreAllMocks();
  useAdminAuthStore.getState().logout();
});

describe('renouvellement de session (administration)', () => {
  it('décision de déconnexion : uniquement sur 401/403', () => {
    expect(shouldLogoutAfterRefreshError({ response: { status: 401 } })).toBe(true);
    expect(shouldLogoutAfterRefreshError({ response: { status: 403 } })).toBe(true);
    expect(shouldLogoutAfterRefreshError({ response: { status: 503 } })).toBe(false);
    expect(shouldLogoutAfterRefreshError(new Error('Network Error'))).toBe(false);
  });

  it('3 requêtes expirées simultanées : 1 seul renouvellement, toutes rejouées, pas de déconnexion', async () => {
    const adapter: AxiosAdapter = async (config) => (config.headers.Authorization === 'Bearer fresh' ? http(200, config, { ok: true }) : http(401, config));
    api.defaults.adapter = adapter;
    const refresh = vi.spyOn(axios, 'post').mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { data: { accessToken: 'fresh', refreshToken: 'refresh-2' } };
    });
    const results = await Promise.all([api.get('/admin/dashboard'), api.get('/admin/users'), api.get('/admin/reports')]);
    expect(results.every((r) => r.data.ok)).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(useAdminAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAdminAuthStore.getState().accessToken).toBe('fresh');
  });

  it('serveur injoignable pendant le renouvellement : session conservée', async () => {
    api.defaults.adapter = async (config) => http(401, config);
    vi.spyOn(axios, 'post').mockRejectedValue(new AxiosError('timeout', 'ECONNABORTED'));
    await expect(api.get('/admin/dashboard')).rejects.toBeTruthy();
    expect(useAdminAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('session refusée par le serveur : déconnexion', async () => {
    api.defaults.adapter = async (config) => http(401, config);
    vi.spyOn(axios, 'post').mockRejectedValue(Object.assign(new AxiosError('HTTP 401'), { response: { status: 401 } }));
    await expect(api.get('/admin/dashboard')).rejects.toBeTruthy();
    expect(useAdminAuthStore.getState().isAuthenticated).toBe(false);
  });
});

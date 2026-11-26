/**
 * Client API du site public — causes des codes OTP en rafale et des déconnexions :
 * - une écriture (connexion, envoi de code) n'est JAMAIS rejouée automatiquement ;
 * - une lecture l'est (serveur en réveil) ;
 * - un échec passager du renouvellement de session ne déconnecte pas.
 */
import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api, { READ_TIMEOUT_MS, WRITE_TIMEOUT_MS, isIdempotentRequest, shouldLogoutAfterRefreshError } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

function server(status: number) {
  const calls: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    calls.push(config);
    const response = { data: {}, status, statusText: String(status), headers: {}, config, request: {} };
    if (status < 400) return response;
    throw new AxiosError(`HTTP ${status}`, status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST, config, {}, response);
  };
  api.defaults.adapter = adapter;
  return calls;
}

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  useAuthStore.getState().logout();
});

describe('client API du site', () => {
  it('décisions', () => {
    expect(isIdempotentRequest('get')).toBe(true);
    expect(isIdempotentRequest('post')).toBe(false);
    expect(shouldLogoutAfterRefreshError({ response: { status: 401 } })).toBe(true);
    expect(shouldLogoutAfterRefreshError({ response: { status: 502 } })).toBe(false);
    expect(shouldLogoutAfterRefreshError(new Error('Network Error'))).toBe(false);
  });

  it('connexion en erreur 5xx : UNE seule requête (plus de 3 codes OTP par clic), délai long', async () => {
    const calls = server(503);
    await expect(api.post('/auth/login', { email: 'x@example.test', password: 'x' })).rejects.toBeTruthy();
    expect(calls).toHaveLength(1);
    expect(calls[0].timeout).toBe(WRITE_TIMEOUT_MS);
  });

  it('lecture en erreur 5xx : rejouée (serveur en réveil), délai court', async () => {
    const calls = server(503);
    await expect(api.get('/categories')).rejects.toBeTruthy();
    expect(calls).toHaveLength(3);
    expect(calls[0].timeout).toBe(READ_TIMEOUT_MS);
  });

  it('renouvellement impossible (serveur en réveil) : la session est conservée', async () => {
    useAuthStore.setState({ accessToken: 'expired', isAuthenticated: true, user: { id: 'u1', role: 'client' } } as never);
    server(401);
    vi.spyOn(axios, 'post').mockRejectedValue(new AxiosError('timeout', 'ECONNABORTED'));
    await expect(api.get('/users/me')).rejects.toBeTruthy();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('session refusée (401 au renouvellement) : déconnexion', async () => {
    useAuthStore.setState({ accessToken: 'expired', isAuthenticated: true, user: { id: 'u1', role: 'client' } } as never);
    server(401);
    vi.spyOn(axios, 'post').mockRejectedValue(Object.assign(new AxiosError('HTTP 401'), { response: { status: 401 } }));
    await expect(api.get('/users/me')).rejects.toBeTruthy();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

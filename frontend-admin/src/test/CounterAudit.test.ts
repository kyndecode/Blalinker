/**
 * Contre-audit indépendant (28/11/2026), cycle 2 : déconnexion pendant un renouvellement de
 * session. Avant : le renouvellement arrivé après « Déconnexion » réinstallait la session.
 */
import axios, { AxiosError, type AxiosAdapter } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import api from '../services/api';
import { useAdminAuthStore } from '../store/adminAuthStore';

afterEach(() => {
  vi.restoreAllMocks();
  useAdminAuthStore.getState().logout();
});

describe('administration : déconnexion pendant un renouvellement', () => {
  it('la session n’est pas réinstallée et la nouvelle session est fermée côté serveur', async () => {
    useAdminAuthStore.getState().setTokens('acces-expire', 'renouvellement-1', { id: 'a1', role: 'super_admin', email: 'admin@example.test' });
    // Toute requête protégée répond 401 : déclenche le renouvellement.
    const adapter: AxiosAdapter = async (config) => {
      const response = { data: {}, status: 401, statusText: '401', headers: {}, config, request: {} };
      throw new AxiosError('HTTP 401', AxiosError.ERR_BAD_REQUEST, config, {}, response);
    };
    api.defaults.adapter = adapter;
    let answer!: (v: unknown) => void;
    const post = vi.spyOn(axios, 'post').mockImplementation((url: string) => (url.endsWith('/auth/refresh-token')
      ? new Promise((resolve) => { answer = resolve; })
      : Promise.resolve({ data: {} })) as never);
    const request = api.get('/admin/users').catch((e) => e);
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    useAdminAuthStore.getState().logout(); // clic sur « Déconnexion » pendant le renouvellement
    // Mode cookie : le nouveau jeton de renouvellement est dans le cookie HttpOnly, pas dans la réponse.
    answer({ data: { accessToken: 'acces-tardif' } });
    await request;
    expect(useAdminAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAdminAuthStore.getState().refreshToken).toBeNull();
    // Fermeture côté serveur : jeton d'accès tardif + cookie (lu par l'API), aucun jeton dans le corps.
    expect(post).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/logout$/),
      {},
      expect.objectContaining({
        withCredentials: true,
        headers: expect.objectContaining({ Authorization: 'Bearer acces-tardif', 'X-Auth-Mode': 'cookie', 'X-Admin-Request': '1' }),
      }),
    );
  });
});

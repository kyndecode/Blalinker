/**
 * Déconnexion de l'administration (26/11/2026) : la session est fermée côté serveur
 * (avant : seul le stockage du navigateur était vidé, la session restait valable 30 jours).
 */
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdminAuthStore } from '../store/adminAuthStore';
import { logoutAdmin } from '../services/logout';

beforeEach(() => {
  useAdminAuthStore.getState().setTokens('access-admin', 'refresh-admin', { id: 'a1', role: 'super_admin', email: 'admin@example.test' });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('logoutAdmin()', () => {
  it('vide la session du navigateur puis ferme la session côté serveur (jeton d’accès + jeton de renouvellement)', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} });
    const done = logoutAdmin();
    expect(useAdminAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAdminAuthStore.getState().refreshToken).toBeNull();
    await expect(done).resolves.toBe(true);
    const [url, body, config] = post.mock.calls[0];
    expect(String(url)).toMatch(/\/auth\/logout$/);
    expect(body).toEqual({ refreshToken: 'refresh-admin' });
    expect(config).toMatchObject({ headers: expect.objectContaining({ Authorization: 'Bearer access-admin', 'X-Admin-Request': '1' }) });
  });

  it('serveur injoignable : la déconnexion locale reste effective', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('Network Error'));
    await expect(logoutAdmin()).resolves.toBe(false);
    expect(useAdminAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('déjà déconnecté : aucun appel', async () => {
    useAdminAuthStore.getState().logout();
    const post = vi.spyOn(axios, 'post');
    await logoutAdmin();
    expect(post).not.toHaveBeenCalled();
  });
});

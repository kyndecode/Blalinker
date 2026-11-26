/**
 * Déconnexion du site public (non-régression du 26/11/2026).
 * Causes corrigées : interface mise à jour seulement après la réponse du serveur (jusqu'à
 * 30 s pendant le réveil de l'API), déconnexion refusée par l'API avec un jeton d'accès
 * expiré (session et cookie laissés ouverts), aucune synchronisation entre onglets.
 */
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../store/authStore';
import { queryClient } from '../../services/queryClient';
import { logout, flushPendingLogout } from '../../services/logout';
import { subscribeAuthSync, endLocalSession, isLogoutPending, LOGOUT_PENDING_KEY, AUTH_STORAGE_KEY } from '../../services/session';

function signIn() {
  useAuthStore.getState().setTokens('access-123');
  useAuthStore.getState().setUser({ id: 'u1', role: 'client', email: 'awa@example.test' });
  queryClient.setQueryData(['session-me'], { firstName: 'Awa' });
  queryClient.setQueryData(['bookings'], [{ id: 'b1' }]);
}

beforeEach(() => {
  localStorage.clear();
  useAuthStore.getState().logout();
  queryClient.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logout()', () => {
  it('efface la session locale immédiatement, avant même la réponse du serveur', async () => {
    signIn();
    let release!: () => void;
    vi.spyOn(axios, 'post').mockImplementation(() => new Promise((resolve) => { release = () => resolve({ data: {} }); }));
    const pending = logout();
    // Serveur pas encore répondu : l'interface est déjà déconnectée, le cache privé vidé.
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(queryClient.getQueryData(['session-me'])).toBeUndefined();
    expect(queryClient.getQueryData(['bookings'])).toBeUndefined();
    expect(isLogoutPending()).toBe(true);
    release();
    await expect(pending).resolves.toBe(true);
    expect(isLogoutPending()).toBe(false);
  });

  it('appelle l’API directement : cookie + en-tête X-Auth-Mode + jeton d’accès, sans renouvellement préalable', async () => {
    signIn();
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} });
    await logout();
    expect(post).toHaveBeenCalledTimes(1);
    const [url, , config] = post.mock.calls[0];
    expect(String(url)).toMatch(/\/auth\/logout$/);
    expect(config).toMatchObject({
      withCredentials: true,
      headers: expect.objectContaining({ 'X-Auth-Mode': 'cookie', Authorization: 'Bearer access-123' }),
    });
  });

  it('serveur injoignable : déconnexion conservée « en attente », renvoyée au prochain chargement', async () => {
    signIn();
    vi.spyOn(axios, 'post').mockRejectedValueOnce(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }));
    await expect(logout()).resolves.toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(localStorage.getItem(LOGOUT_PENDING_KEY)).toBe('1');

    const retry = vi.spyOn(axios, 'post').mockResolvedValueOnce({ data: {} });
    await flushPendingLogout();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry.mock.calls[0][2]).toMatchObject({ headers: expect.not.objectContaining({ Authorization: expect.anything() }) });
    expect(isLogoutPending()).toBe(false);
  });

  it('réponse 4xx (rien à fermer) : plus rien en attente', async () => {
    signIn();
    vi.spyOn(axios, 'post').mockRejectedValueOnce({ response: { status: 401 } });
    await logout();
    expect(isLogoutPending()).toBe(false);
  });

  it('une nouvelle connexion annule une déconnexion en attente (la nouvelle session n’est jamais fermée)', () => {
    localStorage.setItem(LOGOUT_PENDING_KEY, '1');
    useAuthStore.getState().setTokens('nouvelle-session');
    expect(isLogoutPending()).toBe(false);
  });

  it('aucune autre donnée du navigateur n’est effacée (langue, thème)', async () => {
    localStorage.setItem('bla_lang', 'en');
    localStorage.setItem('bla_theme', '{"state":{"isDark":true}}');
    signIn();
    vi.spyOn(axios, 'post').mockResolvedValue({ data: {} });
    await logout();
    expect(localStorage.getItem('bla_lang')).toBe('en');
    expect(localStorage.getItem('bla_theme')).toContain('isDark');
  });
});

describe('synchronisation entre onglets', () => {
  it('déconnexion dans un autre onglet (canal de diffusion) : cet onglet est prévenu', async () => {
    const onRemote = vi.fn();
    const unsubscribe = subscribeAuthSync(onRemote);
    // Autre onglet = autre canal du même nom.
    const otherTab = new BroadcastChannel('bla-auth');
    otherTab.postMessage({ type: 'logout' });
    await vi.waitFor(() => expect(onRemote).toHaveBeenCalled());
    otherTab.close();
    unsubscribe();
  });

  it('cet onglet diffuse sa déconnexion aux autres', async () => {
    const otherTab = new BroadcastChannel('bla-auth');
    const received = vi.fn();
    otherTab.onmessage = (e) => received(e.data);
    signIn();
    endLocalSession();
    await vi.waitFor(() => expect(received).toHaveBeenCalledWith({ type: 'logout' }));
    otherTab.close();
  });

  it('repli sans canal : l’utilisateur persisté passe à null dans un autre onglet → déconnexion', () => {
    signIn();
    const onRemote = vi.fn();
    const unsubscribe = subscribeAuthSync(onRemote);
    window.dispatchEvent(new StorageEvent('storage', { key: AUTH_STORAGE_KEY, newValue: JSON.stringify({ state: { user: null }, version: 0 }) }));
    expect(onRemote).toHaveBeenCalledTimes(1);
    // Une autre clé (langue) ne déconnecte pas.
    window.dispatchEvent(new StorageEvent('storage', { key: 'bla_lang', newValue: 'en' }));
    expect(onRemote).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it } from 'vitest';
import api, {
  READ_TIMEOUT_MS,
  WRITE_TIMEOUT_MS,
  isAuthEntryRequest,
  isIdempotentRequest,
} from '../services/api';
import { useAdminAuthStore } from '../store/adminAuthStore';

/** Adaptateur HTTP factice : répond toujours `status` / `data` et enregistre les appels. */
function fakeServer(status: number, data: unknown = {}) {
  const calls: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    calls.push(config);
    const response = { data, status, statusText: String(status), headers: {}, config, request: {} };
    if (status >= 200 && status < 300) return response;
    throw new AxiosError(
      `HTTP ${status}`,
      status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
      config,
      {},
      response,
    );
  };
  api.defaults.adapter = adapter;
  return calls;
}

function signIn(withRefreshToken: boolean) {
  useAdminAuthStore.getState().setTokens(
    'access-token',
    withRefreshToken ? 'refresh-token' : (null as unknown as string),
    { id: 'admin-1', role: 'super_admin', email: 'admin@example.test' },
  );
}

beforeEach(() => {
  useAdminAuthStore.getState().logout();
  window.history.pushState({}, '', '/login');
});

describe('fonctions de décision', () => {
  it('reconnaît les requêtes idempotentes', () => {
    expect(isIdempotentRequest('get')).toBe(true);
    expect(isIdempotentRequest('GET')).toBe(true);
    expect(isIdempotentRequest(undefined)).toBe(true);
    expect(isIdempotentRequest('post')).toBe(false);
    expect(isIdempotentRequest('patch')).toBe(false);
    expect(isIdempotentRequest('delete')).toBe(false);
  });

  it("reconnaît les requêtes d'ouverture de session", () => {
    expect(isAuthEntryRequest('/auth/login')).toBe(true);
    expect(isAuthEntryRequest('/auth/login/verify-mfa')).toBe(true);
    expect(isAuthEntryRequest('https://api.example.test/api/v1/auth/refresh-token')).toBe(true);
    expect(isAuthEntryRequest('/auth/login?x=1')).toBe(true);
    expect(isAuthEntryRequest('/admin/dashboard')).toBe(false);
    expect(isAuthEntryRequest('/users/me')).toBe(false);
    expect(isAuthEntryRequest(undefined)).toBe(false);
  });
});

describe('intercepteurs du client API admin', () => {
  it('401 sur /auth/login : erreur transmise à l’écran, sans déconnexion ni nouvel essai', async () => {
    signIn(true);
    const calls = fakeServer(401, { error: 'Identifiants incorrects' });

    await expect(api.post('/auth/login', { email: 'a@b.c', password: 'x' })).rejects.toMatchObject({
      response: { status: 401, data: { error: 'Identifiants incorrects' } },
    });

    expect(calls).toHaveLength(1);
    expect(useAdminAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('401 sur la vérification MFA : erreur transmise (pas de rechargement)', async () => {
    const calls = fakeServer(401, { error: 'Session MFA expirée' });

    await expect(
      api.post('/auth/login/verify-mfa', { tempToken: 't', otpCode: '123456' }),
    ).rejects.toMatchObject({ response: { status: 401 } });
    expect(calls).toHaveLength(1);
  });

  it('503 sur une écriture (connexion) : jamais rejouée, pour ne pas générer plusieurs OTP', async () => {
    const calls = fakeServer(503, { error: 'Aucun canal OTP disponible.' });

    await expect(api.post('/auth/login', { email: 'a@b.c', password: 'x' })).rejects.toMatchObject({
      response: { status: 503 },
    });
    expect(calls).toHaveLength(1);
  });

  it('503 sur une écriture admin : jamais rejouée', async () => {
    signIn(true);
    const calls = fakeServer(503);

    await expect(api.post('/admin/categories', { name: 'x' })).rejects.toBeInstanceOf(AxiosError);
    expect(calls).toHaveLength(1);
  });

  it('503 sur une lecture : rejouée (comportement de résilience conservé)', async () => {
    signIn(true);
    const calls = fakeServer(503);

    await expect(api.get('/admin/dashboard')).rejects.toBeInstanceOf(AxiosError);
    expect(calls).toHaveLength(3); // 1 essai + 2 nouvelles tentatives
  }, 10_000);

  it('401 sur une route protégée sans jeton de rafraîchissement : déconnexion', async () => {
    signIn(false);
    fakeServer(401, { error: 'Token invalide ou expiré' });

    await expect(api.get('/admin/dashboard')).rejects.toBeInstanceOf(AxiosError);
    expect(useAdminAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('délai long pour les écritures (réveil Render), court pour les lectures', async () => {
    const calls = fakeServer(200, { ok: true });

    await api.post('/auth/login', { email: 'a@b.c', password: 'x' });
    await api.get('/admin/dashboard');

    expect(calls[0].timeout).toBe(WRITE_TIMEOUT_MS);
    expect(calls[1].timeout).toBe(READ_TIMEOUT_MS);
  });

  it("ajoute l'en-tête X-Admin-Request et le jeton d'accès", async () => {
    signIn(true);
    const calls = fakeServer(200, {});

    await api.get('/admin/dashboard');

    expect(calls[0].headers['X-Admin-Request']).toBe('1');
    expect(calls[0].headers.Authorization).toBe('Bearer access-token');
  });
});

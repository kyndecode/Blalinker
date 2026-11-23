import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock('../services/api', () => ({ default: apiMock }));

import AdminLogin, { getFriendlyError } from '../pages/Login';
import { useAdminAuthStore } from '../store/adminAuthStore';

async function submitCredentials() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <AdminLogin />
    </MemoryRouter>,
  );
  await user.type(screen.getByPlaceholderText('vous@exemple.com'), 'admin@example.test');
  await user.type(screen.getByPlaceholderText('••••••••••••'), 'not-a-real-password');
  await user.click(screen.getByRole('button', { name: 'Se connecter' }));
  return user;
}

beforeEach(() => {
  useAdminAuthStore.getState().logout();
});

describe('écran de connexion admin', () => {
  it('affiche le message du serveur quand les identifiants sont refusés', async () => {
    apiMock.post.mockRejectedValueOnce({
      response: { status: 401, data: { error: 'Identifiants incorrects' } },
    });

    await submitCredentials();

    expect(await screen.findByRole('alert')).toHaveTextContent('Identifiants incorrects');
    expect(apiMock.post).toHaveBeenCalledTimes(1);
  });

  it('affiche le verrouillage temporaire du compte (423)', async () => {
    apiMock.post.mockRejectedValueOnce({
      response: { status: 423, data: { error: 'Compte temporairement verrouillé. Réessayez dans 15 minutes.' } },
    });

    await submitCredentials();

    expect(await screen.findByRole('alert')).toHaveTextContent('Compte temporairement verrouillé');
  });

  it("indique un démarrage du serveur en cas d'expiration du délai", async () => {
    apiMock.post.mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout of 75000ms exceeded' });

    await submitCredentials();

    expect(await screen.findByRole('alert')).toHaveTextContent('démarrage en cours');
  });

  it("passe à l'étape OTP et rappelle que seul le dernier code est valide", async () => {
    apiMock.post.mockResolvedValueOnce({
      data: { mfaRequired: true, tempToken: 'temp-token', user: { id: '1', role: 'super_admin' } },
    });

    await submitCredentials();

    expect(await screen.findByText('Code OTP administrateur (6 chiffres)')).toBeInTheDocument();
    expect(screen.getByText(/seul le code du plus récent est valide/)).toBeInTheDocument();
  });

  it('refuse un compte non administrateur avec un message explicite', async () => {
    apiMock.post.mockResolvedValueOnce({
      data: { mfaRequired: false, accessToken: 'a', refreshToken: 'r', user: { id: '1', role: 'client' } },
    });
    apiMock.get.mockResolvedValueOnce({ data: { id: '1', role: 'client', email: 'client@example.test' } });

    await submitCredentials();

    expect(await screen.findByRole('alert')).toHaveTextContent('Accès refusé - compte non administrateur');
    expect(useAdminAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('ouvre la session pour un super administrateur sans MFA', async () => {
    apiMock.post.mockResolvedValueOnce({
      data: { mfaRequired: false, accessToken: 'a', refreshToken: 'r', user: { id: '1', role: 'super_admin' } },
    });
    apiMock.get.mockResolvedValueOnce({ data: { id: '1', role: 'super_admin', email: 'admin@example.test' } });

    await submitCredentials();

    await vi.waitFor(() => expect(useAdminAuthStore.getState().isAuthenticated).toBe(true));
    expect(useAdminAuthStore.getState().user?.role).toBe('super_admin');
  });
});

describe('getFriendlyError', () => {
  it('privilégie le message renvoyé par l’API', () => {
    expect(getFriendlyError({ response: { status: 429, data: { error: 'Trop de tentatives.' } } })).toBe(
      'Trop de tentatives.',
    );
  });

  it("signale une API injoignable sans réponse (réseau, CORS)", () => {
    expect(getFriendlyError({ code: 'ERR_NETWORK', message: 'Network Error' })).toMatch(/joindre l'API/);
  });

  it("restitue les erreurs levées par l'interface", () => {
    expect(getFriendlyError(new Error('Accès refusé - compte non administrateur'))).toBe(
      'Accès refusé - compte non administrateur',
    );
  });
});

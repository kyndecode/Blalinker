import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock('../services/api', () => ({ default: apiMock }));

import AdminLogin from '../pages/Login';
import { useAdminAuthStore } from '../store/adminAuthStore';

const TOKENS = { mfaRequired: false, accessToken: 'a', refreshToken: 'r', user: { id: '1', role: 'super_admin' } };

async function signIn() {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<AdminLogin />} />
        <Route path="/dashboard" element={<p>PAGE TABLEAU DE BORD</p>} />
        <Route path="/securite" element={<p>PAGE SÉCURITÉ</p>} />
      </Routes>
    </MemoryRouter>,
  );
  await user.type(screen.getByPlaceholderText('vous@exemple.com'), 'contact@blalinker.com');
  await user.type(screen.getByPlaceholderText('••••••••••••'), 'not-a-real-password');
  await user.click(screen.getByRole('button', { name: 'Se connecter' }));
  return user;
}

/** /users/me puis /auth/mfa/status */
function mockSessionChecks(setupRequired: boolean) {
  apiMock.get.mockImplementation(async (url: string) =>
    url === '/users/me'
      ? { data: { id: '1', role: 'super_admin', email: 'contact@blalinker.com' } }
      : { data: { setupRequired } },
  );
}

beforeEach(() => {
  useAdminAuthStore.getState().logout();
  apiMock.post.mockReset();
  apiMock.get.mockReset();
});

describe('connexion admin — application d’authentification (TOTP)', () => {
  it('demande le code de l’application et l’envoie avec method=totp', async () => {
    apiMock.post
      .mockResolvedValueOnce({ data: { mfaRequired: true, mfaMethod: 'totp', tempToken: 't', user: { id: '1', role: 'super_admin' } } })
      .mockResolvedValueOnce({ data: TOKENS });
    mockSessionChecks(false);

    const user = await signIn();
    expect(await screen.findByText("Code de votre application d'authentification")).toBeInTheDocument();

    await user.type(screen.getByLabelText('Code à 6 chiffres'), '654321');
    await user.click(screen.getByRole('button', { name: 'Verifier le code' }));

    expect(apiMock.post).toHaveBeenLastCalledWith('/auth/login/verify-mfa', { tempToken: 't', otpCode: '654321', method: 'totp' });
    expect(await screen.findByText('PAGE TABLEAU DE BORD')).toBeInTheDocument();
  });

  it("« Je n'ai pas accès à mon application » : code e-mail, adresse masquée, délai avant renvoi", async () => {
    apiMock.post
      .mockResolvedValueOnce({ data: { mfaRequired: true, mfaMethod: 'totp', tempToken: 't' } })
      .mockResolvedValueOnce({ data: { sentTo: 'co***@blalinker.com', cooldownSeconds: 60 } })
      .mockResolvedValueOnce({ data: TOKENS });
    mockSessionChecks(false);

    const user = await signIn();
    await user.click(await screen.findByRole('button', { name: "Je n'ai pas accès à mon application d'authentification" }));

    expect(apiMock.post).toHaveBeenCalledWith('/auth/login/mfa/email', { tempToken: 't' });
    expect(await screen.findByText('Code envoyé à co***@blalinker.com. Valable 10 minutes.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Renvoyer un code \(dans \d+ s\)/ })).toBeDisabled();

    await user.type(screen.getByLabelText('Code à 6 chiffres'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verifier le code' }));
    expect(apiMock.post).toHaveBeenLastCalledWith('/auth/login/verify-mfa', { tempToken: 't', otpCode: '123456', method: 'email' });
  });

  it('code de récupération : saisi en majuscules, envoyé avec method=recovery', async () => {
    apiMock.post
      .mockResolvedValueOnce({ data: { mfaRequired: true, mfaMethod: 'totp', tempToken: 't' } })
      .mockResolvedValueOnce({ data: TOKENS });
    mockSessionChecks(false);

    const user = await signIn();
    await user.click(await screen.findByRole('button', { name: 'Utiliser un code de récupération' }));
    await user.type(screen.getByLabelText('Code de récupération'), 'abcde-fghjk');
    await user.click(screen.getByRole('button', { name: 'Verifier le code' }));

    expect(apiMock.post).toHaveBeenLastCalledWith('/auth/login/verify-mfa', { tempToken: 't', otpCode: 'ABCDE-FGHJK', method: 'recovery' });
  });

  it('secours refusé (délai) : message du serveur affiché', async () => {
    apiMock.post
      .mockResolvedValueOnce({ data: { mfaRequired: true, mfaMethod: 'totp', tempToken: 't' } })
      .mockRejectedValueOnce({ response: { status: 429, data: { error: 'Patientez 42 s', retryAfter: 42 } } });

    const user = await signIn();
    await user.click(await screen.findByRole('button', { name: "Je n'ai pas accès à mon application d'authentification" }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Patientez 42 s');
  });
});

describe('connexion admin — comportements conservés et redirections', () => {
  it('compte sans application : code e-mail envoyé sans champ « method » (inchangé)', async () => {
    apiMock.post
      .mockResolvedValueOnce({ data: { mfaRequired: true, tempToken: 't', user: { id: '1', role: 'super_admin' } } })
      .mockResolvedValueOnce({ data: TOKENS });
    mockSessionChecks(false);

    const user = await signIn();
    expect(await screen.findByText('Code OTP administrateur (6 chiffres)')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Code à 6 chiffres'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verifier le code' }));

    expect(apiMock.post).toHaveBeenLastCalledWith('/auth/login/verify-mfa', { tempToken: 't', otpCode: '123456' });
  });

  it('administrateur sans application : redirigé vers la page Sécurité après connexion', async () => {
    apiMock.post.mockResolvedValueOnce({ data: TOKENS });
    mockSessionChecks(true);

    await signIn();

    expect(await screen.findByText('PAGE SÉCURITÉ')).toBeInTheDocument();
  });
});

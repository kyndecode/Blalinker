import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock('../services/api', () => ({ default: apiMock }));

import Security from '../pages/Security';

const NOT_ENABLED = { totpEnabled: false, totpEnabledAt: null, recoveryCodesRemaining: 0, setupRequired: true, enforced: false };
const ENABLED = { totpEnabled: true, totpEnabledAt: '2026-11-24T10:00:00Z', recoveryCodesRemaining: 10, setupRequired: false, enforced: false };
const SETUP = {
  issuer: 'BLA Services',
  account: 'contact@blalinker.com',
  qrCodeDataUrl: 'data:image/png;base64,AAAA',
  manualEntryKey: 'ABCD EFGH IJKL MNOP',
  expiresInSeconds: 600,
};
const CODES = ['AAAAA-BBBBB', 'CCCCC-DDDDD', 'EEEEE-FFFFF', 'GGGGG-HHHHH', 'JJJJJ-KKKKK',
  'LLLLL-MMMMM', 'NNNNN-PPPPP', 'QQQQQ-RRRRR', 'SSSSS-TTTTT', 'UUUUU-VVVVV'];

function renderPage() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <Security />
    </MemoryRouter>,
  );
  return user;
}

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.post.mockReset();
});

describe('page Sécurité — configuration de l’application d’authentification', () => {
  it('parcours complet : mot de passe, QR code, premier code, codes de récupération montrés une fois', async () => {
    apiMock.get.mockResolvedValueOnce({ data: NOT_ENABLED }).mockResolvedValueOnce({ data: ENABLED });
    apiMock.post
      .mockResolvedValueOnce({ data: SETUP })
      .mockResolvedValueOnce({ data: { recoveryCodes: CODES } });
    const user = renderPage();

    expect(await screen.findByText(/Configurez votre application d'authentification/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Mot de passe'), 'not-a-real-password');
    await user.click(screen.getByRole('button', { name: "Configurer l'application" }));

    expect(apiMock.post).toHaveBeenCalledWith('/auth/mfa/totp/setup', { password: 'not-a-real-password' });
    expect(await screen.findByAltText('QR code de configuration')).toHaveAttribute('src', SETUP.qrCodeDataUrl);
    expect(screen.getByLabelText('Clé de configuration')).toHaveTextContent('ABCD EFGH IJKL MNOP');

    await user.type(screen.getByLabelText("Premier code de l'application"), '123456');
    await user.click(screen.getByRole('button', { name: 'Activer' }));

    expect(apiMock.post).toHaveBeenLastCalledWith('/auth/mfa/totp/activate', { code: '123456' });
    const list = await screen.findByRole('list', { name: 'Codes de récupération' });
    expect(list.querySelectorAll('li')).toHaveLength(10);
    // Le secret n'est plus affiché une fois l'application activée.
    expect(screen.queryByText('ABCD EFGH IJKL MNOP')).not.toBeInTheDocument();
    expect(screen.queryByAltText('QR code de configuration')).not.toBeInTheDocument();

    const done = screen.getByRole('button', { name: 'Terminer' });
    expect(done).toBeDisabled();
    await user.click(screen.getByLabelText("J'ai conservé mes codes de récupération"));
    await user.click(done);

    expect(await screen.findByText("Application d'authentification activée")).toBeInTheDocument();
    expect(screen.queryByText('AAAAA-BBBBB')).not.toBeInTheDocument();
  });

  it('mot de passe incorrect : message affiché, aucun QR code', async () => {
    apiMock.get.mockResolvedValueOnce({ data: NOT_ENABLED });
    apiMock.post.mockRejectedValueOnce({ response: { status: 403, data: { error: 'Mot de passe incorrect' } } });
    const user = renderPage();

    await user.type(await screen.findByLabelText('Mot de passe'), 'faux');
    await user.click(screen.getByRole('button', { name: "Configurer l'application" }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Mot de passe incorrect');
    expect(screen.queryByAltText('QR code de configuration')).not.toBeInTheDocument();
  });

  it('application active : régénération des codes avec un code de l’application', async () => {
    apiMock.get.mockResolvedValue({ data: ENABLED });
    apiMock.post.mockResolvedValueOnce({ data: { recoveryCodes: CODES } });
    const user = renderPage();

    expect(await screen.findByText(/Codes de récupération restants/)).toHaveTextContent('10');
    await user.type(screen.getByLabelText("Code de l'application"), '654321');
    await user.click(screen.getByRole('button', { name: 'Générer de nouveaux codes' }));

    expect(apiMock.post).toHaveBeenCalledWith('/auth/mfa/recovery-codes', { code: '654321' });
    await waitFor(() => expect(screen.getByRole('list', { name: 'Codes de récupération' })).toBeInTheDocument());
  });
});

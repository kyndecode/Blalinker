/**
 * Menu du compte (non-régression du 26/11/2026) : une seule action « Se déconnecter »,
 * identité réelle, rien du compte affiché hors session ; routes privées protégées.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Header from '../../components/layout/Header';
import RequireAuth from '../../components/auth/RequireAuth';
import { useAuthStore } from '../../store/authStore';
import { queryClient } from '../../services/queryClient';
import { tr, trRx } from '../tr';

const { getMock, logoutMock } = vi.hoisted(() => ({ getMock: vi.fn(), logoutMock: vi.fn() }));
vi.mock('../../services/api', () => ({ default: { get: getMock, post: vi.fn() }, api: { get: getMock } }));
vi.mock('../../services/logout', () => ({ logout: logoutMock }));
vi.mock('../../components/notifications/NotificationBell', () => ({ default: () => null }));

function renderHeader() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><Header /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useAuthStore.getState().logout();
  queryClient.clear();
  getMock.mockResolvedValue({ data: { firstName: 'Awa', lastName: 'Koné', email: 'awa@example.test', phone: '', avatarUrl: '' } });
  logoutMock.mockImplementation(() => { useAuthStore.getState().logout(); return Promise.resolve(true); });
});

describe('visiteur non connecté', () => {
  it('« Se connecter » et « Créer un compte » ; aucun élément du compte', () => {
    renderHeader();
    expect(screen.getAllByRole('link', { name: tr('auth.login') }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: tr('auth.register') }).length).toBeGreaterThan(0);
    expect(screen.queryByText(tr('nav.my_account'))).not.toBeInTheDocument();
    expect(screen.queryByText(tr('auth.logged_as'))).not.toBeInTheDocument();
    expect(screen.queryByText(tr('nav.logout'))).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: tr('nav.dashboard') })).not.toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalledWith('/users/me');
  });
});

describe('utilisateur connecté', () => {
  beforeEach(() => {
    useAuthStore.getState().setTokens('access-123');
    useAuthStore.getState().setUser({ id: 'u1', role: 'client' });
  });

  it('« Mon compte » ; identité réelle dans le menu ; UNE seule action « Se déconnecter »', async () => {
    const user = userEvent.setup();
    renderHeader();
    // Aucun bouton de déconnexion dans la barre elle-même.
    expect(screen.queryByText(tr('nav.logout'))).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: trRx('nav.my_account') }));
    const identity = await screen.findByTestId('account-identity');
    expect(within(identity).getByText('Awa Koné')).toBeInTheDocument();
    expect(within(identity).getByText('awa@example.test')).toBeInTheDocument();
    expect(screen.getAllByText(tr('nav.logout'))).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: trRx('nav.profile') }).length).toBeGreaterThan(0);
  });

  it('identité inconnue (profil indisponible) : pas de « Connecté en tant que » vide', async () => {
    getMock.mockRejectedValue(new Error('indisponible'));
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole('button', { name: trRx('nav.my_account') }));
    expect(screen.queryByTestId('account-identity')).not.toBeInTheDocument();
    expect(screen.queryByText(tr('auth.logged_as'))).not.toBeInTheDocument();
  });

  it('« Se déconnecter » : session terminée, retour à la connexion avec confirmation, menu de compte retiré', async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole('button', { name: trRx('nav.my_account') }));
    await user.click(screen.getByRole('button', { name: trRx('nav.logout') }));
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(vi.mocked(useNavigate)()).toHaveBeenCalledWith('/login', { replace: true });
    expect(sessionStorage.getItem('bla_flash_notice')).toBe(tr('auth.logged_out'));
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(screen.queryByText(tr('nav.my_account'))).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: tr('auth.login') }).length).toBeGreaterThan(0);
  });
});

describe('routes privées', () => {
  function LoginStub() {
    const location = useLocation();
    return <p>connexion (retour : {(location.state as { from?: string } | null)?.from})</p>;
  }
  const renderAt = (path: string) => render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginStub />} />
        <Route path="/dashboard" element={<RequireAuth><p>tableau de bord privé</p></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><p>profil privé</p></RequireAuth>} />
      </Routes>
    </MemoryRouter>,
  );

  it('non connecté : accès direct au tableau de bord ou au profil refusé, redirection vers la connexion', () => {
    renderAt('/dashboard');
    expect(screen.queryByText('tableau de bord privé')).not.toBeInTheDocument();
    expect(screen.getByText('connexion (retour : /dashboard)')).toBeInTheDocument();
  });

  it('connecté : accès accordé ; après déconnexion : refusé', () => {
    useAuthStore.getState().setTokens('access-123');
    const { unmount } = renderAt('/profile');
    expect(screen.getByText('profil privé')).toBeInTheDocument();
    unmount();
    useAuthStore.getState().logout();
    renderAt('/profile');
    expect(screen.queryByText('profil privé')).not.toBeInTheDocument();
  });
});

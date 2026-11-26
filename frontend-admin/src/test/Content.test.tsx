import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('../services/api', () => ({ default: apiMock }));

import Pages from '../pages/content/Pages';
import Settings from '../pages/settings/Settings';
import Categories, { slugify } from '../pages/Categories';
import AdminLayout from '../components/AdminLayout';
import { ToastProvider } from '../components/ui/Toast';
import { useAdminAuthStore } from '../store/adminAuthStore';

function renderPage(page: JSX.Element) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><ToastProvider>{page}</ToastProvider></MemoryRouter></QueryClientProvider>);
}

describe('pages du site', () => {
  it('création : aperçu fidèle (Markdown sans HTML) puis enregistrement', async () => {
    apiMock.get.mockResolvedValue({ data: { data: [], meta: { total: 0, totalPages: 1 } } });
    apiMock.post.mockResolvedValue({ data: { id: 'p1' } });
    renderPage(<Pages />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Nouvelle page/ }));
    const dialog = screen.getByRole('dialog', { name: 'Nouvelle page' });
    await user.type(within(dialog).getByLabelText(/Identifiant/), 'terms');
    expect(within(dialog).getByText('Conditions générales (/terms)')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^Titre/), 'CGU');
    await user.type(within(dialog).getByLabelText(/^Contenu/), '## Article 1{enter}{enter}Texte **clé** <script>alert(1)</script>');
    await user.click(within(dialog).getByRole('tab', { name: 'Aperçu' }));
    const preview = within(dialog).getByTestId('page-preview');
    expect(within(preview).getByRole('heading', { name: 'Article 1' })).toBeInTheDocument();
    expect(preview.querySelector('script')).toBeNull();
    expect(preview).toHaveTextContent('<script>alert(1)</script>');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/admin/content/pages', expect.objectContaining({ slug: 'terms', title: 'CGU', status: 'draft', summary: null })));
  });

  it('erreur de validation du serveur affichée sous le champ concerné', async () => {
    apiMock.get.mockResolvedValue({ data: { data: [], meta: { total: 0, totalPages: 1 } } });
    apiMock.post.mockRejectedValue({ response: { status: 422, data: { error: 'Données invalides', errors: { slug: ['Identifiant : minuscules, chiffres et tirets'] } } } });
    renderPage(<Pages />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Nouvelle page/ }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Identifiant/), 'Mauvais Slug');
    await user.type(within(dialog).getByLabelText(/^Titre/), 'Titre');
    await user.type(within(dialog).getByLabelText(/^Contenu/), 'Texte');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText('Identifiant : minuscules, chiffres et tirets')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Identifiant/)).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('paramètres', () => {
  it('texte par langue : seules les langues remplies sont envoyées', async () => {
    apiMock.get.mockImplementation((url: string) => Promise.resolve({ data: url === '/admin/countries'
      ? { items: [] }
      : { catalog: [{ key: 'home.heroTitle', label: 'Titre de l’accueil', group: 'Accueil', kind: 'localized' }], items: [] } }));
    apiMock.put.mockResolvedValue({ data: {} });
    renderPage(<Settings />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Français'), 'Des pros près de chez vous');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalledWith('/admin/settings', {
      key: 'home.heroTitle', scope: 'global', value: { fr: 'Des pros près de chez vous' },
    }));
  });
});

describe('catégories', () => {
  it('identifiant généré depuis le nom (sans accents)', () => {
    expect(slugify('Électricité générale')).toBe('electricite-generale');
    expect(slugify('  Beauté & bien-être ')).toBe('beaute-bien-etre');
  });

  it('suppression refusée (utilisée) : message du serveur dans la confirmation', async () => {
    apiMock.get.mockResolvedValue({ data: [{ id: 'c1', name: 'Plomberie', slug: 'plomberie', description: null, iconUrl: '🔧', isActive: true, sortOrder: 0, parentId: null, _count: { services: 4 } }] });
    apiMock.delete.mockRejectedValue({ response: { status: 409, data: { error: 'Catégorie utilisée : désactivez-la plutôt que de la supprimer.', code: 'CATEGORY_IN_USE' } } });
    renderPage(<Categories />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Supprimer Plomberie' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('désactivez-la');
  });
});

describe('menu de l’administration', () => {
  function renderLayout(role: 'admin' | 'super_admin', permissions: string[], health: 'ok' | 'down' = 'ok') {
    useAdminAuthStore.setState({ user: { id: 'u1', email: 'membre@example.test', role }, isAuthenticated: true, accessToken: 't', refreshToken: null });
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/users/me') return Promise.resolve({ data: { id: 'u1', role, permissions } });
      if (url === '/site/health') return health === 'ok' ? Promise.resolve({ data: { status: 'ok' } }) : Promise.reject(new Error('Network Error'));
      return Promise.resolve({ data: {} });
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/']}><Routes><Route path="/" element={<AdminLayout />} /></Routes></MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('n’affiche que les entrées autorisées par les permissions', async () => {
    renderLayout('admin', ['content.manage']);
    const nav = screen.getAllByRole('navigation', { name: 'Menu principal' })[0];
    expect(await within(nav).findByRole('link', { name: 'Pages' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Mon compte' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Utilisateurs' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Paramètres' })).not.toBeInTheDocument();
  });

  it('super-administrateur : toutes les entrées', async () => {
    renderLayout('super_admin', []);
    const nav = screen.getAllByRole('navigation', { name: 'Menu principal' })[0];
    for (const name of ['Utilisateurs', 'Pages', 'Paramètres', 'Pays', "Journal d'audit"]) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
    }
  });

  it('indicateur de santé réel (plus de « Système opérationnel » fixe)', async () => {
    renderLayout('super_admin', [], 'down');
    expect(await screen.findByText('API injoignable')).toBeInTheDocument();
    expect(screen.queryByText(/Systeme operationnel/i)).not.toBeInTheDocument();
  });
});

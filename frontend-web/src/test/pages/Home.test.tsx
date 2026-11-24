import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Home from '../../pages/Home/Home';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock('../../services/api', () => ({ default: { get: getMock } }));

const NETWORK_ERROR = () => Promise.reject(Object.assign(new Error('Network Error'), { isAxiosError: true }));

/** `null` = API en erreur (réseau, 5xx). Les autres points d'accès renvoient des données vides par défaut. */
function mockApi(stats: unknown[] | null, testimonials: unknown[] | null, extra: Record<string, unknown> = {}) {
  getMock.mockImplementation((url: string) => {
    if (url in extra) return Promise.resolve({ data: extra[url] });
    if (url === '/site/stats') return stats === null ? NETWORK_ERROR() : Promise.resolve({ data: { items: stats } });
    if (url === '/site/testimonials') return testimonials === null ? NETWORK_ERROR() : Promise.resolve({ data: { items: testimonials } });
    if (url === '/categories') return Promise.resolve({ data: [] });
    if (url === '/site/settings') return Promise.resolve({ data: { values: {} } });
    return Promise.resolve({ data: { items: [] } });
  });
}

const calledWith = (url: string) => getMock.mock.calls.some(([u]) => u === url);

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Chaque test définit sa propre réponse simulée ; l'historique des appels est
// effacé après chaque test (vi.clearAllMocks dans test/setup.ts).

describe('Accueil — aucun chiffre ni témoignage inventé', () => {
  it('n’affiche plus les anciens chiffres codés en dur', async () => {
    mockApi([], []);
    renderHome();
    await waitFor(() => expect(calledWith('/site/testimonials')).toBe(true));
    for (const fake of ['2 000+', '15 000+', '98%', 'Aminata D.', 'Moussa K.', 'Fatoumata B.']) {
      expect(screen.queryByText(fake)).not.toBeInTheDocument();
    }
  });

  it('données insuffisantes (listes vides) : sections chiffres et témoignages masquées', async () => {
    mockApi([], []);
    renderHome();
    await waitFor(() => expect(calledWith('/site/stats') && calledWith('/site/testimonials')).toBe(true));
    expect(screen.queryByTestId('home-stats')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home-testimonials')).not.toBeInTheDocument();
  });

  it('API indisponible : sections masquées, page toujours affichée', async () => {
    mockApi(null, null);
    renderHome();
    await waitFor(() => expect(calledWith('/site/stats') && calledWith('/site/testimonials')).toBe(true));
    expect(screen.queryByTestId('home-stats')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home-testimonials')).not.toBeInTheDocument();
    expect(screen.getByText('home.categories_title')).toBeInTheDocument();
  });

  it('affiche uniquement les indicateurs réels renvoyés par le serveur', async () => {
    mockApi([
      { key: 'verified_providers', value: 24 },
      { key: 'average_rating', value: 4.6, count: 31 },
    ], []);
    renderHome();
    const section = await screen.findByTestId('home-stats');
    expect(section).toHaveTextContent('24');
    expect(section).toHaveTextContent('4,6/5');
    expect(section).toHaveTextContent('home.stats_verified_providers');
    expect(section).not.toHaveTextContent('home.stats_completed_missions'); // non renvoyé = non affiché
  });

  it('affiche les avis réels approuvés (nom abrégé, ville, note)', async () => {
    mockApi([], [{
      id: 'r1', rating: 4, comment: 'Intervention rapide et propre.', authorName: 'Koffi Y.', city: 'Abidjan', createdAt: '2026-11-01',
    }]);
    renderHome();
    const section = await screen.findByTestId('home-testimonials');
    expect(section).toHaveTextContent('Intervention rapide et propre.');
    expect(section).toHaveTextContent('Koffi Y.');
    expect(screen.getByRole('img', { name: '4/5' })).toBeInTheDocument();
  });
});

describe('Accueil — contenus administrables', () => {
  it('aucun pays présupposé : pas de bandeau tant qu’aucun pays n’est activé', async () => {
    mockApi([], []);
    renderHome();
    await waitFor(() => expect(calledWith('/site/countries')).toBe(true));
    expect(screen.queryByTestId('home-countries')).not.toBeInTheDocument();
    expect(screen.queryByText(/Togo|Burkina|Mali/)).not.toBeInTheDocument();
  });

  it('pays activés dans l’administration : affichés', async () => {
    mockApi([], [], { '/site/countries': { items: [{ code: 'XA', name: 'Pays A', dialCode: '+999', currency: 'XOF', defaultLocale: 'fr' }] } });
    renderHome();
    expect(await screen.findByTestId('home-countries')).toHaveTextContent('Pays A');
  });

  it('catégories et titre publiés depuis l’administration remplacent les valeurs intégrées', async () => {
    mockApi([], [], {
      '/categories': [{ id: 'c1', name: 'Électricité', slug: 'electricite', iconUrl: '⚡', children: [{ id: 'c2', name: 'Dépannage', slug: 'depannage' }] }],
      '/site/settings': { values: { 'home.heroTitle': { fr: 'Des pros vérifiés près de chez vous' } } },
    });
    renderHome();
    expect(await screen.findByRole('button', { name: /Électricité/ })).toBeInTheDocument();
    expect(screen.getByText('Dépannage')).toBeInTheDocument();
    expect(screen.queryByText('home.categories.batiment.label')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: 'Des pros vérifiés près de chez vous' })).toBeInTheDocument();
  });
});

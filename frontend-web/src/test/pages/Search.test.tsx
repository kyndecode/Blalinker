import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock('../../services/api', () => ({ default: { get: getMock } }));
// La carte (Leaflet) n'est pas utile ici et ne fonctionne pas sous jsdom.
vi.mock('react-leaflet', () => ({ MapContainer: () => null, TileLayer: () => null, Marker: () => null, Popup: () => null, Circle: () => null, useMap: () => ({}) }));

import SearchPage from '../../pages/Search/SearchPage';
import SimilarProviders from '../../components/provider/SimilarProviders';

const ITEM = {
  id: 's1', title: 'Plomberie sanitaire', description: null, price: 15000, priceType: 'fixed',
  category: { name: 'Plomberie', slug: 'plomberie' },
  provider: { id: 'p1', firstName: 'Awa', lastName: 'Ndiaye', businessName: null, city: 'Abidjan', avatarUrl: null, idVerified: true, isAvailable: true, ratingAverage: 4.5, ratingCount: 8 },
  distanceKm: null,
};

function Where() {
  const loc = useLocation();
  return <output data-testid="location">{loc.search}</output>;
}

function renderAt(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes><Route path="/search" element={<><SearchPage /><Where /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('recherche par mot-clé', () => {
  it('la saisie de l’en-tête (?q=) est réellement utilisée (plus d’action sans effet)', async () => {
    getMock.mockImplementation((url: string) => Promise.resolve({ data: url === '/search' ? { data: [ITEM], meta: { total: 1, page: 1, totalPages: 1 }, didYouMean: null } : [] }));
    renderAt('/search?q=plombrie');
    expect(await screen.findByRole('heading', { name: 'Plomberie sanitaire' })).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith('/search', { params: { q: 'plombrie', sort: 'relevance', page: '1' } });
    expect(screen.getByTestId('search-count')).toHaveTextContent('1 résultat pour « plombrie »');
    expect(screen.getByText('Identité vérifiée')).toBeInTheDocument();
  });

  it('aucun résultat : « Vouliez-vous dire » relance la recherche corrigée', async () => {
    getMock.mockImplementation((url: string, cfg?: { params?: { q?: string } }) => {
      if (url !== '/search') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: cfg?.params?.q === 'Plomberie'
        ? { data: [ITEM], meta: { total: 1, page: 1, totalPages: 1 }, didYouMean: null }
        : { data: [], meta: { total: 0, page: 1, totalPages: 0 }, didYouMean: 'Plomberie' } });
    });
    renderAt('/search?q=plmbr');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Plomberie' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('q=Plomberie'));
    expect(await screen.findByRole('heading', { name: 'Plomberie sanitaire' })).toBeInTheDocument();
  });

  it('suggestions pendant la saisie : choisir une ville l’ajoute à la recherche', async () => {
    getMock.mockImplementation((url: string) => {
      if (url === '/search/suggest') return Promise.resolve({ data: { categories: [], services: [], cities: [{ city: 'Abidjan', providers: 3 }] } });
      if (url === '/search') return Promise.resolve({ data: { data: [], meta: { total: 0, page: 1, totalPages: 0 }, didYouMean: null } });
      return Promise.resolve({ data: [] });
    });
    renderAt('/search');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Que recherchez-vous ?'), 'abidj');
    await user.click(await screen.findByRole('button', { name: /Abidjan/ }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('city=Abidjan'));
  });
});

describe('recommandations', () => {
  it('prestataires similaires affichés ; section masquée s’il n’y en a pas', async () => {
    getMock.mockResolvedValue({ data: { items: [{ id: 'p2', firstName: 'Koffi', lastName: 'Yao', businessName: 'Yao Plomberie', avatarUrl: null, city: 'Abidjan', ratingAverage: 4.8, ratingCount: 12, sameCity: true }] } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(<QueryClientProvider client={client}><MemoryRouter><SimilarProviders providerId="p1" /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole('link', { name: /Yao Plomberie/ })).toHaveAttribute('href', '/provider/p2');
    unmount();
    getMock.mockResolvedValue({ data: { items: [] } });
    const client2 = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client2}><MemoryRouter><SimilarProviders providerId="p3" /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/providers/p3/similar'));
    expect(screen.queryByText('Prestataires similaires')).not.toBeInTheDocument();
  });
});

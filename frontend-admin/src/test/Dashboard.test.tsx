import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../services/api', () => ({ default: apiMock }));

import Dashboard from '../pages/Dashboard';
import Users from '../pages/Users';

const STATS = {
  users: { total: 120, active: 100, pendingVerification: 3, newThisWeek: 7 },
  providers: { total: 40, active: 30, pendingApproval: 4 },
  bookings: { total: 80, today: 2, inProgress: 5, completed: 60 },
  revenue: { total: 900000, thisMonth: 120000, currency: 'XOF' },
  commissions: { thisMonth: 4321, currency: 'XOF' },
  reports: { open: 1 },
  reviews: { pending: 2 },
};

function renderPage(page: JSX.Element) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>,
  );
}

// Chaque test définit sa réponse simulée ; vi.clearAllMocks() s'exécute après chaque test (test/setup.ts).

describe('tableau de bord — chiffres réels uniquement', () => {
  it('aucune tendance inventée (« +12 % », « -3 % »…) n’est affichée', async () => {
    apiMock.get.mockResolvedValue({ data: STATS });
    const { container } = renderPage(<Dashboard />);
    await screen.findByText('Utilisateurs');
    // Les tendances étaient rendues avec une flèche montante/descendante : il n'en reste aucune.
    expect(container.querySelectorAll('.lucide-arrow-up-right, .lucide-arrow-down-right')).toHaveLength(0);
    // Les seuls pourcentages restants sont les barres de répartition, calculées sur les données.
    expect(screen.queryByText('22%')).not.toBeInTheDocument();
    expect(screen.queryByText('15%')).not.toBeInTheDocument();
  });

  it('commissions : montant enregistré par le serveur, pas un taux supposé de 5 %', async () => {
    apiMock.get.mockResolvedValue({ data: STATS });
    renderPage(<Dashboard />);
    expect(await screen.findByText('Commissions du mois (enregistrées)')).toBeInTheDocument();
    expect(screen.getAllByText(/4[\s\u202f\u00a0]?321 XOF/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Commission plateforme \(5%\)/)).not.toBeInTheDocument();
    // 5 % de 120 000 = 6 000 : ce calcul fictif ne doit plus apparaître.
    expect(screen.queryByText(/6[\s\u202f\u00a0]?000/)).not.toBeInTheDocument();
  });
});

describe('permission refusée par le serveur (403)', () => {
  it('tableau de bord : message d’accès réservé au lieu d’une page vide', async () => {
    apiMock.get.mockRejectedValue({ response: { status: 403, data: { code: 'FORBIDDEN' } } });
    renderPage(<Dashboard />);
    expect(await screen.findByRole('status')).toHaveTextContent('Voir statistiques');
  });

  it('utilisateurs : message d’accès réservé', async () => {
    apiMock.get.mockRejectedValue({ response: { status: 403, data: { code: 'FORBIDDEN' } } });
    renderPage(<Users />);
    expect(await screen.findByRole('status')).toHaveTextContent('Voir utilisateurs');
  });
});

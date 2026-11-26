import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('../services/api', () => ({ default: apiMock }));

import Reviews from '../pages/Reviews';
import Reports from '../pages/Reports';
import Users from '../pages/Users';
import { ToastProvider } from '../components/ui/Toast';

function renderPage(page: JSX.Element) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ToastProvider>{page}</ToastProvider></MemoryRouter>
    </QueryClientProvider>,
  );
}

const REVIEW = {
  id: 'r1', rating: 2, comment: 'Retard important et travail bâclé', response: null, flagReason: null,
  createdAt: '2026-11-20T10:00:00.000Z', moderation: 'pending',
  client: { email: 'client@example.test', firstName: 'Koffi', lastName: 'Yao' },
  provider: { email: 'pro@example.test', firstName: 'Awa', lastName: 'Ndiaye' },
  booking: { id: 'b1', status: 'validated', service: { title: 'Plomberie' } },
};

describe('modération des avis', () => {
  it('liste « À modérer » par défaut, publication en un clic avec retour visible', async () => {
    apiMock.get.mockResolvedValue({ data: { data: [REVIEW], meta: { total: 1, totalPages: 1 } } });
    apiMock.put.mockResolvedValue({ data: { message: 'Avis approuvé' } });
    renderPage(<Reviews />);
    expect(await screen.findByText('Retard important et travail bâclé')).toBeInTheDocument();
    expect(apiMock.get).toHaveBeenCalledWith('/admin/reviews', { params: { page: 1, limit: 20, status: 'pending' } });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Publier' }));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalledWith('/admin/reviews/r1/approve'));
    expect(await screen.findByText('Avis approuvé')).toBeInTheDocument();
  });

  it('refus : motif obligatoire, transmis au serveur', async () => {
    apiMock.get.mockResolvedValue({ data: { data: [REVIEW], meta: { total: 1, totalPages: 1 } } });
    apiMock.put.mockResolvedValue({ data: { message: 'Avis refusé' } });
    renderPage(<Reviews />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Refuser' }));
    const dialog = screen.getByRole('dialog', { name: 'Refuser cet avis' });
    const confirm = within(dialog).getByRole('button', { name: 'Refuser' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Motif communiqué/), 'Propos injurieux');
    await user.click(confirm);
    await waitFor(() => expect(apiMock.put).toHaveBeenCalledWith('/admin/reviews/r1/reject', { reason: 'Propos injurieux' }));
  });

  it('erreur du serveur affichée dans la fenêtre de confirmation', async () => {
    apiMock.get.mockResolvedValue({ data: { data: [REVIEW], meta: { total: 1, totalPages: 1 } } });
    apiMock.delete.mockRejectedValue({ response: { status: 404, data: { error: 'Avis introuvable' } } });
    renderPage(<Reviews />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Supprimer' }));
    const dialog = screen.getByRole('dialog', { name: 'Supprimer définitivement' });
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Avis introuvable');
  });
});

describe('litiges', () => {
  it('arbitrage : décision + justification envoyées, remboursement signalé', async () => {
    apiMock.get.mockResolvedValue({ data: { data: [{
      id: 'rep1', reason: 'no_show', description: 'Personne n’est venu', status: 'pending', createdAt: '2026-11-21T10:00:00.000Z',
      reporter: { email: 'client@example.test', profile: { firstName: 'Koffi', lastName: 'Yao' } },
      reported: { email: 'pro@example.test', profile: { firstName: 'Awa', lastName: 'Ndiaye' } },
      booking: { id: 'b9', status: 'disputed', amount: '15000', currency: 'XOF', transaction: { status: 'completed' } },
    }], meta: { total: 1, totalPages: 1 } } });
    apiMock.post.mockResolvedValue({ data: { message: 'Réservation annulée', status: 'cancelled', refundRequired: true } });
    renderPage(<Reports />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Arbitrer le litige' }));
    const dialog = screen.getByRole('dialog', { name: 'Arbitrer le litige' });
    expect(dialog).toHaveTextContent('payée');
    await user.click(within(dialog).getByLabelText(/Mission non réalisée/));
    await user.type(within(dialog).getByLabelText(/Justification/), 'Absence confirmée par le prestataire');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer la décision' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/admin/bookings/b9/resolve-dispute', {
      outcome: 'cancel', note: 'Absence confirmée par le prestataire',
    }));
    expect(await screen.findByText(/effectuez le remboursement/)).toBeInTheDocument();
    // Un litige ne se « résout » pas sans décision : pas de bouton générique.
  });
});

describe('utilisateurs et KYC', () => {
  const ROW = { id: 'u1', email: 'pro@example.test', phone: null, role: 'provider', status: 'pending', createdAt: '2026-11-01T00:00:00.000Z', profile: { firstName: 'Awa', lastName: 'Ndiaye' } };
  const DETAIL = { ...ROW, lastLoginAt: null, profile: { ...ROW.profile, idVerified: false, hasIdDocument: true, dateOfBirth: '1990-05-17T00:00:00.000Z' }, _count: { clientBookings: 0, providerBookings: 3, receivedReviews: 1 } };

  function mockUsers() {
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/admin/users') return Promise.resolve({ data: { data: [ROW], meta: { total: 1, totalPages: 1 } } });
      if (url === '/admin/users/u1') return Promise.resolve({ data: DETAIL });
      if (url === '/admin/users/u1/id-document') return Promise.resolve({ data: { url: 'https://api.cloudinary.com/v1_1/x/image/download?signature=abc', protectedDelivery: true } });
      return Promise.reject(new Error(url));
    });
  }

  it('consultation de la pièce par lien temporaire (nouvel onglet isolé)', async () => {
    mockUsers();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderPage(<Users />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ouvrir la fiche de Awa Ndiaye' }));
    await user.click(await screen.findByRole('button', { name: /Voir la pièce/ }));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://api.cloudinary.com/v1_1/x/image/download?signature=abc', '_blank', 'noopener,noreferrer'));
  });

  it('refus de la pièce : motif obligatoire', async () => {
    mockUsers();
    apiMock.post.mockResolvedValue({ data: { message: 'Identité rejetée', activated: false } });
    renderPage(<Users />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ouvrir la fiche de Awa Ndiaye' }));
    await user.click(await screen.findByRole('button', { name: 'Refuser la pièce' }));
    const dialog = screen.getByRole('dialog', { name: 'Refuser la pièce d’identité' });
    await user.type(within(dialog).getByLabelText(/Motif communiqué/), 'Document illisible');
    await user.click(within(dialog).getByRole('button', { name: 'Refuser' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/admin/users/u1/verify-id', { approved: false, comment: 'Document illisible' }));
  });

  it('suspension : motif obligatoire, erreur serveur affichée', async () => {
    mockUsers();
    apiMock.put.mockRejectedValue({ response: { status: 403, data: { error: 'Permission insuffisante', code: 'FORBIDDEN', missing: ['users.suspend'] } } });
    renderPage(<Users />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ouvrir la fiche de Awa Ndiaye' }));
    await user.click(await screen.findByRole('button', { name: 'Suspendre' }));
    const dialog = screen.getByRole('dialog', { name: 'Suspendre le compte' });
    await user.type(within(dialog).getByLabelText(/Motif/), 'Fraude avérée');
    await user.click(within(dialog).getByRole('button', { name: 'Suspendre' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Permission insuffisante (users.suspend).');
  });
});

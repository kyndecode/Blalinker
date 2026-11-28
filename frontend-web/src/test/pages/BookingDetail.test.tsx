import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
vi.mock('../../services/api', () => ({ default: apiMock }));

import BookingDetail from '../../pages/Booking/BookingDetail';
import { useAuthStore } from '../../store/authStore';

const CLIENT = 'c0000000-0000-0000-0000-000000000001';
const PROVIDER = 'p0000000-0000-0000-0000-000000000002';

function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1', clientId: CLIENT, providerId: PROVIDER, status: 'pending', scheduledAt: null, clientAddress: 'Cocody',
    description: 'Fuite sous l’évier', amount: '15000', currency: 'XOF', cancellationReason: null,
    client: { id: CLIENT, firstName: 'Koffi', lastName: 'Yao' },
    provider: { id: PROVIDER, firstName: 'Awa', lastName: 'Ndiaye', providerProfile: { businessName: 'Awa Plomberie' } },
    service: { title: 'Réparation fuite' }, transaction: null, review: null,
    ...overrides,
  };
}

function setup(as: 'client' | 'provider', data: Record<string, unknown>, onlinePayment = { available: false, provider: null, simulated: false }) {
  useAuthStore.setState({ user: { id: as === 'client' ? CLIENT : PROVIDER, role: as }, isAuthenticated: true } as never);
  apiMock.get.mockImplementation((url: string) => Promise.resolve({ data: url === '/site/config' ? { onlinePayment } : data }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/bookings/b1']}>
        <Routes><Route path="/bookings/:id" element={<BookingDetail />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('détail de réservation — actions selon le rôle et l’état', () => {
  beforeEach(() => {
    apiMock.put.mockResolvedValue({ data: {} });
    apiMock.post.mockResolvedValue({ data: { message: 'ok' } });
  });

  it('prestataire, demande en attente : accepter (avec confirmation) ou refuser', async () => {
    setup('provider', booking());
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Accepter' }));
    const dialog = screen.getByRole('dialog', { name: 'Accepter la demande' });
    await user.click(within(dialog).getByRole('button', { name: 'Accepter' }));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalledWith('/bookings/b1/accept', {}));
    expect(screen.getByRole('button', { name: 'Refuser' })).toBeInTheDocument();
    expect(screen.queryByTestId('payment-block')).not.toBeInTheDocument(); // le paiement concerne le client
  });

  it('client : paiement en ligne indisponible annoncé clairement, aucun bouton de paiement', async () => {
    setup('client', booking());
    const block = await screen.findByTestId('payment-block');
    expect(block).toHaveTextContent('pas encore disponible');
    expect(within(block).queryByRole('button')).not.toBeInTheDocument();
  });

  it('client : paiement en ligne actif → bouton de paiement', async () => {
    setup('client', booking(), { available: true, provider: 'cinetpay', simulated: false } as never);
    expect(await screen.findByRole('button', { name: 'Payer en ligne' })).toBeInTheDocument();
  });

  it('client, mission terminée : confirmer, signaler un problème, noter', async () => {
    setup('client', booking({ status: 'completed' }));
    expect(await screen.findByRole('button', { name: 'Confirmer la réalisation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Noter la prestation' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Signaler un problème' }));
    const dialog = screen.getByRole('dialog', { name: 'Signaler un problème' });
    const submit = within(dialog).getByRole('button', { name: 'Envoyer le signalement' });
    // Description obligatoire : l'envoi explique quoi faire et place le focus sur le champ, sans appel API.
    await user.click(submit);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Décrivez ce qui s’est passé (10 caractères minimum).');
    const description = within(dialog).getByLabelText('Que s’est-il passé ?');
    expect(description).toHaveFocus();
    expect(description).toHaveAttribute('aria-invalid', 'true');
    expect(apiMock.put).not.toHaveBeenCalled();
    await user.type(description, 'Travail inachevé, fuite toujours présente');
    await user.click(submit);
    await waitFor(() => expect(apiMock.put).toHaveBeenCalledWith('/bookings/b1/dispute', {
      reason: 'other', description: 'Travail inachevé, fuite toujours présente',
    }));
  });

  it('avis : note obligatoire puis envoi', async () => {
    setup('client', booking({ status: 'validated' }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Noter la prestation' }));
    const dialog = screen.getByRole('dialog', { name: 'Noter la prestation' });
    // Sans note : message précis, focus sur la première étoile, rien d'envoyé.
    await user.click(within(dialog).getByRole('button', { name: 'Envoyer mon avis' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Choisissez une note de 1 à 5 étoiles.');
    expect(within(dialog).getByRole('radio', { name: '1 sur 5' })).toHaveFocus();
    expect(apiMock.post).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('radio', { name: '4 sur 5' }));
    await user.click(within(dialog).getByRole('button', { name: 'Envoyer mon avis' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/reviews', { bookingId: 'b1', rating: 4 }));
  });

  it('avis déjà laissé : statut de modération affiché, plus de bouton', async () => {
    setup('client', booking({ status: 'validated', review: { id: 'r1', rating: 5, status: 'pending' } }));
    expect(await screen.findByText(/en attente de vérification/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Noter la prestation' })).not.toBeInTheDocument();
  });

  it('erreur métier du serveur affichée dans la fenêtre (pas de message générique)', async () => {
    apiMock.put.mockRejectedValueOnce({ response: { status: 409, data: { error: 'Action impossible dans l’état actuel de la réservation.', code: 'BOOKING_STATUS_CONFLICT' } } });
    setup('provider', booking({ status: 'accepted' }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Démarrer la mission' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Démarrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Action impossible dans l’état actuel de la réservation.');
  });

  it('litige : bandeau d’information, aucune action de validation', async () => {
    setup('client', booking({ status: 'disputed' }));
    expect(await screen.findByText(/Litige en cours d’examen/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmer la réalisation' })).not.toBeInTheDocument();
  });
});

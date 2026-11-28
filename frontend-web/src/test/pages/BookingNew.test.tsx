/**
 * Demande de réservation (contre-audit du 28/11/2026) : la date saisie (heure locale) doit partir
 * au format ISO complet exigé par l'API. Avant : valeur brute « 2026-12-01T10:00 » refusée
 * (« Date invalide »), aucune réservation ne pouvait aboutir depuis le site.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../services/api', () => ({ default: apiMock, api: apiMock }));

import BookingNew from '../../pages/Booking/BookingNew';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/bookings/new?provider=p1']}>
        <Routes><Route path="/bookings/new" element={<BookingNew />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.post.mockReset();
  apiMock.get.mockResolvedValue({ data: { id: 'p1', firstName: 'Awa', lastName: 'Koné', services: [{ id: 's1', title: 'Plomberie', price: 15000 }] } });
});

describe('nouvelle réservation', () => {
  it('date envoyée au format ISO (heure locale convertie), réservation enregistrée', async () => {
    apiMock.post.mockResolvedValue({ data: { id: 'b9' } });
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('option', { name: /Plomberie/ });
    const date = screen.getByLabelText(/Date et heure/);
    await user.clear(date);
    await user.type(date, '2030-06-15T10:30');
    await user.type(screen.getByLabelText(/Adresse d'intervention/), 'Cocody, rue des Jardins');
    await user.type(screen.getByLabelText(/Description/), 'Fuite sous l’évier de la cuisine.');
    await user.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    const [, body] = apiMock.post.mock.calls[0];
    expect(body.scheduledAt).toBe(new Date('2030-06-15T10:30').toISOString());
    expect(body.scheduledAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('refus du serveur sur la date : message sous le champ date, pas de faux succès', async () => {
    apiMock.post.mockRejectedValue({ response: { status: 422, data: { error: 'Données invalides', errors: { scheduledAt: ['La date doit être dans le futur.'] } } } });
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('option', { name: /Plomberie/ });
    await user.type(screen.getByLabelText(/Date et heure/), '2030-06-15T10:30');
    await user.type(screen.getByLabelText(/Adresse d'intervention/), 'Cocody, rue des Jardins');
    await user.type(screen.getByLabelText(/Description/), 'Fuite sous l’évier de la cuisine.');
    await user.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    expect(await screen.findByText('La date doit être dans le futur.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Date et heure/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(/a été envoyée/)).not.toBeInTheDocument();
  });
});

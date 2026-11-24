import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: { get: vi.fn(), patch: vi.fn() } }));
vi.mock('../../services/api', () => ({ default: apiMock }));

import NotificationBell from '../../components/notifications/NotificationBell';

const LIST = {
  data: [
    { id: 'n1', type: 'booking.accepted', title: 'Réservation acceptée', body: 'Le prestataire a accepté.', data: { link: '/bookings/b1' }, isRead: false, createdAt: new Date().toISOString() },
    { id: 'n2', type: 'review.published', title: 'Votre avis est publié', body: null, data: { link: 'https://evil.example' }, isRead: true, createdAt: '2026-01-01T00:00:00.000Z' },
  ],
  meta: { page: 1, totalPages: 1, total: 2 },
  unreadCount: 1,
};

function setup() {
  apiMock.get.mockResolvedValue({ data: LIST });
  apiMock.patch.mockResolvedValue({ data: {} });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><NotificationBell /></MemoryRouter></QueryClientProvider>);
}

describe('cloche de notifications', () => {
  it('nombre de non-lues annoncé (badge et libellé accessible)', async () => {
    setup();
    expect(await screen.findByTestId('unread-badge')).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'Notifications, 1 non lue' })).toBeInTheDocument();
  });

  it('ouvrir une notification : marquée lue et navigation vers la réservation', async () => {
    setup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Notifications, 1 non lue/ }));
    await user.click(screen.getByRole('button', { name: /Réservation acceptée/ }));
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith('/notifications/n1/read'));
    expect(vi.mocked(useNavigate)()).toHaveBeenCalledWith('/bookings/b1');
  });

  it('lien externe ignoré', async () => {
    setup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    await user.click(screen.getByRole('button', { name: /Votre avis est publié/ }));
    expect(vi.mocked(useNavigate)()).not.toHaveBeenCalledWith('https://evil.example');
    expect(apiMock.patch).not.toHaveBeenCalled(); // déjà lue
  });

  it('tout marquer comme lu', async () => {
    setup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    await user.click(screen.getByRole('button', { name: 'Tout marquer comme lu' }));
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith('/notifications/read-all'));
  });
});

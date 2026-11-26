import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('../services/api', () => ({ default: apiMock }));

import ExportButton from '../components/ui/ExportButton';
import TrendsPanel from '../components/TrendsPanel';
import Reviews from '../pages/Reviews';
import Bookings from '../pages/Bookings';
import { ToastProvider } from '../components/ui/Toast';
import { useAdminAuthStore } from '../store/adminAuthStore';

function renderUi(ui: JSX.Element) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><ToastProvider>{ui}</ToastProvider></MemoryRouter></QueryClientProvider>);
}
function asAdmin(permissions: string[]) {
  useAdminAuthStore.setState({ user: { id: 'u1', email: 'membre@example.test', role: 'admin' }, isAuthenticated: true, accessToken: 't', refreshToken: null });
  return permissions;
}

describe('export CSV', () => {
  it('masqué sans la permission « exports.run »', async () => {
    const perms = asAdmin(['bookings.read']);
    apiMock.get.mockImplementation((url: string) => Promise.resolve({ data: url === '/users/me' ? { permissions: perms } : {} }));
    renderUi(<ExportButton dataset="bookings" />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith('/users/me'));
    expect(screen.queryByRole('button', { name: /Exporter/ })).not.toBeInTheDocument();
  });

  it('téléchargement avec les filtres actifs (valeurs vides retirées)', async () => {
    const perms = asAdmin(['exports.run', 'bookings.read']);
    const createUrl = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() });
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/users/me') return Promise.resolve({ data: { permissions: perms } });
      return Promise.resolve({ data: new Blob(['id;statut\r\n']), headers: { 'content-disposition': 'attachment; filename="bla-bookings-2026-11-25.csv"', 'x-export-rows': '1' } });
    });
    renderUi(<ExportButton dataset="bookings" params={{ status: 'validated', search: '' }} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: /Exporter/ }));
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith('/admin/exports/bookings', { params: { status: 'validated' }, responseType: 'blob' }));
    expect(createUrl).toHaveBeenCalled();
    expect(await screen.findByText('Export téléchargé (1 lignes).')).toBeInTheDocument();
  });

  it('refus du serveur (réponse Blob) : message lisible', async () => {
    const perms = asAdmin(['exports.run']);
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/users/me') return Promise.resolve({ data: { permissions: perms } });
      return Promise.reject({ response: { status: 403, data: new Blob([JSON.stringify({ error: 'Permission insuffisante', missing: ['users.read'] })]) } });
    });
    renderUi(<ExportButton dataset="users" />);
    await userEvent.setup().click(await screen.findByRole('button', { name: /Exporter/ }));
    expect(await screen.findByText('Permission insuffisante (users.read).')).toBeInTheDocument();
  });
});

describe('tendances réelles', () => {
  it('variation affichée seulement avec une période de référence', async () => {
    apiMock.get.mockResolvedValue({ data: {
      metrics: [
        { key: 'signups', current: 12, previous: 10, deltaPercent: 20 },
        { key: 'bookings', current: 4, previous: 0, deltaPercent: null },
        { key: 'revenue', current: 150000, previous: 200000, deltaPercent: -25 },
      ],
      daily: Array.from({ length: 30 }, (_, i) => ({ day: `2026-11-${String(i + 1).padStart(2, '0')}`, signups: i % 3, bookings: i % 2 })),
      currency: 'XOF',
    } });
    renderUi(<TrendsPanel />);
    expect(await screen.findByTestId('trend-signups')).toHaveTextContent('+20 %');
    expect(screen.getByTestId('trend-bookings')).toHaveTextContent('Pas de référence');
    expect(screen.getByTestId('trend-revenue')).toHaveTextContent('-25 %');
    expect(screen.getByRole('table', { name: 'Activité quotidienne' })).toBeInTheDocument();
  });
});

describe('modération groupée', () => {
  it('sélectionner tout puis publier : un seul appel groupé', async () => {
    const row = (id: string) => ({
      id, rating: 4, comment: `Avis ${id}`, response: null, flagReason: null, createdAt: '2026-11-20T00:00:00.000Z', moderation: 'pending',
      client: { email: 'c@example.test', firstName: 'Awa', lastName: id }, provider: { email: 'p@example.test', firstName: 'Pro', lastName: 'X' },
    });
    apiMock.get.mockResolvedValue({ data: { data: [row('r1'), row('r2')], meta: { total: 2, totalPages: 1 } } });
    apiMock.post.mockResolvedValue({ data: { updated: 2, skipped: 0 } });
    renderUi(<Reviews />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Tout sélectionner'));
    expect(screen.getByText('2 sélectionné(s)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publier la sélection' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/admin/reviews/bulk', { ids: ['r1', 'r2'], action: 'approve' }));
    expect(await screen.findByText('2 avis traité(s)')).toBeInTheDocument();
  });

  it('refus groupé : motif obligatoire', async () => {
    apiMock.get.mockResolvedValue({ data: { data: [{
      id: 'r1', rating: 1, comment: 'x', response: null, flagReason: null, createdAt: '2026-11-20T00:00:00.000Z', moderation: 'pending',
      client: { firstName: 'A', lastName: 'B' }, provider: { firstName: 'C', lastName: 'D' },
    }], meta: { total: 1, totalPages: 1 } } });
    apiMock.post.mockResolvedValue({ data: { updated: 1, skipped: 0 } });
    renderUi(<Reviews />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Sélectionner l’avis de A B'));
    await user.click(screen.getByRole('button', { name: 'Refuser la sélection' }));
    const dialog = screen.getByRole('dialog', { name: 'Refuser 1 avis' });
    expect(within(dialog).getByRole('button', { name: 'Refuser la sélection' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Motif/), 'Insultes');
    await user.click(within(dialog).getByRole('button', { name: 'Refuser la sélection' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/admin/reviews/bulk', { ids: ['r1'], action: 'reject', reason: 'Insultes' }));
  });
});

describe('filtres serveur', () => {
  it('réservations : statut et tri transmis au serveur, page remise à 1', async () => {
    apiMock.get.mockResolvedValue({ data: { data: [], meta: { total: 0, totalPages: 1 } } });
    renderUi(<Bookings />);
    const user = userEvent.setup();
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    await user.selectOptions(screen.getByLabelText('Statut'), 'disputed');
    await user.selectOptions(screen.getByLabelText('Tri'), 'amount:desc');
    await waitFor(() => expect(apiMock.get).toHaveBeenLastCalledWith('/admin/bookings', { params: { sort: 'amount:desc', status: 'disputed', page: '1', limit: '20' } }));
    expect(screen.getByText('Aucune réservation ne correspond.')).toBeInTheDocument();
  });
});

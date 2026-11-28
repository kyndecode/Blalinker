/**
 * Interactions de l'administration (audit du 27/11/2026) : champs en erreur signalés et focalisés,
 * messages précis (plus de message générique), confirmations réelles, fenêtres accessibles,
 * explication après une fin de session.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() }));
vi.mock('../services/api', () => ({ default: apiMock }));

import AdminLogin from '../pages/Login';
import Team from '../pages/Team';
import Modal from '../components/ui/Modal';
import { ToastProvider } from '../components/ui/Toast';
import { useAdminAuthStore } from '../store/adminAuthStore';
import { ADMIN_NOTICE_KEY } from '../services/sessionNotice';

const httpError = (status: number, data: Record<string, unknown> = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });

beforeEach(() => {
  Object.values(apiMock).forEach((m) => m.mockReset());
  useAdminAuthStore.getState().logout();
});
afterEach(() => { sessionStorage.clear(); });

describe('connexion à l’administration', () => {
  it('envoi vide : champs signalés et reliés à leur message, focus sur le premier, aucun appel', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AdminLogin /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    const email = screen.getByLabelText('Email administrateur');
    const password = screen.getByLabelText('Mot de passe');
    await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'));
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Saisissez votre adresse e-mail.');
    expect(password).toHaveAccessibleDescription('Saisissez votre mot de passe.');
    expect(email).toHaveFocus();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('fin de session imposée : la page de connexion explique pourquoi', () => {
    sessionStorage.setItem(ADMIN_NOTICE_KEY, 'Votre session a expiré. Veuillez vous reconnecter.');
    render(<MemoryRouter><AdminLogin /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('Votre session a expiré. Veuillez vous reconnecter.');
    expect(sessionStorage.getItem(ADMIN_NOTICE_KEY)).toBeNull(); // affiché une seule fois
  });
});

describe('équipe : création d’un membre', () => {
  function renderTeam() {
    apiMock.get.mockImplementation(async (url: string) => (url === '/admin/team/meta'
      ? { data: { permissions: ['users.read'], presets: [{ key: 'support', label: 'Support', permissions: ['users.read'] }] } }
      : { data: { data: [] } }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><ToastProvider><Team /></ToastProvider></MemoryRouter></QueryClientProvider>);
  }

  async function openAndFill(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: /Nouveau membre/ }));
    const dialog = screen.getByRole('dialog', { name: 'Nouveau membre admin' });
    await user.type(within(dialog).getByLabelText(/Prénom/), 'Awa');
    await user.type(within(dialog).getByLabelText(/^Nom/), 'Koné');
    await user.type(within(dialog).getByLabelText(/E-mail/), 'awa@example.test');
    await user.type(within(dialog).getByLabelText(/Mot de passe provisoire/), 'court');
    return dialog;
  }

  it('refus du serveur : message sous le champ concerné, champ focalisé, saisie conservée (avant : message générique)', async () => {
    apiMock.post.mockRejectedValue(httpError(422, { errors: { password: ['Mot de passe : 10 caractères minimum.'] } }));
    const user = userEvent.setup();
    renderTeam();
    const dialog = await openAndFill(user);
    await user.click(within(dialog).getByRole('button', { name: 'Créer le membre' }));
    const password = within(dialog).getByLabelText(/Mot de passe provisoire/);
    expect(await within(dialog).findByText('Mot de passe : 10 caractères minimum.')).toBeInTheDocument();
    expect(password).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(password).toHaveFocus());
    expect(within(dialog).getByLabelText(/E-mail/)).toHaveValue('awa@example.test');
    expect(screen.queryByText(/Vérifiez les champs/)).not.toBeInTheDocument();
  });

  it('permission refusée : le vrai motif, pas un message sur les champs', async () => {
    apiMock.post.mockRejectedValue(httpError(403, { error: 'Réservé au super administrateur.' }));
    const user = userEvent.setup();
    renderTeam();
    const dialog = await openAndFill(user);
    await user.click(within(dialog).getByRole('button', { name: 'Créer le membre' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Réservé au super administrateur.');
  });

  it('succès confirmé par le serveur : fenêtre fermée et confirmation affichée', async () => {
    apiMock.post.mockResolvedValue({ data: { id: 'm1' } });
    const user = userEvent.setup();
    renderTeam();
    const dialog = await openAndFill(user);
    await user.click(within(dialog).getByRole('button', { name: 'Créer le membre' }));
    expect(await screen.findByText(/Membre créé/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('fenêtres de l’administration', () => {
  it('Tab reste dans la fenêtre ; le focus ne saute pas quand la page se redessine ; Échap ferme', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const ui = (close: () => void) => (
      <Modal open title="Modifier" onClose={close}>
        <input aria-label="Nom" />
        <button type="button">Enregistrer</button>
      </Modal>
    );
    const { rerender } = render(ui(onClose));
    // Le premier élément est le bouton de fermeture : on part du champ.
    screen.getByLabelText('Nom').focus();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    screen.getByRole('button', { name: 'Enregistrer' }).focus();
    rerender(ui(() => onClose()));
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

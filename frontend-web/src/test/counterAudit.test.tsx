/**
 * Contre-audit indépendant (28/11/2026), cycle 2 : défauts reproduits dans le code ajouté
 * précédemment, corrigés puis verrouillés par ces tests.
 */
import axios from 'axios';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshAccessToken } from '../services/api';
import { endLocalSession } from '../services/session';
import { useAuthStore } from '../store/authStore';
import ScrollManager from '../components/layout/ScrollManager';
import { AppErrorBoundary } from '../components/common/PageErrorBoundary';
import { tr } from './tr';

afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.getState().logout();
});

describe('session : déconnexion pendant un renouvellement', () => {
  it('le renouvellement arrivé après « Se déconnecter » ne réinstalle pas la session et la ferme côté serveur', async () => {
    useAuthStore.setState({ accessToken: null, isAuthenticated: false, user: { id: 'u1', role: 'client' } } as never);
    let answer!: (v: unknown) => void;
    const post = vi.spyOn(axios, 'post').mockImplementation((url: string) => (url.endsWith('/auth/refresh-token')
      ? new Promise((resolve) => { answer = resolve; })
      : Promise.resolve({ data: {} })) as never);
    const pending = refreshAccessToken().catch((e) => e);
    endLocalSession(); // clic sur « Se déconnecter » pendant le renouvellement
    answer({ data: { accessToken: 'jeton-tardif' } });
    await pending;
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
    // La session ouverte par ce renouvellement tardif est fermée côté serveur.
    expect(post).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/logout$/),
      {},
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer jeton-tardif' }) }),
    );
  });
});

describe('navigation : ancre mal encodée', () => {
  it('« #%E0%A4%A » : aucune erreur, la page reste affichée (avant : site entièrement blanc)', () => {
    expect(() => render(
      <MemoryRouter initialEntries={['/about#%E0%A4%A']}>
        <ScrollManager />
        <p>Contenu de la page</p>
      </MemoryRouter>,
    )).not.toThrow();
    expect(screen.getByText('Contenu de la page')).toBeInTheDocument();
  });
});

describe('filet de sécurité de l’application', () => {
  it('une erreur hors des pages (en-tête…) affiche un message et des issues, pas une page blanche', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Broken = () => { throw new Error('erreur dans l’en-tête'); };
    render(<AppErrorBoundary><Broken /></AppErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent(tr('errors.page_title'));
  });
});

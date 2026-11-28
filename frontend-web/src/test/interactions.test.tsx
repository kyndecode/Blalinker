/**
 * Interactions et guidage (audit du 27/11/2026) : erreurs comprises et localisées, navigation qui
 * mène au bon endroit et ouvre la page en haut, session jamais perdue par une course, fenêtres
 * accessibles. Chaque test correspond à une anomalie reproduite avant correction.
 */
import axios, { AxiosError, type AxiosAdapter } from 'axios';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api, { refreshAccessToken } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { queryClient } from '../services/queryClient';
import { classifyApiError, getApiErrorMessage } from '../utils/apiError';
import ScrollManager from '../components/layout/ScrollManager';
import { FormMessage } from '../components/common/FormMessage';
import { Modal } from '../components/common/Modal';
import ForgotPassword from '../pages/Auth/ForgotPassword';
import Header from '../components/layout/Header';
import { tr } from './tr';
import { RatingStars } from '../components/common/RatingStars';
import PageErrorBoundary from '../components/common/PageErrorBoundary';

const httpError = (status: number, data: Record<string, unknown> = {}) =>
  Object.assign(new AxiosError(`HTTP ${status}`, 'ERR_BAD_REQUEST'), { response: { status, data } });

afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.getState().logout();
  sessionStorage.clear();
});

describe('erreurs de l’API : un message précis par situation', () => {
  it('classe chaque erreur, sans détail technique', () => {
    expect(classifyApiError(new AxiosError('Network Error', 'ERR_NETWORK'))).toMatchObject({ kind: 'network', message: tr('errors.network') });
    expect(classifyApiError(new AxiosError('timeout', 'ECONNABORTED'))).toMatchObject({ kind: 'timeout', message: tr('errors.timeout') });
    expect(classifyApiError(httpError(401, { error: 'Identifiants incorrects' }))).toMatchObject({ kind: 'auth', message: 'Identifiants incorrects' });
    expect(classifyApiError(Object.assign(httpError(401), { sessionExpired: true }))).toMatchObject({ kind: 'session_expired', message: tr('errors.session_expired') });
    expect(classifyApiError(httpError(403, { error: 'Permission insuffisante' }))).toMatchObject({ kind: 'forbidden', message: tr('errors.forbidden') });
    expect(classifyApiError(httpError(404))).toMatchObject({ kind: 'not_found', message: tr('errors.not_found_item') });
    expect(classifyApiError(httpError(409, { error: 'Réservation déjà acceptée.' }))).toMatchObject({ kind: 'conflict', message: 'Réservation déjà acceptée.' });
    expect(classifyApiError(httpError(429))).toMatchObject({ kind: 'rate_limit', message: tr('errors.rate_limit') });
    expect(classifyApiError(httpError(500, { error: 'TypeError: x is undefined' }))).toMatchObject({ kind: 'server', message: tr('errors.server') });
    expect(classifyApiError(httpError(502))).toMatchObject({ kind: 'unavailable' });
  });

  it('validation (422) : message par champ, le premier sert de résumé', () => {
    const c = classifyApiError(httpError(422, { error: 'Données invalides', errors: { email: ['Email invalide'], phone: ['Numéro invalide'] } }));
    expect(c.kind).toBe('validation');
    expect(c.fieldErrors).toEqual({ email: 'Email invalide', phone: 'Numéro invalide' });
    expect(c.message).toBe('Email invalide');
  });

  it('un message de repli contextuel remplace seulement un message générique', () => {
    expect(getApiErrorMessage(httpError(500), 'La demande n’a pas pu être envoyée.')).toBe('La demande n’a pas pu être envoyée.');
    expect(getApiErrorMessage(httpError(409, { error: 'Déjà annulée.' }), 'repli')).toBe('Déjà annulée.');
  });
});

describe('session : connexion, renouvellement, expiration', () => {
  let calls: string[];
  beforeEach(() => {
    calls = [];
    const adapter: AxiosAdapter = async (config) => {
      calls.push(config.url ?? '');
      throw httpError(401, { error: 'Identifiants incorrects' });
    };
    api.defaults.adapter = adapter;
  });

  it('mauvais mot de passe : le vrai message, aucun renouvellement de session (avant : « Refresh token manquant »)', async () => {
    const refresh = vi.spyOn(axios, 'post');
    const error = await api.post('/auth/login', { email: 'a@example.test', password: 'faux' }).catch((e) => e);
    expect(getApiErrorMessage(error)).toBe('Identifiants incorrects');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('renouvellements simultanés (démarrage de page exécuté deux fois, requêtes en 401) : UNE seule requête', async () => {
    let resolve!: (v: unknown) => void;
    const post = vi.spyOn(axios, 'post').mockReturnValue(new Promise((r) => { resolve = r; }) as never);
    const a = refreshAccessToken();
    const b = refreshAccessToken();
    resolve({ data: { accessToken: 'nouveau' } });
    await expect(Promise.all([a, b])).resolves.toEqual(['nouveau', 'nouveau']);
    expect(post).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().accessToken).toBe('nouveau');
  });

  it('course avec un autre onglet (409) : nouvel essai avec le cookie déjà remplacé, pas de déconnexion', async () => {
    const post = vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(httpError(409, { code: 'REFRESH_RACE' }))
      .mockResolvedValueOnce({ data: { accessToken: 'apres-course' } } as never);
    await expect(refreshAccessToken()).resolves.toBe('apres-course');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('session refusée par le serveur : fin de session et message « session expirée » sur la page de connexion', async () => {
    useAuthStore.setState({ accessToken: 'expire', isAuthenticated: true, user: { id: 'u1', role: 'client' } } as never);
    vi.spyOn(axios, 'post').mockRejectedValue(httpError(401, { code: 'SESSION_CLOSED' }));
    const error = await api.get('/users/me').catch((e) => e);
    expect(classifyApiError(error).kind).toBe('session_expired');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(sessionStorage.getItem('bla_flash_notice')).toBe(tr('errors.session_expired'));
  });
});

describe('navigation : la page s’ouvre en haut, les sections sont atteintes', () => {
  function Shell() {
    const [show, setShow] = useState(false);
    const location = useLocation();
    return (
      <>
        <ScrollManager />
        <Link to="/contact">Contact</Link>
        <Link to="/aide#paiement">Paiement</Link>
        <Link to="/contact?onglet=2">Filtre</Link>
        <output data-testid="url">{location.pathname + location.search}</output>
        <button type="button" onClick={() => setShow(true)}>Charger</button>
        <Routes>
          <Route path="/" element={<p>Accueil</p>} />
          <Route path="/contact" element={<p>Page contact</p>} />
          <Route path="/aide" element={show ? <h2 id="paiement">Paiement</h2> : <p>Chargement…</p>} />
        </Routes>
      </>
    );
  }

  it('changement de page : retour en haut (avant : ouverte au niveau de défilement précédent)', async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    render(<MemoryRouter initialEntries={['/']}><Shell /></MemoryRouter>);
    scrollTo.mockClear();
    await userEvent.click(screen.getByRole('link', { name: 'Contact' }));
    expect(await screen.findByText('Page contact')).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    // Même page, autres paramètres (filtre) : pas de saut en haut.
    scrollTo.mockClear();
    await userEvent.click(screen.getByRole('link', { name: 'Filtre' }));
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('/contact?onglet=2'));
    expect(scrollTo).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('lien vers une section chargée plus tard : défilement dès qu’elle apparaît, focus donné', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<MemoryRouter initialEntries={['/']}><Shell /></MemoryRouter>);
    await userEvent.click(screen.getByRole('link', { name: 'Paiement' }));
    expect(scrollIntoView).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Charger' }));
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'Paiement' })).toHaveFocus();
  });

  it('menu principal : chaque entrée mène à la bonne page', () => {
    useAuthStore.getState().setTokens('jeton');
    useAuthStore.getState().setUser({ id: 'u1', role: 'client' });
    render(<QueryClientProvider client={queryClient}><MemoryRouter><Header /></MemoryRouter></QueryClientProvider>);
    const expected: Array<[string, string]> = [
      [tr('nav.home'), '/'], [tr('nav.search'), '/search'], [tr('nav.about'), '/about'],
      [tr('nav.contact'), '/contact'], [tr('nav.dashboard'), '/dashboard'],
    ];
    for (const [name, href] of expected) {
      const links = screen.getAllByRole('link', { name });
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) expect(link).toHaveAttribute('href', href);
    }
  });
});

describe('formulaires : erreur localisée, valeurs conservées, pas de double envoi', () => {
  const renderForgot = () => render(<MemoryRouter><ForgotPassword /></MemoryRouter>);

  it('envoi vide : message sous le champ, champ signalé, focus dessus, aucun appel', async () => {
    const post = vi.spyOn(api, 'post');
    renderForgot();
    const button = screen.getByRole('button', { name: tr('auth.send_code') });
    button.focus();
    await userEvent.click(button);
    const field = screen.getByLabelText(new RegExp(tr('auth.phone_or_email')));
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(tr('errors.identifier_required'))).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-describedby', expect.stringContaining('error'));
    await waitFor(() => expect(field).toHaveFocus());
    expect(post).not.toHaveBeenCalled();
  });

  it('erreur réseau : message compréhensible, saisie conservée, bouton rendu', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    renderForgot();
    const field = screen.getByLabelText(new RegExp(tr('auth.phone_or_email')));
    await userEvent.type(field, 'awa@example.test');
    await userEvent.click(screen.getByRole('button', { name: tr('auth.send_code') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('errors.network'));
    expect(field).toHaveValue('awa@example.test');
    expect(screen.getByRole('button', { name: tr('auth.send_code') })).toBeEnabled();
    // Aucun faux message de succès.
    expect(screen.queryByText(tr('auth.reset_code_sent'))).not.toBeInTheDocument();
  });

  it('erreur de validation du serveur : affichée sous le bon champ', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(httpError(422, { errors: { email: ['Adresse e-mail inconnue du format attendu'] } }));
    renderForgot();
    const field = screen.getByLabelText(new RegExp(tr('auth.phone_or_email')));
    await userEvent.type(field, 'awa@');
    await userEvent.click(screen.getByRole('button', { name: tr('auth.send_code') }));
    expect(await screen.findByText('Adresse e-mail inconnue du format attendu')).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  it('double clic : une seule requête', async () => {
    let resolve!: (v: unknown) => void;
    const post = vi.spyOn(api, 'post').mockReturnValue(new Promise((r) => { resolve = r; }) as never);
    renderForgot();
    await userEvent.type(screen.getByLabelText(new RegExp(tr('auth.phone_or_email'))), 'awa@example.test');
    const button = screen.getByRole('button', { name: tr('auth.send_code') });
    fireEvent.submit(button.closest('form')!);
    fireEvent.submit(button.closest('form')!);
    expect(post).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ data: {} }); });
    // Succès confirmé par le serveur : message réel et étape suivante.
    expect(await screen.findByText(tr('auth.reset_code_sent'))).toBeInTheDocument();
  });
});

describe('messages et fenêtres', () => {
  it('message général : annoncé, visible et focalisé à son apparition (bouton en bas d’un long formulaire)', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { rerender } = render(<FormMessage tone="error">{null}</FormMessage>);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    rerender(<FormMessage tone="error">Votre session a expiré.</FormMessage>);
    expect(screen.getByRole('alert')).toHaveTextContent('Votre session a expiré.');
    expect(screen.getByRole('alert')).toHaveFocus();
    rerender(<FormMessage tone="success">Votre profil a été mis à jour.</FormMessage>);
    expect(screen.getByRole('status')).toHaveTextContent('Votre profil a été mis à jour.');
  });

  it('fenêtre : Tab reste dans la fenêtre ; le focus ne saute pas quand la page se redessine', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Modal open title="Annuler" onClose={() => {}}>
        <input aria-label="Motif" />
        <button type="button">Valider</button>
      </Modal>,
    );
    const motif = screen.getByLabelText('Motif');
    expect(motif).toHaveFocus();
    await user.tab();
    await user.tab(); // après le dernier élément : retour au premier, jamais sur la page derrière
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    // Nouvelle fonction onClose à chaque rendu (cas des pages) : le focus reste où il est.
    screen.getByRole('button', { name: 'Valider' }).focus();
    rerender(
      <Modal open title="Annuler" onClose={() => {}}>
        <input aria-label="Motif" />
        <button type="button">Valider</button>
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'Valider' })).toHaveFocus();
  });
});

describe('affichage robuste : jamais de page blanche', () => {
  it('note reçue en texte (décimal de la base) : affichée, sans plantage (avant : carte entièrement vide)', () => {
    render(<RatingStars rating={'4.6' as unknown as number} count={12} />);
    expect(screen.getByText('4.6')).toBeInTheDocument();
    expect(screen.getByLabelText('Note : 4.6 sur 5, 12 avis')).toBeInTheDocument();
  });

  it('erreur d’affichage d’une page : message et issues claires au lieu d’une page blanche', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Broken = () => { throw new Error('donnée inattendue'); };
    render(<MemoryRouter><PageErrorBoundary><Broken /></PageErrorBoundary></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent(tr('errors.page_title'));
    expect(screen.getByRole('button', { name: tr('errors.page_reload') })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: tr('content_page.back_home') })).toHaveAttribute('href', '/');
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock('../../services/api', () => ({ default: { get: getMock } }));

import Markdown, { safeHref } from '../../components/content/Markdown';
import ManagedPage from '../../components/content/ManagedPage';
import AnnouncementBar from '../../components/content/AnnouncementBar';
import FaqPage from '../../pages/Help/FaqPage';
import { tr } from '../tr';

function wrap(ui: JSX.Element) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}

describe('Markdown restreint (aucun HTML interprété)', () => {
  it('titres, listes, gras, liens sûrs', () => {
    render(<MemoryRouter><Markdown source={'## Éditeur\n\nTexte **important** et [contact](mailto:contact@blalinker.com).\n\n- un\n- deux\n\n[Aide](/help)'} /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 2, name: 'Éditeur' })).toBeInTheDocument();
    expect(screen.getByText('important').tagName).toBe('STRONG');
    expect(screen.getByRole('link', { name: 'contact' })).toHaveAttribute('href', 'mailto:contact@blalinker.com');
    expect(screen.getByRole('link', { name: 'Aide' })).toHaveAttribute('href', '/help');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('HTML affiché comme du texte ; liens dangereux neutralisés', () => {
    const { container } = render(<MemoryRouter><Markdown source={'<img src=x onerror=alert(1)><script>alert(1)</script>\n\n[piège](javascript:alert(1)) [proto](//evil.example) ![img](http://insecure.example/a.png)'} /></MemoryRouter>);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.textContent).toContain('piège');
  });

  it('safeHref', () => {
    expect(safeHref('https://blalinker.com')).toEqual({ href: 'https://blalinker.com', internal: false });
    expect(safeHref('/terms')).toEqual({ href: '/terms', internal: true });
    for (const bad of ['javascript:alert(1)', '//evil.example', 'http://x.example', 'data:text/html,x', 'vbscript:x']) {
      expect(safeHref(bad)).toBeNull();
    }
  });
});

describe('pages administrables', () => {
  it('version publiée affichée quand elle existe', async () => {
    getMock.mockResolvedValue({ data: { slug: 'terms', locale: 'fr', title: 'CGU publiées', summary: null, body: '## Article 1\n\nTexte.', updatedAt: '2026-11-25T00:00:00.000Z' } });
    wrap(<ManagedPage slug="terms" fallback={<p>Texte intégré</p>} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'CGU publiées' })).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith('/site/pages/terms', { params: { locale: 'fr' } });
    expect(screen.queryByText('Texte intégré')).not.toBeInTheDocument();
  });

  it('aucune page publiée (404) ou API indisponible : texte intégré, jamais de page vide', async () => {
    getMock.mockRejectedValue({ response: { status: 404 } });
    wrap(<ManagedPage slug="terms" fallback={<p>Texte intégré</p>} />);
    expect(await screen.findByText('Texte intégré')).toBeInTheDocument();
  });

  it('FAQ : questions publiées prioritaires, sinon questions intégrées', async () => {
    getMock.mockResolvedValue({ data: { items: [{ id: 'f1', category: null, question: 'Comment réserver ?', answer: 'Depuis la **fiche** du prestataire.' }] } });
    wrap(<FaqPage />);
    expect(await screen.findByText('Comment réserver ?')).toBeInTheDocument();
    expect(screen.queryByText(tr('faq.q1.question'))).not.toBeInTheDocument();
  });

  it('FAQ vide côté administration : questions intégrées', async () => {
    getMock.mockResolvedValue({ data: { items: [] } });
    wrap(<FaqPage />);
    await waitFor(() => expect(getMock).toHaveBeenCalled());
    expect(screen.getByText(tr('faq.q1.question'))).toBeInTheDocument();
  });
});

describe('bannière d’annonce', () => {
  it('affichée puis masquée durablement sur cet appareil', async () => {
    localStorage.clear();
    getMock.mockResolvedValue({ data: { items: [{ id: 'a1', message: 'Maintenance dimanche 2h-4h', linkUrl: '/help', linkLabel: 'Détails', level: 'warning', updatedAt: '2026-11-25T00:00:00.000Z' }] } });
    const { unmount } = wrap(<AnnouncementBar />);
    expect(await screen.findByText(/Maintenance dimanche/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Détails' })).toHaveAttribute('href', '/help');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Masquer l’annonce' }));
    expect(screen.queryByText(/Maintenance dimanche/)).not.toBeInTheDocument();
    unmount();
    wrap(<AnnouncementBar />);
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/Maintenance dimanche/)).not.toBeInTheDocument();
  });

  it('lien externe non https ignoré', async () => {
    localStorage.clear();
    getMock.mockResolvedValue({ data: { items: [{ id: 'a2', message: 'Annonce', linkUrl: 'javascript:alert(1)', linkLabel: 'Clic', level: 'info', updatedAt: '2026-11-25T00:00:00.000Z' }] } });
    wrap(<AnnouncementBar />);
    expect(await screen.findByText('Annonce')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Footer from '../../components/layout/Footer';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock('../../services/api', () => ({ default: { get: getMock } }));

function renderFooter(onlinePayment: unknown = { available: false, provider: null, simulated: false }) {
  getMock.mockImplementation(() => Promise.resolve({ data: { onlinePayment } }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><Footer /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Pied de page — coordonnées', () => {
  it('affiche l’unique boîte existante contact@blalinker.com (plus contact@blaservices.com)', () => {
    renderFooter();
    const mail = screen.getByRole('link', { name: 'contact@blalinker.com' });
    expect(mail).toHaveAttribute('href', 'mailto:contact@blalinker.com');
    expect(screen.queryByText(/blaservices\.com/)).not.toBeInTheDocument();
  });

  it('conserve le numéro de téléphone existant, sans modification', () => {
    renderFooter();
    expect(screen.getByRole('link', { name: '+225 07 20 33 39 97' })).toHaveAttribute('href', 'tel:+2250720333997');
  });

  it('aucun lien de réseau social factice (« # ») n’est publié', () => {
    const { container } = renderFooter();
    expect(container.querySelector('a[href="#"]')).toBeNull();
    for (const name of ['Facebook', 'Twitter/X', 'Instagram', 'WhatsApp']) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
  });
});

describe('Pied de page — moyens de paiement', () => {
  it('paiement en ligne inactif : aucun moyen de paiement annoncé', async () => {
    renderFooter();
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/site/config'));
    expect(screen.queryByTestId('footer-payments')).not.toBeInTheDocument();
    for (const name of ['Wave', 'Orange Money', 'Free Money', 'Stripe']) {
      expect(screen.queryByText(name)).not.toBeInTheDocument();
    }
  });

  it('simulation de développement : rien n’est annoncé non plus', async () => {
    renderFooter({ available: true, provider: null, simulated: true });
    await waitFor(() => expect(getMock).toHaveBeenCalled());
    expect(screen.queryByTestId('footer-payments')).not.toBeInTheDocument();
  });

  it('paiement réellement actif : affiché', async () => {
    renderFooter({ available: true, provider: 'cinetpay', simulated: false });
    expect(await screen.findByTestId('footer-payments')).toBeInTheDocument();
  });
});

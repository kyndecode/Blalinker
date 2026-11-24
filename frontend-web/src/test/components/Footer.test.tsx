import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Footer from '../../components/layout/Footer';

describe('Pied de page — coordonnées', () => {
  it('affiche l’unique boîte existante contact@blalinker.com (plus contact@blaservices.com)', () => {
    render(<MemoryRouter><Footer /></MemoryRouter>);
    const mail = screen.getByRole('link', { name: 'contact@blalinker.com' });
    expect(mail).toHaveAttribute('href', 'mailto:contact@blalinker.com');
    expect(screen.queryByText(/blaservices\.com/)).not.toBeInTheDocument();
  });

  it('conserve le numéro de téléphone existant, sans modification', () => {
    render(<MemoryRouter><Footer /></MemoryRouter>);
    expect(screen.getByRole('link', { name: '+225 07 20 33 39 97' })).toHaveAttribute('href', 'tel:+2250720333997');
  });

  it('aucun lien de réseau social factice (« # ») n’est publié', () => {
    const { container } = render(<MemoryRouter><Footer /></MemoryRouter>);
    expect(container.querySelector('a[href="#"]')).toBeNull();
    for (const name of ['Facebook', 'Twitter/X', 'Instagram', 'WhatsApp']) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
  });
});

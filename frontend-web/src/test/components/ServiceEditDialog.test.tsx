import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ServiceEditDialog from '../../components/provider/ServiceEditDialog';

describe('modification d’un service (prestataire)', () => {
  it('validation en direct : titre et prix requis, prix en format local accepté', async () => {
    const onSave = vi.fn();
    render(<ServiceEditDialog service={{ id: 's1', title: 'Plomberie', description: null, price: 15000 }} onClose={() => {}} onSave={onSave} />);
    const user = userEvent.setup();
    const price = screen.getByLabelText('Prix (XOF)');
    await user.clear(price);
    await user.type(price, '0');
    expect(screen.getByText('Indiquez un prix supérieur à 0.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    await user.clear(price);
    await user.type(price, '12 500,5');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledWith({ title: 'Plomberie', description: undefined, price: 12500.5 });
  });

  it('erreur du serveur affichée dans la fenêtre', () => {
    render(<ServiceEditDialog service={{ id: 's1', title: 'Plomberie' }} error="Service introuvable" onClose={() => {}} onSave={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Service introuvable');
  });
});

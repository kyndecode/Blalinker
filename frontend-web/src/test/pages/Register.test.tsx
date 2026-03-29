import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Register from '../../pages/Auth/Register';

const { postMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  default: {
    post: postMock,
  },
}));

function renderRegister(initialEntry = '/register') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/register" element={<Register />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Register page', () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it('envoie les donnees d\'inscription avec telephone seul', async () => {
    const user = userEvent.setup();
    postMock.mockResolvedValue({ data: { message: 'ok' } });
    renderRegister();

    await user.type(screen.getByPlaceholderText('+221 77 000 00 00'), '+221771234567');
    await user.type(screen.getByLabelText(/mot de passe/i), 'Secret123');
    await user.click(screen.getByRole('button', { name: /compte/i }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/auth/register', {
        phone: '+221771234567',
        email: undefined,
        password: 'Secret123',
        role: 'client',
      });
    });
  });

  it('envoie les donnees d\'inscription avec email seul', async () => {
    const user = userEvent.setup();
    postMock.mockResolvedValue({ data: { message: 'ok' } });
    renderRegister();

    await user.type(screen.getByLabelText(/email/i), 'new-user@example.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'Secret123');
    await user.click(screen.getByRole('button', { name: /compte/i }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/auth/register', {
        phone: undefined,
        email: 'new-user@example.com',
        password: 'Secret123',
        role: 'client',
      });
    });
  });

  it('affiche le message backend de validation', async () => {
    const user = userEvent.setup();
    postMock.mockRejectedValue({
      response: {
        data: {
          error: 'DonnÃ©es invalides',
          errors: {
            phone: ['Format tÃ©lÃ©phone invalide'],
          },
        },
      },
    });

    renderRegister();

    await user.type(screen.getByPlaceholderText('+221 77 000 00 00'), '+221771234567');
    await user.type(screen.getByLabelText(/mot de passe/i), 'Secret123');
    await user.click(screen.getByRole('button', { name: /compte/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Format tÃ©lÃ©phone invalide');
  });
});

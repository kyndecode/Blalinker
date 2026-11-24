import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Register from '../../pages/Auth/Register';

const { postMock, getMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  getMock: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  default: {
    post: postMock,
    get: getMock,
  },
}));

function renderRegister(initialEntry = '/register') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/register" element={<Register />} />
      </Routes>
    </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Register page', () => {
  beforeEach(() => {
    postMock.mockReset();
    getMock.mockReset().mockImplementation((url: string) => Promise.resolve({ data: url === '/site/settings' ? { values: {} } : { items: [] } }));
  });

  it('submits required registration fields', async () => {
    const user = userEvent.setup();
    postMock.mockResolvedValue({ data: { message: 'ok' } });
    renderRegister();

    await user.type(screen.getByLabelText(/auth.first_name/i), 'Awa');
    await user.type(screen.getByLabelText(/auth.last_name/i), 'Ndiaye');
    await user.selectOptions(screen.getByLabelText(/auth.phone_country/i), 'SN');
    await user.type(screen.getByPlaceholderText(/auth.phone_local_placeholder/i), '0771234567');
    await user.type(screen.getByLabelText(/auth.email/i), 'new-user@example.com');
    await user.type(screen.getByLabelText(/auth.password/i), 'Secret123');
    await user.click(screen.getByRole('button', { name: /auth.register_submit/i }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/auth/register', {
        firstName: 'Awa',
        lastName: 'Ndiaye',
        phone: '+221771234567',
        countryCode: 'SN',
        email: 'new-user@example.com',
        password: 'Secret123',
        role: 'client',
      });
    });
  });

  it('formats phone using selected country dial code', async () => {
    const user = userEvent.setup();
    postMock.mockResolvedValue({ data: { message: 'ok' } });
    renderRegister();

    await user.type(screen.getByLabelText(/auth.first_name/i), 'John');
    await user.type(screen.getByLabelText(/auth.last_name/i), 'Doe');
    await user.selectOptions(screen.getByLabelText(/auth.phone_country/i), 'US');
    await user.type(screen.getByPlaceholderText(/auth.phone_local_placeholder/i), '4155550101');
    await user.type(screen.getByLabelText(/auth.email/i), 'john@example.com');
    await user.type(screen.getByLabelText(/auth.password/i), 'Secret123');
    await user.click(screen.getByRole('button', { name: /auth.register_submit/i }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/auth/register', expect.objectContaining({
        phone: '+14155550101',
        countryCode: 'US',
      }));
    });
  });

  it('shows backend validation message', async () => {
    const user = userEvent.setup();
    postMock.mockRejectedValue({
      response: {
        data: {
          error: 'Données invalides',
          errors: {
            phone: ['Format téléphone invalide'],
          },
        },
      },
    });

    renderRegister();

    await user.type(screen.getByLabelText(/auth.first_name/i), 'Awa');
    await user.type(screen.getByLabelText(/auth.last_name/i), 'Ndiaye');
    await user.selectOptions(screen.getByLabelText(/auth.phone_country/i), 'SN');
    await user.type(screen.getByPlaceholderText(/auth.phone_local_placeholder/i), '0771234567');
    await user.type(screen.getByLabelText(/auth.email/i), 'new-user@example.com');
    await user.type(screen.getByLabelText(/auth.password/i), 'Secret123');
    await user.click(screen.getByRole('button', { name: /auth.register_submit/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Format téléphone invalide');
  });
});

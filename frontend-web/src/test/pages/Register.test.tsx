import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Register from '../../pages/Auth/Register';
import { trRx } from '../tr';

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

    await user.type(screen.getByLabelText(trRx('auth.first_name')), 'Awa');
    await user.type(screen.getByLabelText(trRx('auth.last_name')), 'Ndiaye');
    await user.selectOptions(screen.getByLabelText(trRx('auth.phone_country')), 'SN');
    await user.type(screen.getByPlaceholderText(trRx('auth.phone_local_placeholder')), '0771234567');
    await user.type(screen.getByLabelText(trRx('auth.email')), 'new-user@example.com');
    await user.type(screen.getByLabelText(trRx('auth.password')), 'Secret123');
    await user.click(screen.getByRole('button', { name: trRx('auth.register_submit') }));

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

    await user.type(screen.getByLabelText(trRx('auth.first_name')), 'John');
    await user.type(screen.getByLabelText(trRx('auth.last_name')), 'Doe');
    await user.selectOptions(screen.getByLabelText(trRx('auth.phone_country')), 'US');
    await user.type(screen.getByPlaceholderText(trRx('auth.phone_local_placeholder')), '4155550101');
    await user.type(screen.getByLabelText(trRx('auth.email')), 'john@example.com');
    await user.type(screen.getByLabelText(trRx('auth.password')), 'Secret123');
    await user.click(screen.getByRole('button', { name: trRx('auth.register_submit') }));

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

    await user.type(screen.getByLabelText(trRx('auth.first_name')), 'Awa');
    await user.type(screen.getByLabelText(trRx('auth.last_name')), 'Ndiaye');
    await user.selectOptions(screen.getByLabelText(trRx('auth.phone_country')), 'SN');
    await user.type(screen.getByPlaceholderText(trRx('auth.phone_local_placeholder')), '0771234567');
    await user.type(screen.getByLabelText(trRx('auth.email')), 'new-user@example.com');
    await user.type(screen.getByLabelText(trRx('auth.password')), 'Secret123');
    await user.click(screen.getByRole('button', { name: trRx('auth.register_submit') }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Format téléphone invalide');
  });
});

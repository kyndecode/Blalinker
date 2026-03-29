import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import VerifyOTP from '../../pages/Auth/VerifyOTP';

const { postMock, setTokensMock, setUserMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  setTokensMock: vi.fn(),
  setUserMock: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  default: {
    post: postMock,
  },
}));

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({
    setTokens: setTokensMock,
    setUser: setUserMock,
  }),
}));

function renderVerify(initialEntry = '/verify?phone=%2B221770000000') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/verify" element={<VerifyOTP />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('VerifyOTP page', () => {
  beforeEach(() => {
    postMock.mockReset();
    setTokensMock.mockReset();
    setUserMock.mockReset();
  });

  it('renvoie un OTP via /auth/resend-otp', async () => {
    const user = userEvent.setup();
    postMock.mockResolvedValue({ data: { message: 'ok' } });
    renderVerify();

    await user.click(screen.getByRole('button', { name: /auth.resend/i }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/auth/resend-otp', {
        phone: '+221770000000',
        email: undefined,
      });
    });
  });

  it('valide le code OTP et stocke les tokens', async () => {
    const user = userEvent.setup();
    postMock.mockResolvedValue({
      data: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: { id: 'user-1', role: 'client' },
      },
    });
    renderVerify();

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '1');
    await user.type(inputs[1], '2');
    await user.type(inputs[2], '3');
    await user.type(inputs[3], '4');
    await user.type(inputs[4], '5');
    await user.type(inputs[5], '6');
    await user.click(screen.getAllByRole('button')[0]);

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/auth/verify-otp', {
        phone: '+221770000000',
        email: undefined,
        code: '123456',
      });
      expect(setTokensMock).toHaveBeenCalledWith('access-token', 'refresh-token');
      expect(setUserMock).toHaveBeenCalledWith({ id: 'user-1', role: 'client' });
    });
  });
});

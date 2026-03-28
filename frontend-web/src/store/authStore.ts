import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  role: 'client' | 'provider' | 'admin' | 'super_admin';
  email?: string;
  phone?: string;
}

interface AuthState {
  user:         User | null;
  accessToken:  string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;

  setUser:     (user: User) => void;
  setTokens:   (access: string, refresh: string) => void;
  logout:      () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user:            null,
      accessToken:     null,
      refreshToken:    null,
      isAuthenticated: false,

      setUser: (user) => set({ user }),

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken, isAuthenticated: true }),

      logout: () =>
        set({
          user:            null,
          accessToken:     null,
          refreshToken:    null,
          isAuthenticated: false,
        }),
    }),
    {
      name:    'bla_auth',
      partialize: (state) => ({
        user:         state.user,
        refreshToken: state.refreshToken,
        // Ne PAS persister l'access token (courte durée, stocké en mémoire)
      }),
    }
  )
);

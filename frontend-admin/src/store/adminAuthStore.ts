import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AdminUser {
  id:    string;
  email: string;
  role:  'admin' | 'super_admin';
}

interface AdminAuthState {
  user:         AdminUser | null;
  accessToken:  string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setTokens: (access: string, refresh: string, user: AdminUser) => void;
  logout: () => void;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      user:            null,
      accessToken:     null,
      refreshToken:    null,
      isAuthenticated: false,

      setTokens: (accessToken, refreshToken, user) =>
        set({ accessToken, refreshToken, user, isAuthenticated: true }),

      logout: () =>
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false }),
    }),
    {
      name: 'bla-admin-auth',
      partialize: (s) => ({
        accessToken:  s.accessToken,
        refreshToken: s.refreshToken,
        user:         s.user,
        isAuthenticated: s.isAuthenticated,
      }),
    }
  )
);

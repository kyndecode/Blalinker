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
  isAuthenticated: boolean;

  setUser:     (user: User) => void;
  /**
   * Définit l'access token (gardé en mémoire uniquement).
   * Le second paramètre `refresh` est conservé pour compatibilité d'appel mais
   * ignoré côté web : le refresh token vit dans un cookie HttpOnly géré par le serveur.
   */
  setTokens:   (access: string, refresh?: string) => void;
  logout:      () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user:            null,
      accessToken:     null,
      isAuthenticated: false,

      setUser: (user) => set({ user }),

      setTokens: (accessToken) =>
        set({ accessToken, isAuthenticated: true }),

      logout: () =>
        set({
          user:            null,
          accessToken:     null,
          isAuthenticated: false,
        }),
    }),
    {
      name:    'bla_auth',
      // On ne persiste que l'utilisateur. L'access token reste en mémoire ;
      // le refresh token est un cookie HttpOnly inaccessible au JS (anti-XSS).
      partialize: (state) => ({
        user: state.user,
      }),
    }
  )
);

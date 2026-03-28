import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  isDark: boolean;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      isDark: false,
      toggle: () => {
        const next = !get().isDark;
        set({ isDark: next });
        document.documentElement.classList.toggle('dark', next);
      },
    }),
    { name: 'bla_theme' }
  )
);

// Apply on load
const saved = JSON.parse(localStorage.getItem('bla_theme') || '{}');
if (saved?.state?.isDark) document.documentElement.classList.add('dark');

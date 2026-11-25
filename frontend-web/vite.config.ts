import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    // Drapeaux (flag-icons, ~270 SVG) : fichiers séparés, chargés seulement s'ils sont affichés,
    // jamais intégrés en base64 dans le JavaScript (sinon +100 Ko sur chaque page).
    assetsInlineLimit: (filePath: string) => (filePath.includes('flag-icons') ? false : undefined),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  test: {
    globals:     true,
    environment: 'jsdom',
    setupFiles:  './src/test/setup.ts',
    // Machines lentes / CI chargée : la saisie simulée (user-event) peut dépasser 5 s.
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include:  ['src/**/*.{ts,tsx}'],
      exclude:  ['src/main.tsx', 'src/i18n/**', 'src/**/*.d.ts'],
    },
  },
});

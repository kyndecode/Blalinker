import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#16a34a', dark: '#15803d' },
      },
    },
  },
  plugins: [],
} satisfies Config;

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

const navigateMock = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: 'fr',
      changeLanguage: () => Promise.resolve(),
    },
  }),
  Trans: ({ children }: { children: unknown }) => children,
  initReactI18next: {
    type: '3rdParty',
    init: () => undefined,
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

globalThis.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  })
) as unknown as typeof fetch;

vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api/v1');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

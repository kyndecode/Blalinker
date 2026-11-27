import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

const navigateMock = vi.fn();

// Traductions réelles (français) : les tests vérifient le texte que voit l'utilisateur,
// y compris les pluriels et les valeurs insérées ; une clé absente reste affichée telle quelle.
vi.mock('react-i18next', async () => {
  const i18next = (await import('i18next')).default;
  const fr = (await import('../i18n/fr.json')).default;
  const instance = i18next.createInstance();
  await instance.init({
    lng: 'fr',
    fallbackLng: 'fr',
    resources: { fr: { translation: fr } },
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  const t = instance.t.bind(instance);
  const i18n = { language: 'fr', resolvedLanguage: 'fr', changeLanguage: () => Promise.resolve() };
  return {
    useTranslation: () => ({ t, i18n }),
    Trans: ({ children }: { children: unknown }) => children,
    initReactI18next: {
      type: '3rdParty',
      init: () => undefined,
    },
  };
});

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

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './fr.json';
import en from './en.json';

const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;

function toSupportedLanguage(language: string | null | undefined): 'fr' | 'en' | null {
  const normalized = (language || '').toLowerCase().split('-')[0];
  return SUPPORTED_LANGUAGES.includes(normalized as 'fr' | 'en')
    ? (normalized as 'fr' | 'en')
    : null;
}

const savedLanguage = toSupportedLanguage(localStorage.getItem('bla_lang'));
const browserLanguage = toSupportedLanguage(navigator.language);
const defaultLanguage = savedLanguage ?? browserLanguage ?? 'fr';

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: defaultLanguage,
  fallbackLng: 'fr',
  supportedLngs: SUPPORTED_LANGUAGES,
  nonExplicitSupportedLngs: true,
  load: 'languageOnly',
  cleanCode: true,
  interpolation: { escapeValue: false },
  returnNull: false,
});

// Synchronise l'attribut <html lang="…"> avec la langue active (a11y + SEO).
function syncHtmlLang(language: string) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = toSupportedLanguage(language) ?? 'fr';
  }
}
syncHtmlLang(defaultLanguage);
i18n.on('languageChanged', syncHtmlLang);

export default i18n;

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

/** Langues du site : français et anglais uniquement. */
export type ContentLocale = 'fr' | 'en';

/** Langue de contenu demandée à l'API (fr par défaut). */
export function contentLocale(language: string | undefined): ContentLocale {
  const short = (language ?? 'fr').slice(0, 2).toLowerCase();
  return short === 'en' ? 'en' : 'fr';
}

export function useContentLocale(): ContentLocale {
  const { i18n } = useTranslation();
  return contentLocale(i18n?.language);
}

export type SiteSettingValues = Record<string, unknown>;

/** Paramètres publics du site (vide en cas d'erreur : les valeurs intégrées s'appliquent). */
export function useSiteSettings() {
  return useQuery<SiteSettingValues>({
    queryKey: ['site-settings'],
    queryFn: () => api.get('/site/settings').then((r) => (r.data?.values && typeof r.data.values === 'object' ? r.data.values : {})),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/** Texte d'un paramètre : chaîne simple ou texte par langue ({ fr, en }). */
export function settingText(values: SiteSettingValues | undefined, key: string, locale: ContentLocale): string | undefined {
  const v = values?.[key];
  if (typeof v === 'string' && v.trim()) return v;
  if (v && typeof v === 'object') {
    const map = v as Record<string, unknown>;
    const text = map[locale] ?? map.fr;
    return typeof text === 'string' && text.trim() ? text : undefined;
  }
  return undefined;
}

export interface PublicCountry { code: string; name: string; dialCode: string; currency: string; defaultLocale: string }

/** Pays actifs configurés par l'administration (liste vide si aucun). */
export function useActiveCountries() {
  return useQuery<PublicCountry[]>({
    queryKey: ['site-countries'],
    queryFn: () => api.get('/site/countries').then((r) => (Array.isArray(r.data?.items) ? r.data.items : [])),
    staleTime: 10 * 60_000,
    retry: 1,
  });
}

export interface PublishedPage { slug: string; locale: string; title: string; summary: string | null; body: string; updatedAt: string }

/** Page publiée ; `null` si aucune (le site affiche alors son texte intégré). */
export function usePublishedPage(slug: string) {
  const locale = useContentLocale();
  return useQuery<PublishedPage | null>({
    queryKey: ['site-page', slug, locale],
    queryFn: async () => {
      try {
        const { data } = await api.get(`/site/pages/${encodeURIComponent(slug)}`, { params: { locale } });
        return typeof data?.body === 'string' && typeof data?.title === 'string' ? data : null;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60_000,
  });
}

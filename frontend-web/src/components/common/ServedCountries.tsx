import { useTranslation } from 'react-i18next';
import CountryFlag from './CountryFlag';
import { useActiveCountries } from '../../hooks/useSiteContent';

/** Pays affichés tant qu'aucun pays n'est activé dans l'administration (contenu historique du site). */
export const DEFAULT_SERVED_COUNTRIES = ['TG', 'CI', 'ML', 'BF'] as const;

interface ServedCountriesProps {
  /** Couleur du texte : fond sombre (pied de page) ou clair (page Contact). */
  tone?: 'onDark' | 'onLight';
  className?: string;
}

/**
 * Pays desservis : drapeau + nom (dans la langue du visiteur). Source : pays actifs
 * de l'administration (GET /site/countries) ; à défaut, la liste historique.
 */
export default function ServedCountries({ tone = 'onLight', className = '' }: ServedCountriesProps) {
  const { i18n } = useTranslation();
  const { data: active = [] } = useActiveCountries();
  const lang = (i18n.resolvedLanguage || i18n.language || 'fr').split('-')[0];
  const codes = active.length > 0 ? active.map((c) => c.code.toUpperCase()) : [...DEFAULT_SERVED_COUNTRIES];
  const apiNames = new Map(active.map((c) => [c.code.toUpperCase(), c.name]));

  let displayNames: Intl.DisplayNames | null = null;
  try { displayNames = new Intl.DisplayNames([lang], { type: 'region' }); } catch { displayNames = null; }
  const nameOf = (code: string) => displayNames?.of(code) ?? apiNames.get(code) ?? code;

  const text = tone === 'onDark' ? 'text-white/70' : 'text-gray-700 dark:text-gray-200';
  return (
    <ul className={`flex flex-wrap gap-x-4 gap-y-2 ${className}`} data-testid="served-countries">
      {codes.map((code) => (
        <li key={code} className={`inline-flex items-center gap-1.5 text-sm ${text}`}>
          <CountryFlag code={code} size="sm" />
          <span>{nameOf(code)}</span>
        </li>
      ))}
    </ul>
  );
}

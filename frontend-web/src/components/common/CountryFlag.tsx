/**
 * Drapeau d'un pays (code ISO 3166-1 alpha-2) en image SVG (paquet flag-icons, MIT).
 *
 * Pourquoi pas les émojis-drapeaux (indicateurs régionaux Unicode, ex. U+1F1F9 U+1F1EC
 * pour le Togo) : Windows ne possède aucun glyphe de drapeau.
 * Chrome et Edge y affichent à la place deux lettres (« TG ») de largeur variable :
 * rendu correct sur téléphone, mais lettres et alignements cassés sur ordinateur.
 * Une image SVG s'affiche à l'identique partout, au format 4:3, quelle que soit la police.
 *
 * Les fichiers sont servis depuis le site lui-même (aucun CDN externe, CSP inchangée)
 * et chargés à la demande (voir `assetsInlineLimit` dans vite.config.ts).
 */
const FLAG_DIR = '/node_modules/flag-icons/flags/4x3/';
const FLAG_URLS = import.meta.glob<string>('/node_modules/flag-icons/flags/4x3/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
});

export function flagUrl(code: string): string | undefined {
  if (!/^[A-Za-z]{2}$/.test(code)) return undefined;
  return FLAG_URLS[`${FLAG_DIR}${code.toLowerCase()}.svg`];
}

/** Dimensions exactes au format 4:3 (largeur × hauteur en pixels CSS). */
const SIZES = {
  sm: { w: 16, h: 12, cls: 'w-4 h-3' },
  md: { w: 20, h: 15, cls: 'w-5 h-[15px]' },
  lg: { w: 32, h: 24, cls: 'w-8 h-6' },
} as const;

interface CountryFlagProps {
  code: string;
  size?: keyof typeof SIZES;
  /** Nom accessible ; omis = image décorative (le nom du pays est écrit à côté). */
  label?: string;
  className?: string;
}

export default function CountryFlag({ code, size = 'md', label, className = '' }: CountryFlagProps) {
  const { w, h, cls } = SIZES[size];
  const box = `${cls} shrink-0 inline-block rounded-[2px] ring-1 ring-black/10 dark:ring-white/20 ${className}`;
  const url = flagUrl(code);
  if (!url) {
    // Code inconnu : emplacement neutre de même taille (aucun décalage de mise en page).
    return label
      ? <span role="img" aria-label={label} className={`${box} bg-gray-200 dark:bg-gray-700`} />
      : <span aria-hidden="true" className={`${box} bg-gray-200 dark:bg-gray-700`} />;
  }
  return (
    <img
      src={url}
      alt={label ?? ''}
      width={w}
      height={h}
      loading="lazy"
      decoding="async"
      className={`${box} object-cover`}
      data-country={code.toUpperCase()}
    />
  );
}

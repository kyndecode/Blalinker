/**
 * Format des nombres et des dates selon la langue choisie sur le site (français ou anglais).
 * Le français reste la valeur par défaut.
 */
export function formatLocale(language: string | undefined): 'fr-FR' | 'en-GB' {
  return (language || 'fr').toLowerCase().startsWith('en') ? 'en-GB' : 'fr-FR';
}

/**
 * Coordonnées affichées sur le site : source unique (pied de page, page Contact).
 *
 * - E-mail : contact@blalinker.com, seule boîte existante (identique à
 *   BREVO_FROM_EMAIL / ADMIN_EMAIL côté serveur, cf. render.yaml).
 * - Téléphone : valeur déjà publiée sur le site, conservée telle quelle.
 *
 * Chaque valeur peut être remplacée sans modifier le code par une variable
 * Vercel (VITE_CONTACT_EMAIL, VITE_CONTACT_PHONE). Le lot 2 les rendra
 * administrables (paramètres par pays).
 */
const env = import.meta.env as Record<string, string | undefined>;

function clean(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

export const CONTACT_EMAIL = clean(env.VITE_CONTACT_EMAIL) ?? 'contact@blalinker.com';

/** Numéro affiché (format lisible). */
export const CONTACT_PHONE_DISPLAY = clean(env.VITE_CONTACT_PHONE) ?? '+225 07 20 33 39 97';

/** Numéro pour les liens « tel: » (chiffres et « + » uniquement). */
export const CONTACT_PHONE_TEL = CONTACT_PHONE_DISPLAY.replace(/[^\d+]/g, '');

/**
 * Réseaux sociaux : un lien n'est affiché que si son adresse est configurée
 * (VITE_SOCIAL_FACEBOOK, VITE_SOCIAL_X, VITE_SOCIAL_INSTAGRAM, VITE_SOCIAL_WHATSAPP).
 * Aucun lien factice (« # ») n'est publié.
 */
export const SOCIAL_LINKS: Record<'Facebook' | 'Twitter/X' | 'Instagram' | 'WhatsApp', string | undefined> = {
  Facebook: clean(env.VITE_SOCIAL_FACEBOOK),
  'Twitter/X': clean(env.VITE_SOCIAL_X),
  Instagram: clean(env.VITE_SOCIAL_INSTAGRAM),
  WhatsApp: clean(env.VITE_SOCIAL_WHATSAPP),
};

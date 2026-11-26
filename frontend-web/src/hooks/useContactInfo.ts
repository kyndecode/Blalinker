import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, SOCIAL_LINKS } from '../config/site';
import { useSiteSettings } from './useSiteContent';

type SocialName = keyof typeof SOCIAL_LINKS;
const SOCIAL_KEYS: Record<SocialName, string> = {
  Facebook: 'social.facebook',
  'Twitter/X': 'social.x',
  Instagram: 'social.instagram',
  WhatsApp: 'social.whatsapp',
};

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/**
 * Coordonnées publiées : valeurs de l'administration (paramètres du site) si elles
 * existent, sinon valeurs intégrées (config/site.ts). Aucun lien social factice.
 */
export function useContactInfo() {
  const { data: values } = useSiteSettings();
  const email = str(values?.['contact.email']) ?? CONTACT_EMAIL;
  const phoneDisplay = str(values?.['contact.phone']) ?? CONTACT_PHONE_DISPLAY;
  const social = Object.fromEntries(
    (Object.keys(SOCIAL_KEYS) as SocialName[]).map((name) => {
      const href = str(values?.[SOCIAL_KEYS[name]]) ?? SOCIAL_LINKS[name];
      return [name, href && /^https:\/\//.test(href) ? href : undefined];
    }),
  ) as Record<SocialName, string | undefined>;
  return {
    email,
    phoneDisplay,
    phoneTel: phoneDisplay.replace(/[^\d+]/g, ''),
    address: str(values?.['contact.address']),
    social,
  };
}

import { z } from 'zod';

/**
 * Paramètres du site modifiables depuis l'administration.
 * Seules ces clés sont acceptées ; chacune a sa validation. Toutes sont publiques
 * (affichées sur le site) : n'ajoutez JAMAIS ici une valeur secrète.
 */

export const SUPPORTED_LOCALES = ['fr', 'en', 'wo'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const httpsUrl = z.string().trim().max(500).url('URL invalide').refine((v) => v.startsWith('https://'), 'URL https:// obligatoire');
const phone = z.string().trim().min(6, 'Numéro trop court').max(30).regex(/^\+?[0-9 ().-]{6,30}$/, 'Numéro invalide');
const localizedText = (max: number) => z
  .object(Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, z.string().trim().max(max).optional()])) as Record<SupportedLocale, z.ZodOptional<z.ZodString>>)
  .strict()
  .refine((v) => Object.values(v).some((x) => typeof x === 'string' && x.length > 0), 'Renseignez au moins une langue');

export const SETTINGS_REGISTRY = {
  'contact.email':      { label: 'E-mail de contact', group: 'Coordonnées', schema: z.string().trim().toLowerCase().email('E-mail invalide').max(254) },
  'contact.phone':      { label: 'Téléphone affiché', group: 'Coordonnées', schema: phone },
  'contact.whatsapp':   { label: 'Numéro WhatsApp', group: 'Coordonnées', schema: phone },
  'contact.address':    { label: 'Adresse postale', group: 'Coordonnées', schema: z.string().trim().min(3).max(300) },
  'contact.hours':      { label: 'Horaires du support', group: 'Coordonnées', schema: localizedText(200) },
  'social.facebook':    { label: 'Facebook', group: 'Réseaux sociaux', schema: httpsUrl },
  'social.instagram':   { label: 'Instagram', group: 'Réseaux sociaux', schema: httpsUrl },
  'social.x':           { label: 'X (Twitter)', group: 'Réseaux sociaux', schema: httpsUrl },
  'social.linkedin':    { label: 'LinkedIn', group: 'Réseaux sociaux', schema: httpsUrl },
  'social.tiktok':      { label: 'TikTok', group: 'Réseaux sociaux', schema: httpsUrl },
  'social.whatsapp':    { label: 'Lien WhatsApp', group: 'Réseaux sociaux', schema: httpsUrl },
  'home.heroTitle':     { label: 'Titre de l’accueil', group: 'Accueil', schema: localizedText(120) },
  'home.heroSubtitle':  { label: 'Sous-titre de l’accueil', group: 'Accueil', schema: localizedText(300) },
  'markets.defaultCountry': {
    label: 'Pays proposé par défaut',
    group: 'Marchés',
    schema: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Code pays ISO à 2 lettres'),
  },
} as const;

export type SettingKey = keyof typeof SETTINGS_REGISTRY;

export function isSettingKey(key: unknown): key is SettingKey {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(SETTINGS_REGISTRY, key);
}

/** Portée d'un paramètre : « global » ou code pays ISO 3166-1 alpha-2. */
export const scopeSchema = z.string().trim().refine((v) => v === 'global' || /^[A-Z]{2}$/.test(v), 'Portée invalide (global ou code pays)');

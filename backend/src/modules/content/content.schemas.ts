import { z } from 'zod';
import { SUPPORTED_LOCALES, scopeSchema } from './settings.registry';

export const contentStatusValues = ['draft', 'published', 'unpublished'] as const;
const status = z.enum(contentStatusValues, { error: 'Statut invalide' });
const locale = z.enum(SUPPORTED_LOCALES, { error: 'Langue non prise en charge' });
const slug = z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Identifiant : minuscules, chiffres et tirets');

/** Lien d'annonce : https:// externe ou chemin interne du site (jamais « // » ni javascript:). */
export const safeLink = z.string().trim().max(500).refine(
  (v) => /^https:\/\/[^\s]+$/i.test(v) || (/^\/[^\s]*$/.test(v) && !v.startsWith('//')),
  'Lien : https://… ou chemin interne commençant par /',
);

// ─── Pages ───────────────────────────────────────────────────
const pageFields = {
  slug,
  locale,
  title: z.string().trim().min(2, 'Titre trop court').max(200),
  summary: z.string().trim().max(500).nullish(),
  body: z.string().max(50_000, 'Contenu trop long (50 000 caractères maximum)').refine((v) => v.trim().length > 0, 'Contenu vide'),
  status,
};
export const createPageSchema = z.object({ ...pageFields, locale: locale.default('fr'), status: status.default('draft') }).strict();
// Modification partielle : aucune valeur par défaut (un champ absent reste inchangé).
export const updatePageSchema = z.object(pageFields).partial().strict()
  .refine((v) => Object.keys(v).length > 0, 'Aucune modification');
export type CreatePageInput = z.infer<typeof createPageSchema>;
export type UpdatePageInput = z.infer<typeof updatePageSchema>;

// ─── FAQ ─────────────────────────────────────────────────────
const faqFields = {
  locale,
  category: z.string().trim().max(100).nullish(),
  question: z.string().trim().min(5, 'Question trop courte').max(300),
  answer: z.string().trim().min(2, 'Réponse vide').max(5_000),
  status,
  sortOrder: z.number().int().min(0).max(100_000),
};
export const createFaqSchema = z.object({
  ...faqFields, locale: locale.default('fr'), status: status.default('draft'), sortOrder: faqFields.sortOrder.default(0),
}).strict();
export const updateFaqSchema = z.object(faqFields).partial().strict()
  .refine((v) => Object.keys(v).length > 0, 'Aucune modification');
export type CreateFaqInput = z.infer<typeof createFaqSchema>;
export type UpdateFaqInput = z.infer<typeof updateFaqSchema>;

// ─── Annonces ────────────────────────────────────────────────
const announcementFields = {
  message: z.string().trim().min(3, 'Message trop court').max(300),
  linkUrl: safeLink.nullish(),
  linkLabel: z.string().trim().max(100).nullish(),
  level: z.enum(['info', 'warning', 'success']),
  locale: locale.nullish(),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Code pays ISO à 2 lettres').nullish(),
  status,
  startsAt: z.string().datetime({ message: 'Date invalide' }).nullish(),
  endsAt: z.string().datetime({ message: 'Date invalide' }).nullish(),
  sortOrder: z.number().int().min(0).max(100_000),
};
const announcementBase = z.object({
  ...announcementFields,
  level: announcementFields.level.default('info'),
  status: status.default('draft'),
  sortOrder: announcementFields.sortOrder.default(0),
}).strict();
const windowOk = (v: { startsAt?: string | null; endsAt?: string | null }) =>
  !v.startsAt || !v.endsAt || new Date(v.startsAt) < new Date(v.endsAt);
export const createAnnouncementSchema = announcementBase
  .refine(windowOk, { message: 'La fin doit être postérieure au début', path: ['endsAt'] });
export const updateAnnouncementSchema = z.object(announcementFields).partial().strict()
  .refine((v) => Object.keys(v).length > 0, 'Aucune modification')
  .refine(windowOk, { message: 'La fin doit être postérieure au début', path: ['endsAt'] });
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;

// ─── Paramètres ──────────────────────────────────────────────
export const upsertSettingSchema = z.object({
  key: z.string().trim().min(1).max(100),
  scope: scopeSchema.default('global'),
  value: z.unknown(),
}).strict();
export type UpsertSettingInput = z.infer<typeof upsertSettingSchema>;

// ─── Pays ────────────────────────────────────────────────────
const countryFields = {
  name: z.string().trim().min(2).max(100),
  dialCode: z.string().trim().regex(/^\+\d{1,4}$/, 'Indicatif au format +225'),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Devise ISO 4217 à 3 lettres'),
  defaultLocale: locale,
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(100_000),
};
export const createCountrySchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Code pays ISO 3166-1 à 2 lettres'),
  ...countryFields,
  defaultLocale: locale.default('fr'),
  isActive: countryFields.isActive.default(false),
  sortOrder: countryFields.sortOrder.default(0),
}).strict();
export const updateCountrySchema = z.object(countryFields).partial().strict()
  .refine((v) => Object.keys(v).length > 0, 'Aucune modification');
export type CreateCountryInput = z.infer<typeof createCountrySchema>;
export type UpdateCountryInput = z.infer<typeof updateCountrySchema>;

// ─── Médias ──────────────────────────────────────────────────
export const updateMediaSchema = z.object({ alt: z.string().trim().max(200).nullable() }).strict();
export type UpdateMediaInput = z.infer<typeof updateMediaSchema>;

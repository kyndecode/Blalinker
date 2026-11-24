/**
 * Données exposées par l'API — listes BLANCHES de champs.
 *
 * Règle : une réponse ne contient jamais une ligne `users` complète. Prisma renvoie
 * TOUTES les colonnes d'un modèle avec `include` (empreinte du mot de passe, secret
 * MFA, téléphone, e-mail…) : on sélectionne donc explicitement les champs utiles
 * selon le destinataire (public, contrepartie d'une réservation, administrateur).
 * Le filet `responseSanitizer` (middlewares) retire en plus tout secret oublié.
 */
import { Prisma } from '@prisma/client';

/** Personne visible publiquement ou par l'autre partie d'une réservation : nom et avatar. */
export const publicPersonSelect = {
  id: true,
  role: true,
  profile: { select: { firstName: true, lastName: true, avatarUrl: true } },
} satisfies Prisma.UserSelect;

type PublicPersonRow = Prisma.UserGetPayload<{ select: typeof publicPersonSelect }>;

/**
 * Forme publique d'une personne. `firstName`/`lastName` sont aussi exposés à plat
 * (les écrans existants lisent l'une ou l'autre forme).
 */
export function toPublicPerson(user: PublicPersonRow | null | undefined) {
  if (!user) return null;
  const profile = {
    firstName: user.profile?.firstName ?? '',
    lastName: user.profile?.lastName ?? '',
    avatarUrl: user.profile?.avatarUrl ?? null,
  };
  return { id: user.id, role: user.role, ...profile, profile };
}

/** Personne vue par un administrateur : coordonnées de contact, jamais de secret. */
export const adminPersonSelect = {
  id: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  profile: { select: { firstName: true, lastName: true } },
} satisfies Prisma.UserSelect;

/** Colonnes d'un compte visibles par un administrateur (listes et fiche). */
export const adminUserScalarSelect = {
  id: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  adminTitle: true,
  mfaEnabled: true,
  mfaTotpEnabledAt: true,
  lastLoginAt: true,
  lockedUntil: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

/** Profil d'un prestataire visible par tous (aucune donnée de contact ni de localisation précise). */
export const publicProviderProfileSelect = {
  businessName: true,
  yearsExperience: true,
  hourlyRate: true,
  dailyRate: true,
  currency: true,
  radiusKm: true,
  isAvailable: true,
  ratingAverage: true,
  ratingCount: true,
  completedJobs: true,
  bioPro: true,
  isPremium: true,
} satisfies Prisma.ProviderProfileSelect;

/** Profil personnel visible publiquement (ville et pays, pas d'adresse ni de coordonnées). */
export const publicProfileSelect = {
  firstName: true,
  lastName: true,
  avatarUrl: true,
  city: true,
  country: true,
  idVerified: true,
  bio: true,
} satisfies Prisma.ProfileSelect;

/** Données de son propre compte (prestataire connecté) : tout sauf les secrets. */
export const ownAccountSelect = {
  id: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

/**
 * Coordonnées publiques arrondies à 2 décimales (≈ 1 km) : suffisant pour situer
 * un prestataire sur une carte sans révéler son domicile.
 */
export function coarseCoordinate(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Distance publique arrondie au demi-kilomètre (au moins 0,5 km). */
export function coarseDistanceKm(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0.5, Math.round(n * 2) / 2);
}

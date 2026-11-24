/**
 * RBAC — Catalogue de permissions granulaires + rôles prédéfinis.
 * Le `super_admin` possède TOUTES les permissions (bypass dans le middleware).
 */

export const PERMISSIONS = {
  USERS_READ: 'users.read',
  USERS_SUSPEND: 'users.suspend',
  USERS_DELETE: 'users.delete',
  PROVIDERS_READ: 'providers.read',
  PROVIDERS_VERIFY: 'providers.verify',     // validation KYC
  BOOKINGS_READ: 'bookings.read',
  PAYMENTS_READ: 'payments.read',
  PAYMENTS_REFUND: 'payments.refund',
  REVIEWS_MODERATE: 'reviews.moderate',
  REPORTS_HANDLE: 'reports.handle',
  CONTACTS_HANDLE: 'contacts.handle',
  CATEGORIES_MANAGE: 'categories.manage',
  STATS_READ: 'stats.read',
  EXPORTS_RUN: 'exports.run',
  AUDIT_READ: 'audit.read',
  ADMINS_MANAGE: 'admins.manage',           // créer/gérer les membres de l'équipe admin
  CONTENT_MANAGE: 'content.manage',         // pages, FAQ, annonces, médiathèque
  SETTINGS_MANAGE: 'settings.manage',       // coordonnées, paramètres du site, pays
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

const P = PERMISSIONS;

/**
 * Rôles prédéfinis → ensemble de permissions par défaut.
 * `super_admin` n'est pas listé : il a tout (bypass).
 */
export const ROLE_PRESETS: Record<string, Permission[]> = {
  admin: [
    P.USERS_READ, P.USERS_SUSPEND, P.PROVIDERS_READ, P.PROVIDERS_VERIFY,
    P.BOOKINGS_READ, P.PAYMENTS_READ, P.PAYMENTS_REFUND, P.REVIEWS_MODERATE,
    P.REPORTS_HANDLE, P.CONTACTS_HANDLE, P.CATEGORIES_MANAGE, P.STATS_READ,
    P.EXPORTS_RUN, P.AUDIT_READ, P.CONTENT_MANAGE, P.SETTINGS_MANAGE,
  ],
  manager: [
    P.USERS_READ, P.PROVIDERS_READ, P.BOOKINGS_READ, P.PAYMENTS_READ,
    P.REVIEWS_MODERATE, P.REPORTS_HANDLE, P.CONTACTS_HANDLE, P.STATS_READ, P.EXPORTS_RUN,
  ],
  support_manager: [P.CONTACTS_HANDLE, P.BOOKINGS_READ, P.USERS_READ, P.REPORTS_HANDLE],
  kyc_manager: [P.PROVIDERS_READ, P.PROVIDERS_VERIFY, P.USERS_READ],
  payment_manager: [P.PAYMENTS_READ, P.PAYMENTS_REFUND, P.BOOKINGS_READ, P.STATS_READ],
  accounting: [P.PAYMENTS_READ, P.STATS_READ, P.EXPORTS_RUN],
  marketing: [P.STATS_READ, P.CATEGORIES_MANAGE, P.CONTENT_MANAGE],
  moderator: [P.REVIEWS_MODERATE, P.REPORTS_HANDLE, P.USERS_READ],
  support_client: [P.CONTACTS_HANDLE, P.BOOKINGS_READ, P.USERS_READ],
  support_provider: [P.CONTACTS_HANDLE, P.PROVIDERS_READ, P.BOOKINGS_READ],
  commercial: [P.PROVIDERS_READ, P.STATS_READ],
  auditor: [
    P.USERS_READ, P.PROVIDERS_READ, P.BOOKINGS_READ, P.PAYMENTS_READ,
    P.STATS_READ, P.AUDIT_READ,
  ],
};

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  manager: 'Manager',
  support_manager: 'Responsable Support',
  kyc_manager: 'Responsable KYC',
  payment_manager: 'Responsable Paiement',
  accounting: 'Responsable Comptabilité',
  marketing: 'Responsable Marketing',
  moderator: 'Modérateur',
  support_client: 'Support Client',
  support_provider: 'Support Prestataire',
  commercial: 'Commercial',
  auditor: 'Lecture seule (Auditeur)',
};

/** Retourne l'ensemble de permissions d'un preset (ou [] si inconnu). */
export function presetPermissions(preset: string): Permission[] {
  return ROLE_PRESETS[preset] ?? [];
}

/** Valide qu'une liste ne contient que des permissions connues. */
export function sanitizePermissions(input: unknown): Permission[] {
  if (!Array.isArray(input)) return [];
  const valid = new Set<string>(ALL_PERMISSIONS);
  return Array.from(new Set(input.filter((p): p is Permission => typeof p === 'string' && valid.has(p))));
}

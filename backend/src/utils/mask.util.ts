/**
 * Masquage des données personnelles dans les journaux.
 * Les journaux de production ne doivent jamais contenir d'adresse e-mail
 * ou de numéro de téléphone complet.
 */

/** « jean.dupont@gmail.com » → « je***@gmail.com » */
export function maskEmail(email?: string | null): string {
  if (!email) return '(aucune)';
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, local.length > 2 ? 2 : 1);
  return `${visible}***@${domain}`;
}

/** « +33612345678 » → « +33******678 » */
export function maskPhone(phone?: string | null): string {
  if (!phone) return '(aucun)';
  const compact = phone.replace(/\s+/g, '');
  if (compact.length <= 6) return '***';
  return `${compact.slice(0, 3)}${'*'.repeat(compact.length - 6)}${compact.slice(-3)}`;
}

/**
 * Création du premier super-administrateur à partir de ADMIN_EMAIL / ADMIN_PASSWORD.
 *
 * Règles (jamais de doublon, jamais de réécriture d'un compte existant) :
 * 1. S'il existe déjà un super-administrateur ACTIF (non supprimé), rien n'est créé,
 *    quelle que soit la valeur de ADMIN_EMAIL. Changer l'adresse du compte en base
 *    (ou la variable) ne doit jamais provoquer la création d'un second compte.
 * 2. Sans ADMIN_PASSWORD, rien n'est créé.
 * 3. Si ADMIN_EMAIL est déjà utilisée par un compte (quel que soit son rôle), rien
 *    n'est créé ni modifié : aucune élévation de privilèges d'un compte existant.
 * 4. Deux démarrages simultanés ne peuvent pas créer deux comptes (contrainte
 *    d'unicité sur users.email, erreur P2002 traitée comme « déjà existant »).
 */
import bcrypt from 'bcryptjs';
import { prisma } from './database';
import { env } from './env';
import { logger } from './logger';
import { maskEmail } from '../utils/mask.util';

export type BootstrapAdminResult =
  | 'created'
  | 'skipped_active_super_admin'
  | 'skipped_no_password'
  | 'skipped_email_in_use';

export async function ensureBootstrapAdmin(): Promise<BootstrapAdminResult> {
  const activeSuperAdmin = await prisma.user.findFirst({
    where: { role: 'super_admin', status: 'active', deletedAt: null },
    select: { id: true },
  });

  if (activeSuperAdmin) {
    logger.info('Bootstrap admin ignoré : un super-administrateur actif existe déjà.');
    return 'skipped_active_super_admin';
  }

  if (!env.ADMIN_PASSWORD) {
    logger.warn('Aucun super-administrateur actif et ADMIN_PASSWORD non configurée : bootstrap admin ignoré.');
    return 'skipped_no_password';
  }

  const adminEmail = env.ADMIN_EMAIL.trim().toLowerCase();
  const emailOwner = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true },
  });

  if (emailOwner) {
    logger.warn(
      `Bootstrap admin ignoré : ${maskEmail(adminEmail)} appartient déjà à un compte existant (aucune modification).`,
    );
    return 'skipped_email_in_use';
  }

  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);

  try {
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        role: 'super_admin',
        status: 'active',
        mfaEnabled: true,
        profile: {
          create: {
            firstName: 'Super',
            lastName: 'Admin',
            country: 'SN',
            idVerified: true,
            idVerifiedAt: new Date(),
          },
        },
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      logger.warn('Bootstrap admin ignoré : compte créé simultanément par une autre instance.');
      return 'skipped_email_in_use';
    }
    throw err;
  }

  logger.info(`Compte super-administrateur initial créé : ${maskEmail(adminEmail)}`);
  return 'created';
}

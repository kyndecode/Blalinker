/**
 * BLA — Double authentification des administrateurs par application (TOTP, RFC 6238).
 *
 * - Compatible Google Authenticator et Microsoft Authenticator : SHA-1, 6 chiffres,
 *   période de 30 s, tolérance d'une période (±30 s).
 * - Bibliothèque : otpauth (maintenue, documentée, sans dépendance).
 * - Le secret est stocké CHIFFRÉ (AES-256-GCM, ENCRYPTION_KEY) dans users.mfa_secret ;
 *   il n'est montré qu'une seule fois, pendant la configuration, puis jamais plus.
 * - Anti-rejeu : la dernière période acceptée est enregistrée par une mise à jour
 *   CONDITIONNELLE atomique ; deux validations simultanées du même code ne peuvent
 *   pas réussir toutes les deux.
 * - Codes de récupération : 10 codes à usage unique, stockés hachés (HMAC-SHA256),
 *   consommés eux aussi par une mise à jour conditionnelle atomique.
 * - En cas d'erreur (ex. secret illisible), le MFA n'est JAMAIS désactivé.
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { Secret, TOTP } from 'otpauth';
import { prisma } from '../../config/database';
import { redis } from '../../config/redis';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { sendEmail } from '../../config/email';
import { encrypt, decrypt } from '../../utils/encryption.util';
import { writeAudit } from '../../utils/audit.util';
import { maskEmail } from '../../utils/mask.util';

export const TOTP_ISSUER = 'BLA Services';
export const TOTP_ALGORITHM = 'SHA1';
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD = 30;
export const TOTP_WINDOW = 1;
export const SETUP_TTL_SECONDS = 10 * 60;
export const RECOVERY_CODE_COUNT = 10;
/** 32 caractères sans ambiguïté (ni I, O, 0, 1) : 10 caractères = 50 bits d'entropie. */
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const setupKey = (userId: string) => `mfa_setup:${userId}`;

type HttpError = Error & { status: number; code?: string };
const httpError = (status: number, message: string, code?: string): HttpError =>
  Object.assign(new Error(message), { status, code });

export function isAdminRole(role?: string | null): boolean {
  return role === 'admin' || role === 'super_admin';
}

function buildTotp(secret: Secret, label: string): TOTP {
  return new TOTP({
    issuer: TOTP_ISSUER,
    label,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret,
  });
}

/**
 * Vérifie un code TOTP. Renvoie la période (compteur RFC 6238) à laquelle il
 * correspond, ou null s'il est invalide pour la fenêtre autorisée.
 */
export function matchTotpStep(base32Secret: string, token: string, timestamp = Date.now()): number | null {
  if (!/^\d{6}$/.test(token)) return null;
  const totp = buildTotp(Secret.fromBase32(base32Secret), 'verification');
  const delta = totp.validate({ token, timestamp, window: TOTP_WINDOW });
  if (delta === null) return null;
  return totp.counter({ timestamp }) + delta;
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashRecoveryCode(code: string): string {
  return crypto
    .createHmac('sha256', Buffer.from(env.ENCRYPTION_KEY, 'hex'))
    .update(normalizeRecoveryCode(code))
    .digest('hex');
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    let raw = '';
    for (let i = 0; i < 10; i += 1) raw += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

/** Alerte de sécurité par e-mail (sans attendre, jamais bloquante). */
function notifySecurityEvent(email: string | null | undefined, subject: string, message: string): void {
  if (!email) return;
  void sendEmail({
    to: email,
    subject: `BLA Services - ${subject}`,
    html: `<p>Bonjour,</p><p>${message}</p><p>Si vous n'êtes pas à l'origine de cette action, contactez immédiatement un super-administrateur.</p>`,
  }).catch((err) => {
    logger.error('Échec alerte de sécurité MFA', { to: maskEmail(email), error: err instanceof Error ? err.message : String(err) });
  });
}

export interface TotpCandidate {
  id: string;
  mfaSecret: string | null;
}

export class MfaService {
  /** État MFA du compte connecté (aucun secret). */
  async getStatus(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, mfaEnabled: true, mfaTotpEnabledAt: true },
    });
    if (!user) throw httpError(404, 'Utilisateur introuvable');

    const recoveryCodesRemaining = user.mfaTotpEnabledAt
      ? await prisma.mfaRecoveryCode.count({ where: { userId, usedAt: null } })
      : 0;
    const admin = isAdminRole(user.role);

    return {
      totpEnabled: Boolean(user.mfaTotpEnabledAt),
      totpEnabledAt: user.mfaTotpEnabledAt,
      recoveryCodesRemaining,
      setupRequired: admin && !user.mfaTotpEnabledAt,
      enforced: admin && env.ADMIN_TOTP_REQUIRED,
    };
  }

  /**
   * Étape 1 de la configuration : mot de passe redemandé, secret provisoire
   * (chiffré, 10 min dans Redis, jamais en base avant activation), QR code.
   */
  async beginTotpSetup(userId: string, password: string, ip?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, status: true, passwordHash: true, mfaTotpEnabledAt: true, deletedAt: true },
    });
    if (!user || user.deletedAt) throw httpError(404, 'Utilisateur introuvable');
    if (!isAdminRole(user.role)) throw httpError(403, 'Réservé aux comptes d\'administration');
    if (user.status !== 'active') throw httpError(403, 'Compte inactif');

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      await writeAudit({ userId, action: 'auth.mfa.totp_setup_bad_password', entity: 'user', entityId: userId, ip });
      // 403 (et non 401) : la session reste valide, seul le mot de passe redemandé est faux.
      throw httpError(403, 'Mot de passe incorrect', 'PASSWORD_MISMATCH');
    }
    if (user.mfaTotpEnabledAt) {
      throw httpError(409, 'L\'application d\'authentification est déjà configurée.', 'TOTP_ALREADY_ENABLED');
    }

    const secret = new Secret({ size: 20 }); // 160 bits (RFC 4226)
    await redis.setex(setupKey(userId), SETUP_TTL_SECONDS, encrypt(secret.base32));

    const otpauthUrl = buildTotp(secret, user.email ?? userId).toString();
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: 'M', margin: 1, width: 240 });

    await writeAudit({ userId, action: 'auth.mfa.totp_setup_started', entity: 'user', entityId: userId, ip });

    return {
      issuer: TOTP_ISSUER,
      account: user.email,
      otpauthUrl,
      qrCodeDataUrl,
      manualEntryKey: (secret.base32.match(/.{1,4}/g) ?? []).join(' '),
      expiresInSeconds: SETUP_TTL_SECONDS,
    };
  }

  /**
   * Étape 2 : le premier code de l'application doit être valide pour activer.
   * Renvoie les codes de récupération EN CLAIR, une seule fois.
   */
  async activateTotp(userId: string, code: string, ip?: string) {
    const pending = await redis.get(setupKey(userId));
    if (!pending) throw httpError(410, 'Configuration expirée : recommencez.', 'TOTP_SETUP_EXPIRED');

    const base32 = decrypt(pending);
    const step = matchTotpStep(base32, code);
    if (step === null) {
      throw httpError(422, 'Code incorrect. Vérifiez l\'heure de votre téléphone et réessayez.', 'TOTP_INVALID');
    }

    // Une seule activation possible pour une configuration donnée (même en parallèle).
    const claimed = await redis.del(setupKey(userId));
    if (claimed !== 1) throw httpError(409, 'Configuration déjà utilisée : recommencez.', 'TOTP_SETUP_CONSUMED');

    const recoveryCodes = generateRecoveryCodes();
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: userId, mfaTotpEnabledAt: null, deletedAt: null, status: 'active' },
        data: { mfaSecret: encrypt(base32), mfaTotpEnabledAt: new Date(), mfaTotpLastStep: step, mfaEnabled: true },
      });
      if (updated.count !== 1) {
        throw httpError(409, 'L\'application d\'authentification est déjà configurée.', 'TOTP_ALREADY_ENABLED');
      }
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })),
      });
      return tx.user.findUnique({ where: { id: userId }, select: { email: true } });
    });

    await writeAudit({ userId, action: 'auth.mfa.totp_enabled', entity: 'user', entityId: userId, ip });
    notifySecurityEvent(user?.email, 'Double authentification activée',
      'La validation en deux étapes par application d\'authentification vient d\'être activée sur votre compte.');

    return { recoveryCodes };
  }

  /**
   * Vérifie un code de l'application. true seulement si le code est valide ET n'a
   * jamais été accepté (période strictement postérieure à la dernière acceptée).
   */
  async verifyTotp(user: TotpCandidate, code: string): Promise<boolean> {
    if (!user.mfaSecret) throw httpError(409, 'Application d\'authentification non configurée.', 'TOTP_NOT_ENABLED');

    let base32: string;
    try {
      base32 = decrypt(user.mfaSecret);
    } catch {
      // Jamais de désactivation automatique : on oriente vers les secours.
      logger.error('Secret TOTP illisible (ENCRYPTION_KEY modifiée ?) : MFA conservé', { userId: user.id });
      throw httpError(503,
        'Validation par application momentanément indisponible : utilisez le code par e-mail ou un code de récupération.',
        'MFA_SECRET_UNREADABLE');
    }

    const step = matchTotpStep(base32, code);
    if (step === null) return false;

    const accepted = await prisma.user.updateMany({
      where: { id: user.id, OR: [{ mfaTotpLastStep: null }, { mfaTotpLastStep: { lt: step } }] },
      data: { mfaTotpLastStep: step },
    });
    return accepted.count === 1;
  }

  /** Consomme un code de récupération (usage unique, atomique). */
  async consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
    if (normalizeRecoveryCode(code).length !== 10) return false;
    const used = await prisma.mfaRecoveryCode.updateMany({
      where: { userId, codeHash: hashRecoveryCode(code), usedAt: null },
      data: { usedAt: new Date() },
    });
    return used.count === 1;
  }

  /** Nouveaux codes de récupération (les anciens sont invalidés) — exige un code TOTP. */
  async regenerateRecoveryCodes(userId: string, totpCode: string, ip?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true, mfaSecret: true, mfaTotpEnabledAt: true },
    });
    if (!user || !isAdminRole(user.role) || !user.mfaTotpEnabledAt) {
      throw httpError(409, 'Application d\'authentification non configurée.', 'TOTP_NOT_ENABLED');
    }
    if (!(await this.verifyTotp(user, totpCode))) {
      throw httpError(422, 'Code incorrect ou déjà utilisé.', 'TOTP_INVALID');
    }

    const recoveryCodes = generateRecoveryCodes();
    await prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.createMany({ data: recoveryCodes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })) });
    });

    await writeAudit({ userId, action: 'auth.mfa.recovery_codes_regenerated', entity: 'user', entityId: userId, ip });
    notifySecurityEvent(user.email, 'Codes de récupération renouvelés',
      'De nouveaux codes de récupération ont été générés ; les anciens ne fonctionnent plus.');
    return { recoveryCodes };
  }

  /**
   * Réinitialise le TOTP d'un compte (action d'un super-administrateur ou script de
   * dernier recours). Le MFA reste actif : la connexion repasse par l'OTP e-mail
   * jusqu'à une nouvelle configuration. Toutes les sessions du compte sont fermées.
   */
  async resetTotp(targetUserId: string, audit: { actorId?: string; ip?: string; via: string }) {
    const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, email: true } });
    if (!target) throw httpError(404, 'Utilisateur introuvable');

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetUserId },
        data: { mfaSecret: null, mfaTotpEnabledAt: null, mfaTotpLastStep: null, mfaEnabled: true },
      });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: targetUserId } });
      await tx.userSession.deleteMany({ where: { userId: targetUserId } });
    });

    await writeAudit({
      userId: audit.actorId,
      action: 'auth.mfa.totp_reset',
      entity: 'user',
      entityId: targetUserId,
      ip: audit.ip,
      newData: { via: audit.via },
    });
    notifySecurityEvent(target.email, 'Double authentification réinitialisée',
      'L\'application d\'authentification de votre compte a été réinitialisée. Vous devrez la configurer de nouveau.');
  }
}

export const mfaService = new MfaService();

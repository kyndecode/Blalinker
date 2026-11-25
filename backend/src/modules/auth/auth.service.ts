/**
 * BLA — Service d'authentification
 * Gère : inscription, OTP, connexion MFA, rotation tokens, déconnexion
 */
import crypto from 'crypto';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { redis } from '../../config/redis';
import { logger } from '../../config/logger';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  verifyAccessToken,
  revokeToken,
  generateTokenFamily,
} from '../../utils/jwt.util';
import { generateOTP, hashOTP, verifyOTP, otpExpiresAt } from '../../utils/otp.util';
import { sendSMS, isSmsConfigured } from '../../utils/sms.util';
import { sendEmail, emailTemplates } from '../../config/email';
import { maskEmail, maskPhone } from '../../utils/mask.util';
import { writeAudit } from '../../utils/audit.util';
import { mfaService, isAdminRole } from './mfa.service';
import type { RegisterInput, LoginInput, ResendOtpInput, GoogleLoginInput } from './auth.schemas';

export type MfaMethod = 'totp' | 'email' | 'recovery';

/** Essais de second facteur autorisés par tentative de connexion (jeton mfa_temp). */
export const MFA_MAX_ATTEMPTS_PER_LOGIN = 5;
/** Secours par e-mail : délai minimal entre deux envois et plafond horaire. */
export const MFA_EMAIL_COOLDOWN_SECONDS = 60;
export const MFA_EMAIL_MAX_PER_HOUR = 5;

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Administrateur dont l'application d'authentification est configurée. */
function isTotpUser(user: { role: string; mfaTotpEnabledAt: Date | null; mfaSecret: string | null }): boolean {
  return isAdminRole(user.role) && Boolean(user.mfaTotpEnabledAt) && Boolean(user.mfaSecret);
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MIN  = 30;
type OtpFlowPurpose = 'registration' | 'login' | 'password_reset' | 'payment_confirm';

/** Délai minimal entre deux envois de code au même compte pour le même usage. */
export const OTP_RESEND_COOLDOWN_SEC = 45;

export class AuthService {
  /** Inscription — crée le compte et envoie l'OTP */
  async register(data: RegisterInput, ip: string) {
    const contactFilters = this._buildContactFilters(data.phone, data.email);
    // Vérifier unicité
    const existing = await prisma.user.findFirst({
      where: {
        OR: contactFilters,
        deletedAt: null,
      },
    });

    if (existing) {
      if (existing.status === 'pending') {
        await prisma.otpCode.deleteMany({
          where: { userId: existing.id, purpose: 'registration', usedAt: null },
        });

        await this._sendOtp(
          existing.id,
          existing.phone ?? data.phone,
          existing.email ?? data.email,
          'registration',
          ip
        );

        return {
          message: 'Compte deja cree mais non valide. Un nouveau code OTP a ete envoye.',
        };
      }

      const field = data.phone && existing.phone === data.phone ? 'telephone' : 'email';
      throw Object.assign(new Error(`Ce ${field} est deja utilise`), { code: 'DUPLICATE', status: 409 });
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        phone: data.phone,
        email: data.email,
        passwordHash,
        role:   data.role as 'client' | 'provider',
        status: 'pending',
        profile: {
          create: {
            firstName: data.firstName,
            lastName: data.lastName,
            country: data.countryCode,
          },
        },
      },
    });

    // Générer et envoyer l'OTP
    await this._sendOtp(user.id, data.phone, data.email, 'registration', ip);

    logger.info(`Nouveau compte créé: ${user.id} (${data.role})`);
    return { message: 'Compte créé. Vérifiez votre téléphone/email pour valider.' };
  }

  /** Vérification OTP d'inscription → active le compte */
  async verifyRegistration(phone: string | undefined, email: string | undefined, code: string) {
    const user = await this._findUserByContact(phone, email);
    if (!user) throw Object.assign(new Error('Utilisateur introuvable'), { status: 404 });

    await this._validateOtp(user.id, code, 'registration');

    await prisma.user.update({
      where: { id: user.id },
      data:  { status: 'active' },
    });

    if (user.email) {
      void sendEmail({
        to: user.email,
        subject: 'BLA - Compte active avec succes',
        html: `
          <p>Bonjour,</p>
          <p>Votre compte BLA est maintenant actif.</p>
          <p>Vous pouvez vous connecter et commencer a utiliser la marketplace.</p>
        `,
      }).catch((err) => {
        logger.error('Echec email activation compte', {
          userId: user.id,
          email: maskEmail(user.email),
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    const tokens = await this._generateTokens(user.id, user.role, { method: 'otp_registration' });
    return { ...tokens, user: { id: user.id, role: user.role } };
  }

  /** Renvoi OTP pour reprise de flux d'inscription/login/reset */
  async resendOtp(
    phone: string | undefined,
    email: string | undefined,
    purpose: ResendOtpInput['purpose'] = 'registration',
    ip: string
  ) {
    const user = await this._findUserByContact(phone, email);
    if (!user) throw Object.assign(new Error('Utilisateur introuvable'), { status: 404 });

    if (purpose === 'registration' && user.status === 'active') {
      throw Object.assign(new Error('Compte déjà vérifié'), { status: 409 });
    }

    await prisma.otpCode.deleteMany({
      where: { userId: user.id, purpose, usedAt: null },
    });

    await this._sendOtp(user.id, user.phone ?? undefined, user.email ?? undefined, purpose, ip);
    return { message: 'Nouveau code envoyé.' };
  }

  /** Connexion — vérifie les credentials et envoie l'OTP MFA */
  async login(data: LoginInput, ip: string) {
    const user = await this._findUserByContact(data.phone, data.email);

    if (!user || user.deletedAt) {
      // Délai constant pour éviter les énumérations de comptes
      await new Promise((r) => setTimeout(r, 200));
      throw Object.assign(new Error('Identifiants incorrects'), { status: 401 });
    }

    // Vérifier si le compte est verrouillé
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw Object.assign(
        new Error(`Compte temporairement verrouillé. Réessayez dans ${remaining} minutes.`),
        { status: 423 }
      );
    }

    const passwordOk = await bcrypt.compare(data.password, user.passwordHash);
    if (!passwordOk) {
      await this._handleFailedLogin(user.id, user.loginAttempts);
      throw Object.assign(new Error('Identifiants incorrects'), { status: 401 });
    }

    // Le compte doit être actif (vérifié par OTP et non suspendu/banni).
    // On ne vérifie ceci qu'APRÈS le mot de passe pour ne pas divulguer l'état du compte.
    if (user.status !== 'active') {
      if (user.status === 'pending') {
        throw Object.assign(
          new Error('Compte non vérifié. Validez le code OTP reçu pour activer votre compte.'),
          { status: 403, code: 'ACCOUNT_PENDING' }
        );
      }
      if (user.status === 'banned') {
        throw Object.assign(new Error('Votre compte a été suspendu.'), { status: 403 });
      }
      throw Object.assign(
        new Error('Votre compte est temporairement suspendu. Contactez le support.'),
        { status: 403 }
      );
    }

    // Réinitialiser les tentatives après succès
    await prisma.user.update({
      where: { id: user.id },
      data:  { loginAttempts: 0, lockedUntil: null },
    });

    // MFA activé (au niveau compte ET au niveau plateforme) → envoyer l'OTP
    if (user.mfaEnabled && env.MFA_ENABLED) {
      const tempToken = await this._createMfaTempToken(user.id, ip);

      // Administrateur avec application d'authentification : on demande le code TOTP.
      // Aucun e-mail n'est envoyé ici ; le secours par e-mail se demande explicitement.
      if (isTotpUser(user)) {
        return {
          mfaRequired: true,
          tempToken,
          mfaMethod: 'totp' as const,
          mfaMethods: ['totp', 'email', 'recovery'] as const,
          user: { id: user.id, role: user.role },
        };
      }

      // Tous les autres comptes (clients, prestataires, admins sans TOTP) : inchangé.
      await this._sendOtp(user.id, user.phone ?? undefined, user.email ?? undefined, 'login', ip);
      return {
        mfaRequired: true,
        tempToken,
        user: { id: user.id, role: user.role, email: user.email, phone: user.phone },
      };
    }

    // MFA désactivé → connexion directe
    const tokens = await this._generateTokens(user.id, user.role, { method: 'password', ip });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { mfaRequired: false, ...tokens, user: { id: user.id, role: user.role } };
  }

  /**
   * Validation MFA → retourne les tokens.
   * - Comptes sans TOTP (clients, prestataires…) : OTP e-mail/SMS, comportement inchangé.
   * - Administrateurs avec TOTP : code de l'application (méthode principale), code
   *   e-mail demandé explicitement (secours) ou code de récupération.
   */
  async verifyMfa(tempToken: string, otpCode: string, method?: MfaMethod) {
    const data = await redis.get(`mfa_temp:${tempToken}`);
    if (!data) throw Object.assign(new Error('Session MFA expirée'), { status: 401 });

    const { userId, ip } = JSON.parse(data) as { userId: string; ip: string };
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Object.assign(new Error('Utilisateur introuvable'), { status: 404 });

    const chosen: MfaMethod = method ?? 'email';
    if (!isTotpUser(user)) {
      if (chosen !== 'email') {
        throw Object.assign(new Error('Méthode de vérification non disponible pour ce compte.'), { status: 400 });
      }
      await this._validateOtp(userId, otpCode, 'login');
    } else {
      await this._verifyAdminSecondFactor(user, tempToken, otpCode, chosen, ip);
    }
    await redis.del(`mfa_temp:${tempToken}`);

    const tokens = await this._generateTokens(userId, user.role, { method: `mfa_${chosen}`, ip });
    await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });

    logger.info(`Connexion réussie: ${userId} depuis ${ip}`);
    return { ...tokens, user: { id: userId, role: user.role } };
  }

  /**
   * Secours « Je n'ai pas accès à mon application d'authentification » :
   * envoie un OTP UNIQUEMENT à l'adresse enregistrée sur le compte (jamais à une
   * adresse fournie par la requête), après vérification de cette adresse et du
   * compte, avec délai minimal et plafond horaire. Journalisé.
   */
  async requestMfaEmailFallback(tempToken: string, ip: string) {
    const data = await redis.get(`mfa_temp:${tempToken}`);
    if (!data) throw Object.assign(new Error('Session expirée : reconnectez-vous.'), { status: 401 });

    const { userId } = JSON.parse(data) as { userId: string };
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !isTotpUser(user)) {
      throw Object.assign(new Error('Secours par e-mail non disponible pour ce compte.'), { status: 400 });
    }
    if (user.deletedAt || user.status !== 'active') {
      throw Object.assign(new Error('Compte inactif.'), { status: 403 });
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw Object.assign(new Error('Compte temporairement verrouillé.'), { status: 423 });
    }

    // Vérification de l'adresse du compte avant tout envoi.
    const email = user.email?.trim().toLowerCase();
    if (!email || !EMAIL_FORMAT.test(email)) {
      logger.warn('Secours MFA refusé : aucune adresse e-mail valide sur le compte', { userId });
      throw Object.assign(
        new Error('Aucune adresse e-mail valide n\'est associée à ce compte : utilisez un code de récupération.'),
        { status: 409, code: 'MFA_EMAIL_UNAVAILABLE' }
      );
    }

    // Anti-abus : 1 envoi par minute, 5 par heure.
    const cooldownKey = `mfa_email_cd:${userId}`;
    const slot = await redis.set(cooldownKey, '1', 'EX', MFA_EMAIL_COOLDOWN_SECONDS, 'NX');
    if (slot !== 'OK') {
      const ttl = await redis.ttl(cooldownKey);
      const retryAfter = ttl > 0 ? ttl : MFA_EMAIL_COOLDOWN_SECONDS;
      throw Object.assign(
        new Error(`Un code vient d'être envoyé. Patientez ${retryAfter} s avant d'en demander un autre.`),
        { status: 429, code: 'MFA_EMAIL_COOLDOWN', retryAfter }
      );
    }
    const hourKey = `mfa_email_hour:${userId}`;
    const sentThisHour = await redis.incr(hourKey);
    if (sentThisHour === 1) await redis.expire(hourKey, 3600);
    if (sentThisHour > MFA_EMAIL_MAX_PER_HOUR) {
      await writeAudit({ userId, action: 'auth.mfa.email_fallback_blocked', entity: 'user', entityId: userId, ip });
      throw Object.assign(
        new Error('Trop de codes demandés par e-mail. Réessayez plus tard ou utilisez un code de récupération.'),
        { status: 429, code: 'MFA_EMAIL_HOURLY_LIMIT' }
      );
    }

    await prisma.otpCode.deleteMany({ where: { userId, purpose: 'login', usedAt: null } });
    try {
      await this._sendOtp(userId, undefined, email, 'login', ip); // e-mail uniquement
    } catch (err) {
      await redis.del(cooldownKey); // l'échec d'envoi ne doit pas bloquer un nouvel essai
      throw err;
    }
    await redis.setex(`mfa_email_fallback:${tempToken}`, 10 * 60, '1');

    await writeAudit({
      userId,
      action: 'auth.mfa.email_fallback_requested',
      entity: 'user',
      entityId: userId,
      ip,
      newData: { to: maskEmail(email) },
    });

    return {
      message: 'Code envoyé par e-mail.',
      sentTo: maskEmail(email),
      cooldownSeconds: MFA_EMAIL_COOLDOWN_SECONDS,
      expiresInMinutes: 10,
    };
  }

  /** Second facteur d'un administrateur avec TOTP (plafond d'essais, verrouillage, audit). */
  private async _verifyAdminSecondFactor(
    user: { id: string; email: string | null; status: string; deletedAt: Date | null; lockedUntil: Date | null; loginAttempts: number; mfaSecret: string | null },
    tempToken: string,
    code: string,
    method: MfaMethod,
    ip: string,
  ) {
    if (user.deletedAt || user.status !== 'active') {
      throw Object.assign(new Error('Compte inactif.'), { status: 403 });
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw Object.assign(new Error(`Compte temporairement verrouillé. Réessayez dans ${remaining} minutes.`), { status: 423 });
    }

    const attemptsKey = `mfa_attempts:${tempToken}`;
    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) await redis.expire(attemptsKey, 5 * 60);
    if (attempts > MFA_MAX_ATTEMPTS_PER_LOGIN) {
      await redis.del(`mfa_temp:${tempToken}`);
      throw Object.assign(new Error('Trop de tentatives. Reconnectez-vous.'), { status: 429 });
    }

    let ok = false;
    if (method === 'totp') {
      ok = await mfaService.verifyTotp(user, code);
    } else if (method === 'recovery') {
      ok = await mfaService.consumeRecoveryCode(user.id, code);
    } else {
      const requested = await redis.get(`mfa_email_fallback:${tempToken}`);
      if (!requested) {
        throw Object.assign(new Error('Demandez d\'abord un code par e-mail.'), { status: 400 });
      }
      try {
        await this._validateOtp(user.id, code, 'login');
        ok = true;
      } catch (err) {
        if ((err as { status?: number }).status !== 422) throw err;
      }
    }

    if (!ok) {
      await this._handleFailedLogin(user.id, user.loginAttempts);
      await writeAudit({ userId: user.id, action: `auth.mfa.${method}_failed`, entity: 'user', entityId: user.id, ip });
      throw Object.assign(new Error('Code incorrect ou déjà utilisé.'), { status: 422 });
    }

    await redis.del(attemptsKey);
    await redis.del(`mfa_email_fallback:${tempToken}`);
    await prisma.user.update({ where: { id: user.id }, data: { loginAttempts: 0, lockedUntil: null } });
    await writeAudit({ userId: user.id, action: `auth.mfa.login_${method}`, entity: 'user', entityId: user.id, ip });

    if (method === 'recovery') {
      const remaining = await prisma.mfaRecoveryCode.count({ where: { userId: user.id, usedAt: null } });
      if (user.email) {
        void sendEmail({
          to: user.email,
          subject: 'BLA Services - Code de récupération utilisé',
          html: `<p>Un code de récupération vient d'être utilisé pour vous connecter. Il vous en reste ${remaining}.</p><p>Si ce n'est pas vous, contactez immédiatement un super-administrateur.</p>`,
        }).catch(() => undefined);
      }
    }
  }

  /** Connexion/inscription Google via ID Token */
  async googleLogin(data: GoogleLoginInput, ip: string) {
    const googleUser = await this._verifyGoogleIdToken(data.idToken);
    const email = googleUser.email.toLowerCase();

    let user = await prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (!user) {
      const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12);
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          role: data.role,
          status: 'active',
          mfaEnabled: false,
          lastLoginAt: new Date(),
          profile: {
            create: {
              firstName: googleUser.firstName || 'Utilisateur',
              lastName: googleUser.lastName || 'Google',
              country: data.countryCode ?? 'SN',
            },
          },
          ...(data.role === 'provider'
            ? {
              providerProfile: {
                create: {
                  isAvailable: true,
                },
              },
            }
            : {}),
        },
      });
    } else {
      // Les comptes d'administration ne peuvent pas se connecter via Google :
      // cela contournerait le mot de passe et la double authentification.
      if (user.role === 'admin' || user.role === 'super_admin') {
        logger.warn('Connexion Google refusée pour un compte d\'administration', { userId: user.id, ip });
        throw Object.assign(
          new Error('La connexion Google n\'est pas disponible pour les comptes d\'administration.'),
          { status: 403, code: 'GOOGLE_LOGIN_ADMIN_FORBIDDEN' }
        );
      }
      if (user.status === 'banned') {
        throw Object.assign(new Error('Compte suspendu. Contactez le support.'), { status: 403 });
      }
      if (user.status === 'suspended') {
        throw Object.assign(
          new Error('Votre compte est temporairement suspendu. Contactez le support.'),
          { status: 403 }
        );
      }

      const updateData: { lastLoginAt: Date; status?: 'active'; passwordHash?: string } = {
        lastLoginAt: new Date(),
      };
      if (user.status === 'pending') {
        // Google vient de prouver la possession de l'adresse : on active le compte,
        // mais on renouvelle le mot de passe local, qui a pu être choisi par un tiers
        // ayant créé ce compte avec l'adresse de la victime (pré-détournement).
        updateData.status = 'active';
        updateData.passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12);
        await prisma.otpCode.deleteMany({ where: { userId: user.id, purpose: 'registration', usedAt: null } });
        logger.info('Compte en attente activé par Google : mot de passe local renouvelé', { userId: user.id });
      }

      user = await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });

      await prisma.profile.upsert({
        where: { userId: user.id },
        update: {
          firstName: googleUser.firstName || undefined,
          lastName: googleUser.lastName || undefined,
          country: data.countryCode ?? undefined,
        },
        create: {
          userId: user.id,
          firstName: googleUser.firstName || 'Utilisateur',
          lastName: googleUser.lastName || 'Google',
          country: data.countryCode ?? 'SN',
        },
      });

      if (user.role === 'provider') {
        await prisma.providerProfile.upsert({
          where: { userId: user.id },
          update: {},
          create: {
            userId: user.id,
            isAvailable: true,
          },
        });
      }
    }

    const tokens = await this._generateTokens(user.id, user.role, { method: 'google', ip });
    logger.info(`Connexion Google réussie: ${user.id} (${ip})`);

    return {
      mfaRequired: false,
      ...tokens,
      user: {
        id: user.id,
        role: user.role,
        email: user.email,
        phone: user.phone,
      },
    };
  }

  /** Rotation du refresh token */
  async refreshTokens(refreshToken: string) {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw Object.assign(new Error('Refresh token invalide'), { status: 401 });
    }

    const session = await prisma.userSession.findFirst({
      where: { userId: payload.userId, id: payload.sessionId },
    });

    if (!session) {
      // Session renouvelée il y a moins d'une minute par une requête concurrente (deux onglets,
      // démarrage de page) : simple course, pas un vol → refus sans fermer les autres sessions.
      let recentlyRotated = false;
      try {
        recentlyRotated = Boolean(await redis.get(`refresh:rotated:${payload.sessionId}`));
      } catch {
        // Redis indisponible : on applique la règle de sécurité ci-dessous.
      }
      if (recentlyRotated) {
        throw Object.assign(new Error('Session déjà renouvelée par une autre requête.'), { status: 409, code: 'REFRESH_RACE' });
      }
      // Jeton déjà utilisé hors de cette fenêtre : possible vol — révoquer toute la famille.
      await prisma.userSession.deleteMany({ where: { userId: payload.userId } });
      throw Object.assign(new Error('Session invalide. Reconnectez-vous.'), { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, status: true },
    });
    if (!user || user.status === 'banned') {
      throw Object.assign(new Error('Accès refusé'), { status: 403 });
    }

    // Renouveler les tokens (la session remplacée reste reconnue 60 s comme « déjà renouvelée »)
    await prisma.userSession.delete({ where: { id: session.id } });
    try {
      await redis.setex(`refresh:rotated:${session.id}`, 60, '1');
    } catch {
      // Redis indisponible : une course éventuelle sera traitée comme une réutilisation.
    }
    return this._generateTokens(user.id, user.role, { method: 'refresh', ip: session.ipAddress ?? undefined, silent: true });
  }

  /** Déconnexion — révoque le token */
  async logout(userId: string, accessToken: string) {
    let sessionId: string | undefined;
    try {
      sessionId = verifyAccessToken(accessToken).sessionId;
    } catch {
      // jeton déjà expiré : rien à rattacher
    }
    await revokeToken(accessToken);
    // Ferme la session de cet appareil : son jeton de renouvellement devient inutilisable
    // (auparavant il restait valable 30 jours après la déconnexion).
    if (sessionId) await prisma.userSession.deleteMany({ where: { id: sessionId, userId } });
    logger.info('Déconnexion', { userId, sessionClosed: Boolean(sessionId) });
  }

  /** Mot de passe oublié — envoie un OTP de réinitialisation (réponse générique anti-énumération) */
  async forgotPassword(phone: string | undefined, email: string | undefined, ip: string) {
    const genericMessage = {
      message: 'Si un compte correspond, un code de réinitialisation a été envoyé.',
    };

    const user = await this._findUserByContact(phone, email);
    if (!user || user.status === 'banned') {
      return genericMessage;
    }

    // Invalider les anciens codes de reset non utilisés
    await prisma.otpCode.deleteMany({
      where: { userId: user.id, purpose: 'password_reset', usedAt: null },
    });

    try {
      await this._sendOtp(user.id, user.phone ?? undefined, user.email ?? undefined, 'password_reset', ip);
    } catch (err) {
      // On ne révèle pas l'échec d'envoi à l'appelant (anti-énumération)
      logger.error('Échec envoi OTP de réinitialisation', {
        userId: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return genericMessage;
  }

  /** Réinitialisation du mot de passe via OTP */
  async resetPassword(
    phone: string | undefined,
    email: string | undefined,
    code: string,
    newPassword: string
  ) {
    const user = await this._findUserByContact(phone, email);
    // Message générique pour ne pas distinguer "utilisateur inconnu" de "code invalide"
    if (!user) {
      throw Object.assign(new Error('Code invalide ou expiré.'), { status: 422 });
    }

    await this._validateOtp(user.id, code, 'password_reset');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, loginAttempts: 0, lockedUntil: null },
    });

    // Sécurité : invalider toutes les sessions existantes après changement de mot de passe
    await prisma.userSession.deleteMany({ where: { userId: user.id } });

    logger.info(`Mot de passe réinitialisé: ${user.id}`);
    return { message: 'Mot de passe réinitialisé. Vous pouvez vous connecter.' };
  }

  // ─── Méthodes privées ──────────────────────────────────────

  private async _findUserByContact(phone?: string, email?: string) {
    const contactFilters = this._buildContactFilters(phone, email);
    if (contactFilters.length === 0) return null;

    return prisma.user.findFirst({
      where: {
        OR: contactFilters,
        deletedAt: null,
      },
    });
  }

  private _buildContactFilters(phone?: string, email?: string) {
    const filters: Array<{ phone: string } | { email: string }> = [];
    const normalizedPhone = phone?.trim();
    const normalizedEmail = email?.trim().toLowerCase();

    if (normalizedPhone) filters.push({ phone: normalizedPhone });
    if (normalizedEmail) filters.push({ email: normalizedEmail });
    return filters;
  }

  private async _verifyGoogleIdToken(idToken: string) {
    // Sans GOOGLE_CLIENT_ID, impossible de vérifier que le jeton a été émis pour
    // BLA : un jeton obtenu par n'importe quelle autre application serait accepté.
    if (!env.GOOGLE_CLIENT_ID) {
      if (env.NODE_ENV === 'production') {
        logger.error('Connexion Google refusée : GOOGLE_CLIENT_ID absent en production');
        throw Object.assign(
          new Error('Connexion Google momentanément indisponible.'),
          { status: 503, code: 'GOOGLE_LOGIN_NOT_CONFIGURED' }
        );
      }
      logger.warn('GOOGLE_CLIENT_ID absent : audience du jeton Google non vérifiée (hors production uniquement).');
    }

    try {
      const response = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
        params: { id_token: idToken },
        timeout: 10_000,
      });

      const payload = response.data as {
        aud?: string;
        iss?: string;
        sub?: string;
        exp?: string;
        email?: string;
        email_verified?: string;
        given_name?: string;
        family_name?: string;
      };

      const expiresAt = Number(payload.exp ?? 0);
      if (!payload.sub || !Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) {
        throw Object.assign(new Error('Jeton Google expiré ou incomplet'), { status: 401 });
      }

      if (!payload.email || payload.email_verified !== 'true') {
        throw Object.assign(new Error('Compte Google non vérifié'), { status: 401 });
      }

      if (env.GOOGLE_CLIENT_ID && payload.aud !== env.GOOGLE_CLIENT_ID) {
        throw Object.assign(new Error('Audience Google invalide'), { status: 401 });
      }

      if (!payload.iss || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) {
        throw Object.assign(new Error('Émetteur Google invalide'), { status: 401 });
      }

      return {
        id: payload.sub || '',
        email: payload.email,
        firstName: payload.given_name || '',
        lastName: payload.family_name || '',
      };
    } catch {
      throw Object.assign(new Error('Google login impossible. Vérifiez votre token.'), { status: 401 });
    }
  }

  private async _sendOtp(
    userId: string,
    phone: string | undefined,
    email: string | undefined,
    purpose: OtpFlowPurpose,
    ip: string
  ) {
    // Un code envoyé il y a moins de OTP_RESEND_COOLDOWN_SEC secondes reste valable : on n'en
    // crée pas d'autre (évite les rafales de codes quand l'utilisateur clique plusieurs fois
    // ou qu'une requête est rejouée, et le refus du code reçu au profit d'un code plus récent).
    const cooldownKey = `otp:cooldown:${userId}:${purpose}`;
    try {
      const remaining = await redis.ttl(cooldownKey);
      if (typeof remaining === 'number' && remaining > 0) {
        logger.info('OTP non renvoyé : un code récent est encore valable', { userId, purpose, retryAfterSec: remaining });
        return { reused: true, retryAfterSec: remaining };
      }
    } catch {
      // Redis indisponible : envoi normal (le délai minimal ne s'applique pas).
    }

    const startedAt = Date.now();
    const code     = generateOTP();
    const codeHash = await hashOTP(code);

    const otpRow = await prisma.otpCode.create({
      select: { id: true },
      data: {
        userId,
        phone,
        email,
        codeHash,
        purpose,
        expiresAt: otpExpiresAt(10),
        ipAddress: ip,
      },
    });

    const template = purpose === 'registration' ? 'otp_register'
                   : purpose === 'login'        ? 'otp_login'
                   : 'otp_password_reset';

    let delivered = false;

    // Le SMS n'est tenté que si un fournisseur est configuré : sans Twilio, le
    // canal est simplement indisponible et l'OTP part uniquement par e-mail.
    const smsAvailable = Boolean(phone) && isSmsConfigured();
    let smsOutcome: 'absent' | 'non configuré' | 'envoyé' | 'échec' = !phone ? 'absent' : smsAvailable ? 'échec' : 'non configuré';
    let emailOutcome: 'absent' | 'envoyé' | 'échec' = email ? 'échec' : 'absent';

    if (phone && smsAvailable) {
      try {
        const smsSent = await sendSMS(phone, template, [code]);
        if (smsSent) smsOutcome = 'envoyé';
        delivered = delivered || smsSent;
      } catch (err) {
        logger.error('Echec canal OTP SMS', {
          userId,
          purpose,
          phone: maskPhone(phone),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (email) {
      try {
        const emailData = purpose === 'registration' ? emailTemplates.otpRegister(code)
                        : purpose === 'login'        ? emailTemplates.otpLogin(code)
                        : emailTemplates.otpPasswordReset(code);
        const emailSent = await sendEmail({ to: email, ...emailData });
        if (emailSent) emailOutcome = 'envoyé';
        delivered = delivered || emailSent;
      } catch (err) {
        logger.error('Echec canal OTP email', {
          userId,
          purpose,
          email: maskEmail(email),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!delivered) {
      // Code jamais reçu : invalidé tout de suite, pour qu'un code reçu plus tôt reste utilisable.
      try {
        if (otpRow?.id) await prisma.otpCode.update({ where: { id: otpRow.id }, data: { expiresAt: new Date() } });
      } catch {
        // sans effet sur la réponse : le code expirera de lui-même
      }
      // La cause précise (ex. IP refusée par Brevo) est journalisée par le service e-mail.
      logger.error('OTP non délivré : aucun canal disponible', {
        userId, purpose, email: emailOutcome, sms: smsOutcome, durationMs: Date.now() - startedAt,
      });
      throw Object.assign(
        new Error('Aucun canal OTP disponible. Utilisez un email valide ou contactez le support.'),
        { status: 503, code: 'OTP_DELIVERY_FAILED' }
      );
    }

    // Le nouveau code remplace les précédents encore valides (un seul code utilisable à la fois).
    try {
      await prisma.otpCode.updateMany({
        where: { userId, purpose, usedAt: null, ...(otpRow?.id ? { id: { not: otpRow.id } } : {}), expiresAt: { gt: new Date() } },
        data: { expiresAt: new Date() },
      });
    } catch {
      // sans effet sur la réponse : seul le code le plus récent est vérifié
    }
    try {
      await redis.setex(cooldownKey, OTP_RESEND_COOLDOWN_SEC, '1');
    } catch {
      // Redis indisponible : pas de délai minimal.
    }
    logger.info('OTP envoyé', { userId, purpose, email: emailOutcome, sms: smsOutcome, durationMs: Date.now() - startedAt });

    // Hors production uniquement : afficher l'OTP dans les logs pour le développement.
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`[OTP DEV] Code pour ${phone ? maskPhone(phone) : maskEmail(email)}: ${code}`);
    }
  }

  private async _validateOtp(
    userId: string,
    code: string,
    purpose: OtpFlowPurpose
  ) {
    const otp = await prisma.otpCode.findFirst({
      where: {
        userId,
        purpose,
        usedAt:  null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw Object.assign(new Error('Code OTP expiré ou introuvable'), { status: 422 });
    }

    // Limiter les tentatives (3 max)
    if (otp.attempts >= 3) {
      throw Object.assign(new Error('Trop de tentatives. Demandez un nouveau code.'), { status: 429 });
    }

    const valid = await verifyOTP(code, otp.codeHash);
    if (!valid) {
      await prisma.otpCode.update({
        where: { id: otp.id },
        data:  { attempts: { increment: 1 } },
      });
      throw Object.assign(new Error('Code OTP incorrect'), { status: 422 });
    }

    await prisma.otpCode.update({
      where: { id: otp.id },
      data:  { usedAt: new Date() },
    });
  }

  private async _handleFailedLogin(userId: string, currentAttempts: number) {
    const attempts = currentAttempts + 1;
    const data: Record<string, unknown> = { loginAttempts: attempts };

    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      data.lockedUntil = new Date(Date.now() + LOCK_DURATION_MIN * 60_000);
      logger.warn(`Compte verrouillé: ${userId} (${attempts} échecs)`);
    }

    await prisma.user.update({ where: { id: userId }, data });
    await writeAudit({
      userId, action: 'auth.login.failed', entity: 'user', entityId: userId,
      newData: { attempts, locked: attempts >= MAX_LOGIN_ATTEMPTS },
    });
  }

  private async _createMfaTempToken(userId: string, ip: string): Promise<string> {
    const token = generateTokenFamily();
    await redis.setex(`mfa_temp:${token}`, 5 * 60, JSON.stringify({ userId, ip }));
    return token;
  }

  /**
   * Ouvre une session. Chaque connexion (hors renouvellement silencieux du jeton) est
   * journalisée « auth.login.success » avec la méthode et l'adresse IP : c'est
   * l'historique des connexions consultable par l'équipe habilitée.
   */
  private async _generateTokens(
    userId: string,
    role: string,
    ctx: { method: string; ip?: string; silent?: boolean } = { method: 'inconnue' },
  ) {
    // Créer une session
    const session = await prisma.userSession.create({
      data: {
        userId,
        refreshHash: generateTokenFamily(),
        ipAddress: ctx.ip ? ctx.ip.slice(0, 45) : null,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    if (!ctx.silent) {
      await writeAudit({ userId, action: 'auth.login.success', entity: 'user', entityId: userId, ip: ctx.ip, newData: { method: ctx.method } });
    }

    const accessToken = signAccessToken({ userId, role, sessionId: session.id });
    const refreshToken = signRefreshToken({
      userId,
      sessionId: session.id,
      tokenFamily: session.refreshHash,
    });

    // Garder max 5 sessions actives
    const sessions = await prisma.userSession.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (sessions.length > 5) {
      const toDelete = sessions.slice(5).map((s) => s.id);
      await prisma.userSession.deleteMany({ where: { id: { in: toDelete } } });
    }

    return { accessToken, refreshToken };
  }
}

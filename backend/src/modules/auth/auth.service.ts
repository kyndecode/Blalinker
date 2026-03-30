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
  revokeToken,
  generateTokenFamily,
} from '../../utils/jwt.util';
import { generateOTP, hashOTP, verifyOTP, otpExpiresAt } from '../../utils/otp.util';
import { sendSMS } from '../../utils/sms.util';
import { sendEmail, emailTemplates } from '../../config/email';
import type { RegisterInput, LoginInput, ResendOtpInput, GoogleLoginInput } from './auth.schemas';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MIN  = 30;
type OtpFlowPurpose = 'registration' | 'login' | 'password_reset' | 'payment_confirm';

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
          email: user.email,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    const tokens = await this._generateTokens(user.id, user.role);
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

    // Réinitialiser les tentatives après succès
    await prisma.user.update({
      where: { id: user.id },
      data:  { loginAttempts: 0, lockedUntil: null },
    });

    // MFA activé → envoyer l'OTP
    if (user.mfaEnabled) {
      const tempToken = await this._createMfaTempToken(user.id, ip);
      await this._sendOtp(user.id, user.phone ?? undefined, user.email ?? undefined, 'login', ip);
      return {
        mfaRequired: true,
        tempToken,
        user: { id: user.id, role: user.role, email: user.email, phone: user.phone },
      };
    }

    // MFA désactivé → connexion directe
    const tokens = await this._generateTokens(user.id, user.role);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { mfaRequired: false, ...tokens, user: { id: user.id, role: user.role } };
  }

  /** Validation OTP MFA → retourne les tokens */
  async verifyMfa(tempToken: string, otpCode: string) {
    const data = await redis.get(`mfa_temp:${tempToken}`);
    if (!data) throw Object.assign(new Error('Session MFA expirée'), { status: 401 });

    const { userId, ip } = JSON.parse(data) as { userId: string; ip: string };
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Object.assign(new Error('Utilisateur introuvable'), { status: 404 });

    await this._validateOtp(userId, otpCode, 'login');
    await redis.del(`mfa_temp:${tempToken}`);

    const tokens = await this._generateTokens(userId, user.role);
    await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });

    logger.info(`Connexion réussie: ${userId} depuis ${ip}`);
    return { ...tokens, user: { id: userId, role: user.role } };
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
      if (user.status === 'banned') {
        throw Object.assign(new Error('Compte suspendu. Contactez le support.'), { status: 403 });
      }

      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          status: 'active',
          lastLoginAt: new Date(),
        },
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

    const tokens = await this._generateTokens(user.id, user.role);
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
      // Possible vol de token — révoquer toute la famille
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

    // Renouveler les tokens
    await prisma.userSession.delete({ where: { id: session.id } });
    return this._generateTokens(user.id, user.role);
  }

  /** Déconnexion — révoque le token */
  async logout(userId: string, accessToken: string) {
    await revokeToken(accessToken);
    // Supprimer toutes les sessions de cet utilisateur sur cet appareil
    // (on pourrait aussi ne révoquer que la session courante)
    logger.info(`Déconnexion: ${userId}`);
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
    try {
      const response = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
        params: { id_token: idToken },
        timeout: 10_000,
      });

      const payload = response.data as {
        aud?: string;
        iss?: string;
        sub?: string;
        email?: string;
        email_verified?: string;
        given_name?: string;
        family_name?: string;
      };

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
    const code     = generateOTP();
    const codeHash = await hashOTP(code);

    await prisma.otpCode.create({
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

    if (phone) {
      try {
        const smsSent = await sendSMS(phone, template, [code]);
        delivered = delivered || smsSent;
      } catch (err) {
        logger.error('Echec canal OTP SMS', {
          userId,
          purpose,
          phone,
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
        delivered = delivered || emailSent;
      } catch (err) {
        logger.error('Echec canal OTP email', {
          userId,
          purpose,
          email,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!delivered) {
      throw Object.assign(
        new Error('Aucun canal OTP disponible. Utilisez un email valide ou contactez le support.'),
        { status: 503 }
      );
    }

    // En dev, afficher l'OTP dans les logs
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`[OTP DEV] Code pour ${phone ?? email}: ${code}`);
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
  }

  private async _createMfaTempToken(userId: string, ip: string): Promise<string> {
    const token = generateTokenFamily();
    await redis.setex(`mfa_temp:${token}`, 5 * 60, JSON.stringify({ userId, ip }));
    return token;
  }

  private async _generateTokens(userId: string, role: string) {
    // Créer une session
    const session = await prisma.userSession.create({
      data: {
        userId,
        refreshHash: generateTokenFamily(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

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

import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { mfaService } from './mfa.service';
import { logger } from '../../config/logger';
import {
  isCookieAuthMode,
  setRefreshCookie,
  clearRefreshCookie,
  getRefreshToken,
} from '../../utils/cookies.util';

const authService = new AuthService();

/** Réponse d'erreur MFA : message, code et délai éventuel (jamais de détail interne). */
function sendMfaError(res: Response, err: unknown): Response {
  const e = err as { message?: string; status?: number; code?: string; retryAfter?: number };
  const status = e.status ?? 500;
  if (status >= 500 && !e.code) logger.error('Erreur MFA', { error: e.message });
  if (e.retryAfter) res.setHeader('Retry-After', String(e.retryAfter));
  return res.status(status).json({
    error: status >= 500 && !e.code ? 'Erreur serveur' : e.message,
    ...(e.code ? { code: e.code } : {}),
    ...(e.retryAfter ? { retryAfter: e.retryAfter } : {}),
  });
}

/**
 * Envoie le résultat d'authentification.
 * En mode cookie (web), le refresh token est posé en cookie HttpOnly et retiré du body.
 */
function sendAuthResult(
  req: Request,
  res: Response,
  result: Record<string, unknown>,
  status = 200
): Response {
  const refreshToken = result.refreshToken;
  if (typeof refreshToken === 'string' && isCookieAuthMode(req)) {
    setRefreshCookie(res, refreshToken);
    const { refreshToken: _omit, ...rest } = result;
    return res.status(status).json(rest);
  }
  return res.status(status).json(result);
}

export const authController = {
  async register(req: Request, res: Response) {
    try {
      const result = await authService.register(req.body, req.ip ?? '');
      res.status(201).json(result);
    } catch (err: unknown) {
      const e = err as { message: string; status?: number };
      res.status(e.status ?? 500).json({ error: e.message });
    }
  },

  async verifyOtp(req: Request, res: Response) {
    try {
      const { phone, email, code } = req.body;
      const result = await authService.verifyRegistration(phone, email, code);
      sendAuthResult(req, res, result);
    } catch (err: unknown) {
      const e = err as { message: string; status?: number };
      res.status(e.status ?? 500).json({ error: e.message });
    }
  },

  async resendOtp(req: Request, res: Response) {
    try {
      const { phone, email, purpose } = req.body;
      const result = await authService.resendOtp(phone, email, purpose, req.ip ?? '');
      res.json(result);
    } catch (err: unknown) {
      const e = err as { message: string; status?: number };
      res.status(e.status ?? 500).json({ error: e.message });
    }
  },

  async login(req: Request, res: Response) {
    try {
      const result = await authService.login(req.body, req.ip ?? '');
      sendAuthResult(req, res, result);
    } catch (err: unknown) {
      const e = err as { message: string; status?: number };
      res.status(e.status ?? 500).json({ error: e.message });
    }
  },

  async verifyMfa(req: Request, res: Response) {
    try {
      const { tempToken, otpCode, method } = req.body;
      const result = await authService.verifyMfa(tempToken, otpCode, method);
      sendAuthResult(req, res, result);
    } catch (err: unknown) {
      const e = err as { message: string; status?: number };
      res.status(e.status ?? 500).json({ error: e.message });
    }
  },

  /** POST /auth/login/mfa/email — secours : code par e-mail à l'adresse du compte */
  async requestMfaEmail(req: Request, res: Response) {
    try {
      res.json(await authService.requestMfaEmailFallback(req.body.tempToken, req.ip ?? ''));
    } catch (err: unknown) {
      sendMfaError(res, err);
    }
  },

  /** GET /auth/mfa/status */
  async mfaStatus(req: Request, res: Response) {
    try {
      res.json(await mfaService.getStatus(req.user!.id));
    } catch (err: unknown) {
      sendMfaError(res, err);
    }
  },

  /** POST /auth/mfa/totp/setup — mot de passe redemandé ; QR code montré une seule fois */
  async totpSetup(req: Request, res: Response) {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.json(await mfaService.beginTotpSetup(req.user!.id, req.body.password, req.ip ?? ''));
    } catch (err: unknown) {
      sendMfaError(res, err);
    }
  },

  /** POST /auth/mfa/totp/activate — premier code obligatoire ; codes de récupération montrés une fois */
  async totpActivate(req: Request, res: Response) {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.json(await mfaService.activateTotp(req.user!.id, req.body.code, req.ip ?? ''));
    } catch (err: unknown) {
      sendMfaError(res, err);
    }
  },

  /** POST /auth/mfa/recovery-codes — nouveaux codes (exige un code de l'application) */
  async regenerateRecoveryCodes(req: Request, res: Response) {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.json(await mfaService.regenerateRecoveryCodes(req.user!.id, req.body.code, req.ip ?? ''));
    } catch (err: unknown) {
      sendMfaError(res, err);
    }
  },

  async googleLogin(req: Request, res: Response) {
    try {
      const result = await authService.googleLogin(req.body, req.ip ?? '');
      sendAuthResult(req, res, result);
    } catch (err: unknown) {
      const e = err as { message: string; status?: number };
      res.status(e.status ?? 500).json({ error: e.message });
    }
  },

  async forgotPassword(req: Request, res: Response) {
    try {
      const { phone, email } = req.body;
      const result = await authService.forgotPassword(phone, email, req.ip ?? '');
      res.json(result);
    } catch (err: unknown) {
      const e = err as { message: string; status?: number };
      res.status(e.status ?? 500).json({ error: e.message });
    }
  },

  async resetPassword(req: Request, res: Response) {
    try {
      const { phone, email, code, password } = req.body;
      const result = await authService.resetPassword(phone, email, code, password);
      res.json(result);
    } catch (err: unknown) {
      const e = err as { message: string; status?: number };
      res.status(e.status ?? 500).json({ error: e.message });
    }
  },

  async refreshToken(req: Request, res: Response) {
    try {
      const token = getRefreshToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Refresh token manquant' });
      }
      const result = await authService.refreshTokens(token);
      return sendAuthResult(req, res, result);
    } catch (err: unknown) {
      const e = err as { message: string; status?: number };
      // En cas d'échec en mode cookie, on nettoie le cookie potentiellement invalide.
      if (isCookieAuthMode(req)) clearRefreshCookie(res);
      return res.status(e.status ?? 401).json({ error: e.message });
    }
  },

  async logout(req: Request, res: Response) {
    try {
      const token = req.headers.authorization?.split(' ')[1] ?? '';
      await authService.logout(req.user!.id, token);
      clearRefreshCookie(res);
      res.json({ message: 'Déconnexion réussie' });
    } catch (err: unknown) {
      logger.error('Erreur logout:', err);
      res.status(500).json({ error: 'Erreur lors de la déconnexion' });
    }
  },
};

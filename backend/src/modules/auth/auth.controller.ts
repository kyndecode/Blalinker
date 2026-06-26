import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { logger } from '../../config/logger';
import {
  isCookieAuthMode,
  setRefreshCookie,
  clearRefreshCookie,
  getRefreshToken,
} from '../../utils/cookies.util';

const authService = new AuthService();

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
      const { tempToken, otpCode } = req.body;
      const result = await authService.verifyMfa(tempToken, otpCode);
      sendAuthResult(req, res, result);
    } catch (err: unknown) {
      const e = err as { message: string; status?: number };
      res.status(e.status ?? 500).json({ error: e.message });
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

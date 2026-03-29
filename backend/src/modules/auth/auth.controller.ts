import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { logger } from '../../config/logger';

const authService = new AuthService();

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
      res.json(result);
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
      res.json(result);
    } catch (err: unknown) {
      const e = err as { message: string; status?: number };
      res.status(e.status ?? 500).json({ error: e.message });
    }
  },

  async verifyMfa(req: Request, res: Response) {
    try {
      const { tempToken, otpCode } = req.body;
      const result = await authService.verifyMfa(tempToken, otpCode);
      res.json(result);
    } catch (err: unknown) {
      const e = err as { message: string; status?: number };
      res.status(e.status ?? 500).json({ error: e.message });
    }
  },

  async refreshToken(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;
      const result = await authService.refreshTokens(refreshToken);
      res.json(result);
    } catch (err: unknown) {
      const e = err as { message: string; status?: number };
      res.status(e.status ?? 401).json({ error: e.message });
    }
  },

  async logout(req: Request, res: Response) {
    try {
      const token = req.headers.authorization?.split(' ')[1] ?? '';
      await authService.logout(req.user!.id, token);
      res.json({ message: 'Déconnexion réussie' });
    } catch (err: unknown) {
      logger.error('Erreur logout:', err);
      res.status(500).json({ error: 'Erreur lors de la déconnexion' });
    }
  },
};

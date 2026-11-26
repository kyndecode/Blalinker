import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { contactController } from './contact.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { captchaGuard } from '../../middlewares/captcha.middleware';
import { createContactSchema } from './contact.schemas';
import { makeStore } from '../../middlewares/security.middleware';
import { env } from '../../config/env';

const router = Router();

/** Formulaire public : 5 envois par heure et par adresse IP (un usage normal en demande un ou deux). */
export const publicContactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.NODE_ENV === 'test' ? 10_000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:contact:'),
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Trop de messages envoyés depuis cette connexion. Réessayez dans une heure ou écrivez à contact@blalinker.com.',
      code: 'CONTACT_RATE_LIMIT',
    });
  },
});

router.post('/', publicContactLimiter, captchaGuard(), validate(createContactSchema), contactController.createPublic);
router.post('/auth', authenticate, validate(createContactSchema), contactController.createAuthenticated);
router.get('/my', authenticate, contactController.listMine);

export default router;

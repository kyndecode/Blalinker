import { Router } from 'express';
import express from 'express';
import { paymentsController } from './payments.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

// Routes authentifiées
router.post('/init',   authenticate, paymentsController.init);
router.get('/verify',  authenticate, paymentsController.verify);

// Webhooks — PAS d'authentification JWT (appelés par CinetPay/Stripe)
// Le webhook Stripe nécessite le body brut (Buffer)
router.post(
  '/webhook/stripe',
  express.raw({ type: 'application/json' }),
  paymentsController.webhookStripe
);
router.post('/webhook/cinetpay', paymentsController.webhookCinetPay);

export default router;

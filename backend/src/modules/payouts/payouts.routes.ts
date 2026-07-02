import { Router } from 'express';
import { payoutsController } from './payouts.controller';
import { authenticate, requireProvider } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { requestPayoutSchema } from './payouts.schemas';

const router = Router();

// Espace prestataire : solde + retraits
router.use(authenticate, requireProvider);

router.get('/me/balance', payoutsController.myBalance);
router.get('/me', payoutsController.listMine);
router.post('/me/request', validate(requestPayoutSchema), payoutsController.requestMine);

export default router;

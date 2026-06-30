import { Router } from 'express';
import { reviewsController } from './reviews.controller';
import { authenticate, requireProvider } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { createReviewSchema, respondReviewSchema } from './reviews.schemas';

const router = Router();

router.use(authenticate);

router.post('/', validate(createReviewSchema), reviewsController.create);
router.get('/me', reviewsController.listMine);
router.put('/:id/respond', requireProvider, validate(respondReviewSchema), reviewsController.respond);

export default router;

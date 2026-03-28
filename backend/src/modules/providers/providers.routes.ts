import { Router } from 'express';
import { providersController } from './providers.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { searchSchema } from './providers.schemas';

const router = Router();

// GET /api/v1/providers/search — public
router.get('/search',
  validate(searchSchema, 'query'),
  providersController.search
);

// GET /api/v1/providers/:id — public
router.get('/:id', providersController.getProfile);

// GET /api/v1/providers/:id/reviews — public
router.get('/:id/reviews', providersController.getReviews);

// PUT /api/v1/providers/me/availability — protégé
router.put('/me/availability',
  authenticate,
  providersController.updateAvailability
);

export default router;

import { Router } from 'express';
import { providersController } from './providers.controller';
import { authenticate, requireProvider } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import {
  searchSchema,
  upsertProviderProfileSchema,
  createProviderServiceSchema,
  updateProviderServiceSchema,
} from './providers.schemas';

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

// GET /api/v1/providers/me/profile — protégé
router.get('/me/profile',
  authenticate,
  requireProvider,
  providersController.getMyProfile
);

// POST /api/v1/providers/me/profile — protégé
router.post('/me/profile',
  authenticate,
  requireProvider,
  validate(upsertProviderProfileSchema),
  providersController.upsertMyProfile
);

// PUT /api/v1/providers/me/profile — protégé
router.put('/me/profile',
  authenticate,
  requireProvider,
  validate(upsertProviderProfileSchema),
  providersController.upsertMyProfile
);

// PUT /api/v1/providers/me/availability — protégé
router.put('/me/availability',
  authenticate,
  requireProvider,
  providersController.updateAvailability
);

// GET /api/v1/providers/me/services — protégé
router.get('/me/services',
  authenticate,
  requireProvider,
  providersController.listMyServices
);

// POST /api/v1/providers/me/services — protégé
router.post('/me/services',
  authenticate,
  requireProvider,
  validate(createProviderServiceSchema),
  providersController.createMyService
);

// PUT /api/v1/providers/me/services/:id — protégé
router.put('/me/services/:id',
  authenticate,
  requireProvider,
  validate(updateProviderServiceSchema),
  providersController.updateMyService
);

// DELETE /api/v1/providers/me/services/:id — protégé
router.delete('/me/services/:id',
  authenticate,
  requireProvider,
  providersController.deleteMyService
);

export default router;

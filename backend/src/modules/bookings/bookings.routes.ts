import { Router } from 'express';
import { bookingsController } from './bookings.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { createBookingSchema } from './bookings.schemas';

const router = Router();

// Toutes les routes requièrent une authentification
router.use(authenticate);

router.post('/', validate(createBookingSchema), bookingsController.create);
router.get('/:id', bookingsController.getOne);
router.put('/:id/accept',   bookingsController.accept);
router.put('/:id/reject',   bookingsController.reject);
router.put('/:id/start',    bookingsController.start);
router.put('/:id/complete', bookingsController.complete);
router.put('/:id/validate', bookingsController.validate);
router.put('/:id/cancel',   bookingsController.cancel);

export default router;

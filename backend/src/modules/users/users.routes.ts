import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { usersController } from './users.controller';
import { updateMeSchema } from './users.schemas';

const router = Router();

router.get('/me', authenticate, usersController.getMe);
router.patch('/me', authenticate, validate(updateMeSchema), usersController.updateMe);

export default router;

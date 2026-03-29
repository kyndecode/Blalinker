import { Router } from 'express';
import { contactController } from './contact.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { createContactSchema } from './contact.schemas';

const router = Router();

router.post('/', validate(createContactSchema), contactController.createPublic);
router.post('/auth', authenticate, validate(createContactSchema), contactController.createAuthenticated);
router.get('/my', authenticate, contactController.listMine);

export default router;

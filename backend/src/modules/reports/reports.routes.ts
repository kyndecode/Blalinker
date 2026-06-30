import { Router } from 'express';
import { reportsController } from './reports.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { createReportSchema } from './reports.schemas';

const router = Router();

router.use(authenticate);

router.post('/', validate(createReportSchema), reportsController.create);
router.get('/my', reportsController.listMine);

export default router;

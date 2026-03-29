import { Router } from 'express';
import { validate } from '../../middlewares/validate.middleware';
import { servicesController } from './services.controller';
import { listServicesQuerySchema } from './services.schemas';

const router = Router();

router.get('/',
  validate(listServicesQuerySchema, 'query'),
  servicesController.list
);

router.get('/:id', servicesController.getOne);

export default router;

import { Router } from 'express';
import { categoriesController } from './categories.controller';

const router = Router();

router.get('/',      categoriesController.list);
router.get('/:slug', categoriesController.getBySlug);

export default router;

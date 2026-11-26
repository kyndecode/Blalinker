import { Router } from 'express';
import { validate } from '../../middlewares/validate.middleware';
import { searchController, searchQuerySchema, suggestQuerySchema } from './search.controller';

const router = Router();

// Public, en lecture seule ; aucune donnée personnelle de contact dans les réponses.
router.get('/', validate(searchQuerySchema, 'query'), searchController.search);
router.get('/suggest', validate(suggestQuerySchema, 'query'), searchController.suggest);

export default router;

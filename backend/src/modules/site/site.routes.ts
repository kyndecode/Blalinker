import { Router } from 'express';
import { siteController } from './site.controller';

const router = Router();

// Données publiques en lecture seule (aucune donnée personnelle).
router.get('/config', siteController.config);
router.get('/stats', siteController.stats);
router.get('/testimonials', siteController.testimonials);

export default router;

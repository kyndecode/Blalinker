import { Router } from 'express';
import { siteController } from './site.controller';
import { contentPublicController } from '../content/content.controller';

const router = Router();

// Données publiques en lecture seule (aucune donnée personnelle).
router.get('/health', siteController.health);
router.get('/config', siteController.config);
router.get('/stats', siteController.stats);
router.get('/testimonials', siteController.testimonials);
router.get('/settings', contentPublicController.settings);
router.get('/countries', contentPublicController.countries);
router.get('/pages/:slug', contentPublicController.page);
router.get('/faq', contentPublicController.faq);
router.get('/announcements', contentPublicController.announcements);

export default router;

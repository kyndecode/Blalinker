import { Router } from 'express';
import { adminController } from './admin.controller';
import { teamController } from './team.controller';
import { authenticate, requireAdmin, requirePermission, adminRateLimit, requireAdminTotpWhenEnforced } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { updateContactStatusSchema } from '../contact/contact.schemas';
import { createAdminSchema, updateAdminSchema, resetAdminPasswordSchema } from './team.schemas';
import {
  createCategorySchema,
  rejectReviewSchema,
  resolveDisputeSchema,
  resolveReportSchema,
  updateCategorySchema,
  updateUserStatusSchema,
  verifyIdentitySchema,
} from './admin.schemas';
import { payoutsController } from '../payouts/payouts.controller';
import { processPayoutSchema } from '../payouts/payouts.schemas';
import { PERMISSIONS as P } from '../../config/permissions';
import multer from 'multer';
import { contentAdminController as content } from '../content/content.controller';
import {
  createAnnouncementSchema, createCountrySchema, createFaqSchema, createPageSchema,
  updateAnnouncementSchema, updateCountrySchema, updateFaqSchema, updateMediaSchema, updatePageSchema, upsertSettingSchema,
} from '../content/content.schemas';

/** Images du site : JPEG, PNG, WebP ou GIF (pas de SVG, qui peut contenir du script), 5 Mo maximum. */
const SITE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const siteImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, SITE_IMAGE_TYPES.has(file.mimetype)),
});

const router = Router();

// Toutes les routes admin : rate limit strict + auth + rôle admin
// (+ application d'authentification obligatoire si ADMIN_TOTP_REQUIRED=true)
router.use(adminRateLimit, authenticate, requireAdmin, requireAdminTotpWhenEnforced);

// ─── Lecture : chaque liste exige sa permission (super_admin : toutes) ───
router.get('/dashboard',        requirePermission(P.STATS_READ),        adminController.dashboard);
router.get('/users',            requirePermission(P.USERS_READ),        adminController.listUsers);
router.get('/users/:id',        requirePermission(P.USERS_READ),        adminController.getUser);
router.get('/users/:id/id-document', requirePermission(P.PROVIDERS_VERIFY), adminController.idDocument);
router.get('/providers',        requirePermission(P.PROVIDERS_READ),    adminController.listProviders);
router.get('/bookings',         requirePermission(P.BOOKINGS_READ),     adminController.listBookings);
router.get('/reviews',          requirePermission(P.REVIEWS_MODERATE),  adminController.listReviews);
router.get('/reviews/pending',  requirePermission(P.REVIEWS_MODERATE),  adminController.pendingReviews);
router.get('/reports',          requirePermission(P.REPORTS_HANDLE),    adminController.listReports);
router.get('/contacts',         requirePermission(P.CONTACTS_HANDLE),   adminController.listContacts);
router.get('/transactions',     requirePermission(P.PAYMENTS_READ),     adminController.listTransactions);

// ─── Marketplace : retraits & remboursements ──────────────────
router.get('/payouts',              requirePermission(P.PAYMENTS_READ),   payoutsController.adminList);
router.patch('/payouts/:id',        requirePermission(P.PAYMENTS_REFUND), validate(processPayoutSchema), payoutsController.adminProcess);
router.post('/transactions/:id/refund', requirePermission(P.PAYMENTS_REFUND), payoutsController.adminRefund);
router.get('/categories',       requirePermission(P.CATEGORIES_MANAGE), adminController.listCategories);

// ─── Actions (permissions granulaires — super_admin bypass) ───
router.put('/users/:id/status',     requirePermission(P.USERS_SUSPEND),   validate(updateUserStatusSchema), adminController.updateUserStatus);
router.post('/users/:id/verify-id', requirePermission(P.PROVIDERS_VERIFY), validate(verifyIdentitySchema), adminController.verifyIdentity);

router.put('/reviews/:id/approve',  requirePermission(P.REVIEWS_MODERATE), adminController.approveReview);
router.put('/reviews/:id/reject',   requirePermission(P.REVIEWS_MODERATE), validate(rejectReviewSchema), adminController.rejectReview);
router.delete('/reviews/:id',       requirePermission(P.REVIEWS_MODERATE), adminController.deleteReview);

router.patch('/reports/:id',        requirePermission(P.REPORTS_HANDLE), validate(resolveReportSchema), adminController.resolveReport);
router.put('/reports/:id/resolve',  requirePermission(P.REPORTS_HANDLE), validate(resolveReportSchema), adminController.resolveReport);
router.post('/bookings/:id/resolve-dispute', requirePermission(P.REPORTS_HANDLE), validate(resolveDisputeSchema), adminController.resolveDispute);

router.patch('/contacts/:id/status', requirePermission(P.CONTACTS_HANDLE), validate(updateContactStatusSchema), adminController.updateContactStatus);

router.post('/categories',      requirePermission(P.CATEGORIES_MANAGE), validate(createCategorySchema), adminController.createCategory);
router.delete('/categories/:id', requirePermission(P.CATEGORIES_MANAGE), adminController.deleteCategory);
router.put('/categories/:id',   requirePermission(P.CATEGORIES_MANAGE), validate(updateCategorySchema), adminController.updateCategory);

// ─── Journal d'audit ──────────────────────────────────────────
router.get('/audit', requirePermission(P.AUDIT_READ), teamController.auditLog);

// ─── Gestion de l'équipe admin (RBAC) ─────────────────────────
router.get('/team/meta', requirePermission(P.ADMINS_MANAGE), teamController.meta);
router.get('/team',      requirePermission(P.ADMINS_MANAGE), teamController.list);
router.post('/team',     requirePermission(P.ADMINS_MANAGE), validate(createAdminSchema), teamController.create);
router.patch('/team/:id', requirePermission(P.ADMINS_MANAGE), validate(updateAdminSchema), teamController.update);
router.delete('/team/:id', requirePermission(P.ADMINS_MANAGE), teamController.remove);
router.post('/team/:id/force-logout', requirePermission(P.ADMINS_MANAGE), teamController.forceLogout);
router.post('/team/:id/reset-password', requirePermission(P.ADMINS_MANAGE), validate(resetAdminPasswordSchema), teamController.resetPassword);
router.post('/team/:id/reset-mfa', requirePermission(P.ADMINS_MANAGE), teamController.resetMfa);

// ─── Contenus du site (lot 2) ───────────────────────────────
const CM = requirePermission(P.CONTENT_MANAGE);
const SM = requirePermission(P.SETTINGS_MANAGE);
router.get('/content/pages', CM, content.listPages);
router.post('/content/pages', CM, validate(createPageSchema), content.createPage);
router.get('/content/pages/:id', CM, content.getPage);
router.put('/content/pages/:id', CM, validate(updatePageSchema), content.updatePage);
router.delete('/content/pages/:id', CM, content.deletePage);
router.get('/content/faq', CM, content.listFaq);
router.post('/content/faq', CM, validate(createFaqSchema), content.createFaq);
router.put('/content/faq/:id', CM, validate(updateFaqSchema), content.updateFaq);
router.delete('/content/faq/:id', CM, content.deleteFaq);
router.get('/content/announcements', CM, content.listAnnouncements);
router.post('/content/announcements', CM, validate(createAnnouncementSchema), content.createAnnouncement);
router.put('/content/announcements/:id', CM, validate(updateAnnouncementSchema), content.updateAnnouncement);
router.delete('/content/announcements/:id', CM, content.deleteAnnouncement);
router.get('/media', CM, content.listMedia);
router.post('/media', CM, siteImage.single('file'), content.uploadMedia);
router.patch('/media/:id', CM, validate(updateMediaSchema), content.updateMedia);
router.delete('/media/:id', CM, content.deleteMedia);
router.get('/settings', SM, content.listSettings);
router.put('/settings', SM, validate(upsertSettingSchema), content.upsertSetting);
router.delete('/settings/:key', SM, content.deleteSetting);
router.get('/countries', SM, content.listCountries);
router.post('/countries', SM, validate(createCountrySchema), content.createCountry);
router.put('/countries/:code', SM, validate(updateCountrySchema), content.updateCountry);
router.delete('/countries/:code', SM, content.deleteCountry);

export default router;

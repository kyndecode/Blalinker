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

export default router;

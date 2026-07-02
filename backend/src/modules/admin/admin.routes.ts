import { Router } from 'express';
import { adminController } from './admin.controller';
import { teamController } from './team.controller';
import { authenticate, requireAdmin, requirePermission, adminRateLimit } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { updateContactStatusSchema } from '../contact/contact.schemas';
import { createAdminSchema, updateAdminSchema, resetAdminPasswordSchema } from './team.schemas';
import { PERMISSIONS as P } from '../../config/permissions';

const router = Router();

// Toutes les routes admin : rate limit strict + auth + rôle admin
router.use(adminRateLimit, authenticate, requireAdmin);

// ─── Lecture (tout admin) ─────────────────────────────────────
router.get('/dashboard',        adminController.dashboard);
router.get('/users',            adminController.listUsers);
router.get('/users/:id',        adminController.getUser);
router.get('/providers',        adminController.listProviders);
router.get('/bookings',         adminController.listBookings);
router.get('/reviews',          adminController.listReviews);
router.get('/reviews/pending',  adminController.pendingReviews);
router.get('/reports',          adminController.listReports);
router.get('/contacts',         adminController.listContacts);
router.get('/transactions',     adminController.listTransactions);
router.get('/categories',       adminController.listCategories);

// ─── Actions (permissions granulaires — super_admin bypass) ───
router.put('/users/:id/status',     requirePermission(P.USERS_SUSPEND),   adminController.updateUserStatus);
router.post('/users/:id/verify-id', requirePermission(P.PROVIDERS_VERIFY), adminController.verifyIdentity);

router.put('/reviews/:id/approve',  requirePermission(P.REVIEWS_MODERATE), adminController.approveReview);
router.delete('/reviews/:id',       requirePermission(P.REVIEWS_MODERATE), adminController.deleteReview);

router.patch('/reports/:id',        requirePermission(P.REPORTS_HANDLE), adminController.resolveReport);
router.put('/reports/:id/resolve',  requirePermission(P.REPORTS_HANDLE), adminController.resolveReport);

router.patch('/contacts/:id/status', requirePermission(P.CONTACTS_HANDLE), validate(updateContactStatusSchema), adminController.updateContactStatus);

router.post('/categories',      requirePermission(P.CATEGORIES_MANAGE), adminController.createCategory);
router.put('/categories/:id',   requirePermission(P.CATEGORIES_MANAGE), adminController.updateCategory);

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

export default router;

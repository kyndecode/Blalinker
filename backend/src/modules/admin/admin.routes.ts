import { Router } from 'express';
import { adminController } from './admin.controller';
import { authenticate, requireAdmin, adminRateLimit } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { updateContactStatusSchema } from '../contact/contact.schemas';

const router = Router();

// Toutes les routes admin : rate limit strict + auth + rôle admin
router.use(adminRateLimit, authenticate, requireAdmin);

router.get('/dashboard',        adminController.dashboard);
router.get('/users',            adminController.listUsers);
router.get('/users/:id',        adminController.getUser);
router.put('/users/:id/status', adminController.updateUserStatus);
router.post('/users/:id/verify-id', adminController.verifyIdentity);
router.get('/providers',        adminController.listProviders);
router.get('/bookings',         adminController.listBookings);

router.get('/reviews',          adminController.listReviews);
router.get('/reviews/pending',  adminController.pendingReviews);
router.put('/reviews/:id/approve', adminController.approveReview);
router.delete('/reviews/:id',   adminController.deleteReview);

router.get('/reports',          adminController.listReports);
router.patch('/reports/:id',    adminController.resolveReport);
router.put('/reports/:id/resolve', adminController.resolveReport);

router.get('/contacts',         adminController.listContacts);
router.patch('/contacts/:id/status', validate(updateContactStatusSchema), adminController.updateContactStatus);

router.get('/transactions',     adminController.listTransactions);

router.get('/categories',       adminController.listCategories);
router.post('/categories',      adminController.createCategory);
router.put('/categories/:id',   adminController.updateCategory);

export default router;

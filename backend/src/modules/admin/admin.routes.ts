import { Router } from 'express';
import { adminController } from './admin.controller';
import { authenticate, requireAdmin } from '../../middlewares/auth.middleware';

const router = Router();

// Toutes les routes admin requièrent authentification + rôle admin
router.use(authenticate, requireAdmin);

router.get('/dashboard',        adminController.dashboard);
router.get('/users',            adminController.listUsers);
router.get('/users/:id',        adminController.getUser);
router.put('/users/:id/status', adminController.updateUserStatus);
router.post('/users/:id/verify-id', adminController.verifyIdentity);

router.get('/reviews/pending',  adminController.pendingReviews);
router.put('/reviews/:id/approve', adminController.approveReview);
router.delete('/reviews/:id',   adminController.deleteReview);

router.get('/reports',          adminController.listReports);
router.put('/reports/:id/resolve', adminController.resolveReport);

router.get('/transactions',     adminController.listTransactions);

router.get('/categories',       adminController.listCategories);
router.post('/categories',      adminController.createCategory);
router.put('/categories/:id',   adminController.updateCategory);

export default router;

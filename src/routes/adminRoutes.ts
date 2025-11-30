import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { isAdmin } from '../middleware/admin';
import { AdminController } from '../controllers/adminController';

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(isAdmin);

// Admin user endpoint
router.get('/', AdminController.index);

// Admin management endpoints
router.get('/restaurants', AdminController.getRestaurants);
router.get('/orders', AdminController.getOrders);
router.get('/withdrawals', AdminController.getWithdrawals);
router.get('/stats', AdminController.getStats);

export default router;


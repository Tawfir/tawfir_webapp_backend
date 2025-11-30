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

export default router;


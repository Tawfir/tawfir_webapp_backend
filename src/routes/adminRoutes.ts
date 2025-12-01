import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { isAdmin } from '../middleware/admin';
import { uploadSingle, uploadFields } from '../middleware/upload';
import { AdminController } from '../controllers/adminController';

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(isAdmin);

// Admin user endpoint
router.get('/', AdminController.index);

// Admin management endpoints
router.get('/restaurants', AdminController.getRestaurants);
router.post('/restaurants', uploadFields([
  { name: 'profile_pic', maxCount: 1 },
  { name: 'cover_image', maxCount: 1 },
  { name: 'place_pics', maxCount: 10 }
]), AdminController.createRestaurant);
router.get('/restaurants/:id', AdminController.getRestaurant);
router.put('/restaurants/:id', uploadFields([
  { name: 'profile_pic', maxCount: 1 },
  { name: 'cover_image', maxCount: 1 },
  { name: 'place_pics', maxCount: 10 }
]), AdminController.updateRestaurant);
router.delete('/restaurants/:id', AdminController.deleteRestaurant);
router.get('/orders', AdminController.getOrders);
router.get('/withdrawals', AdminController.getWithdrawals);
router.get('/categories', AdminController.getCategories);
router.get('/categories/:id', AdminController.getCategory);
router.post('/categories', uploadSingle('image'), AdminController.createCategory);
router.put('/categories/:id', uploadSingle('image'), AdminController.updateCategory);
router.delete('/categories/:id/image', AdminController.deleteCategoryImage);
router.delete('/categories/:id', AdminController.deleteCategory);
router.get('/stats', AdminController.getStats);
router.get('/stats/chart', AdminController.getChartData);

export default router;


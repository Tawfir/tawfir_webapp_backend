import { Router } from 'express';
import express from 'express';
import { authenticate } from '../middleware/auth';
import { restaurantApproved } from '../middleware/restaurantApproved';
import { uploadSingle, uploadFields } from '../middleware/upload';
import { RestaurantController } from '../controllers/restaurantController';
import { RestaurantDishController } from '../controllers/restaurantDishController';
import { RestaurantOrderController } from '../controllers/restaurantOrderController';
import { RestaurantWalletController } from '../controllers/restaurantWalletController';
import { RestaurantWithdrawalController } from '../controllers/restaurantWithdrawalController';
import { RestaurantTransactionController } from '../controllers/restaurantTransactionController';

const router = Router();

// All restaurant routes require authentication
router.use(authenticate);

// Restaurant management (no approval needed)
router.post('/', RestaurantController.create);
router.put('/', uploadFields([
  { name: 'profile_pic', maxCount: 1 },
  { name: 'cover_image', maxCount: 1 },
  { name: 'place_pics', maxCount: 10 }
]), RestaurantController.update);
router.delete('/profile-pic', RestaurantController.deleteProfilePic);
router.delete('/cover-image', RestaurantController.deleteCoverImage);
router.delete('/place-pics/:index', RestaurantController.deletePlacePic);

// Routes below require restaurant approval
router.use(restaurantApproved);

// Revenue management route (must come before /:id? route)
router.get('/revenue', RestaurantController.getRevenue);

// Dish routes (must come before /:id? route)
router.get('/dishes', RestaurantDishController.index);
router.get('/dishes/:id', RestaurantDishController.show);
router.post('/dishes', uploadSingle('image'), RestaurantDishController.store);
router.put('/dishes/:id', uploadSingle('image'), RestaurantDishController.update);
router.delete('/dishes/:id/image', RestaurantDishController.deleteImage);
router.delete('/dishes/:id', RestaurantDishController.destroy);

// Order routes (must come before /:id? route)
router.get('/orders', RestaurantOrderController.index);
router.get('/orders/:id', RestaurantOrderController.show);
router.put('/orders/:id/status', express.json(), RestaurantOrderController.updateStatus);
router.put('/orders/:id/payment-method', express.json(), RestaurantOrderController.updatePaymentMethod);
router.get('/stats/chart', RestaurantOrderController.getChartData);

// Transaction routes (must come before /:id? route)
router.patch('/transactions/:id/paid', RestaurantTransactionController.markPaid);

// Restaurant get route (must be last to avoid matching /dishes, /orders, etc.)
// Note: This route is protected by restaurantApproved middleware above
router.get('/:id?', RestaurantController.get);

export default router;


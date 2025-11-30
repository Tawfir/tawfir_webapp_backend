import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { restaurantApproved } from '../middleware/restaurantApproved';
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
router.put('/', RestaurantController.update);

// Routes below require restaurant approval
router.use(restaurantApproved);

// Wallet routes (must come before /:id? route)
router.get('/wallet', RestaurantWalletController.balance);
router.get('/wallet/transactions', RestaurantWalletController.transactions);
router.post('/wallet/withdrawals', RestaurantWithdrawalController.store);

// Dish routes (must come before /:id? route)
router.get('/dishes', RestaurantDishController.index);
router.post('/dishes', RestaurantDishController.store);
router.put('/dishes/:id', RestaurantDishController.update);
router.delete('/dishes/:id', RestaurantDishController.destroy);

// Order routes (must come before /:id? route)
router.get('/orders', RestaurantOrderController.index);
router.get('/orders/:id', RestaurantOrderController.show);
router.put('/orders/:id/status', RestaurantOrderController.updateStatus);

// Transaction routes (must come before /:id? route)
router.patch('/transactions/:id/paid', RestaurantTransactionController.markPaid);

// Restaurant get route (must be last to avoid matching /dishes, /orders, etc.)
router.get('/:id?', RestaurantController.get);

export default router;


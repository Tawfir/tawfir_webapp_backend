import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { restaurantApproved } from '../middleware/restaurantApproved';
// Controllers will be imported here
// import { RestaurantController } from '../controllers/restaurantController';

const router = Router();

// All restaurant routes require authentication
router.use(authenticate);

// Restaurant management (no approval needed)
// router.post('/', RestaurantController.create);
// router.get('/:id?', RestaurantController.get);
// router.put('/', RestaurantController.update);

// Routes below require restaurant approval
router.use(restaurantApproved);

// Wallet routes
// router.get('/wallet', RestaurantController.getWalletBalance);
// router.get('/wallet/transactions', RestaurantController.getWalletTransactions);
// router.post('/wallet/withdrawals', RestaurantController.requestWithdrawal);

// Dish routes
// router.get('/dishes', RestaurantController.getDishes);
// router.post('/dishes', RestaurantController.createDish);
// router.put('/dishes/:id', RestaurantController.updateDish);
// router.delete('/dishes/:id', RestaurantController.deleteDish);

// Order routes
// router.get('/orders', RestaurantController.getOrders);
// router.get('/orders/:id', RestaurantController.getOrderDetails);
// router.put('/orders/:id/status', RestaurantController.updateOrderStatus);

// Transaction routes
// router.patch('/transactions/:id/paid', RestaurantController.markTransactionPaid);

export default router;


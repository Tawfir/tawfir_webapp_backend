import { Router } from 'express';
import { authenticate } from '../middleware/auth';
// Controllers will be imported here
// import { UserController } from '../controllers/userController';

const router = Router();

// All user routes require authentication
router.use(authenticate);

// Dish details
// router.get('/dishes/:id', UserController.getDishDetails);

// Restaurant details
// router.get('/restaurants/featured', UserController.getFeaturedRestaurants);
// router.get('/restaurants/:id', UserController.getRestaurantDetails);

// Cart routes
// router.get('/cart', UserController.getCart);
// router.post('/cart/add', UserController.addToCart);
// router.post('/cart/remove', UserController.removeFromCart);
// router.post('/cart/flush', UserController.flushCart);

// Order routes
// router.get('/orders', UserController.getOrders);
// router.get('/orders/:id', UserController.getOrderDetails);
// router.post('/orders/:id/cancel', UserController.cancelOrder);

// Home routes
// router.get('/home', UserController.getHome);
// router.get('/home/search', UserController.search);

// Category routes
// router.get('/categories', UserController.getCategories);
// router.get('/categories/:id/dishes', UserController.getCategoryDishes);

// Notification routes
// router.get('/notifications', UserController.getNotifications);
// router.patch('/notifications/:id/read', UserController.markNotificationAsRead);
// router.get('/notifications/unread-count', UserController.getUnreadCount);

export default router;


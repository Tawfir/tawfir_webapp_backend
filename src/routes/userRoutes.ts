import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { UserController } from '../controllers/userController';

const router = Router();

// All user routes require authentication
router.use(authenticate);

// Dish details
router.get('/dishes/:id', UserController.getDishDetails);

// Restaurant details
router.get('/restaurants/featured', UserController.getFeaturedRestaurants);
router.get('/restaurants/:id', UserController.getRestaurantDetails);

// Cart routes
router.get('/cart', UserController.getCart);
router.post('/cart/add', UserController.addToCart);
router.post('/cart/remove', UserController.removeFromCart);
router.post('/cart/flush', UserController.flushCart);

// Order routes
router.get('/orders', UserController.getOrders);
router.get('/orders/:id', UserController.getOrderDetails);
router.post('/orders/:id/cancel', UserController.cancelOrder);

// Home routes
router.get('/home', UserController.getHome);
router.get('/home/search', UserController.search);

// Category routes
router.get('/categories', UserController.getCategories);
router.get('/categories/:id/dishes', UserController.getCategoryDishes);

// Notification routes
import { NotificationController } from '../controllers/notificationController';
router.get('/notifications', NotificationController.index);
router.patch('/notifications/:id/read', NotificationController.markAsRead);
router.get('/notifications/unread-count', NotificationController.unreadCount);

export default router;


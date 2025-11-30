import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { success, error } from '../utils/response';
import { pool } from '../config/database';
import { z } from 'zod';

const addToCartSchema = z.object({
  dish_id: z.number().int().positive(),
  quantity: z.number().int().positive().optional().default(1),
});

const removeFromCartSchema = z.object({
  dish_id: z.number().int().positive(),
  quantity: z.number().int().positive().optional(),
});

export class UserController {
  /**
   * @swagger
   * /api/user/cart:
   *   get:
   *     summary: Get cart items
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Cart items retrieved successfully
   */
  static async getCart(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const result = await pool.query(
        `SELECT c.*, d.*, r.id as restaurant_id, r.name as restaurant_name, r.profile_pic as restaurant_profile_pic
         FROM carts c
         JOIN dishes d ON c.dish_id = d.id
         JOIN restaurants r ON d.restaurant_id = r.id
         WHERE c.user_id = $1
         ORDER BY c.created_at DESC`,
        [req.user.id]
      );

      success(res, { items: result.rows }, 'Cart items retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve cart', 500);
    }
  }

  /**
   * @swagger
   * /api/user/cart/add:
   *   post:
   *     summary: Add item to cart
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - dish_id
   *             properties:
   *               dish_id:
   *                 type: integer
   *               quantity:
   *                 type: integer
   *                 default: 1
   *     responses:
   *       200:
   *         description: Item added to cart successfully
   *       400:
   *         description: Validation error or insufficient stock
   */
  static async addToCart(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const validated = addToCartSchema.parse(req.body);
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // Get dish details
        const dishResult = await client.query(
          'SELECT id, restaurant_id, quantity, name, selling_price FROM dishes WHERE id = $1',
          [validated.dish_id]
        );

        if (dishResult.rows.length === 0) {
          await client.query('ROLLBACK');
          error(res, 'Dish not found', 404);
          return;
        }

        const dish = dishResult.rows[0];

        // Check if cart has items from different restaurant
        const firstItemResult = await client.query(
          `SELECT d.restaurant_id FROM carts c
           JOIN dishes d ON c.dish_id = d.id
           WHERE c.user_id = $1
           LIMIT 1`,
          [req.user.id]
        );

        if (firstItemResult.rows.length > 0 && firstItemResult.rows[0].restaurant_id !== dish.restaurant_id) {
          // Clear cart if mixing restaurants
          await client.query('DELETE FROM carts WHERE user_id = $1', [req.user.id]);
        }

        // Check if item already in cart
        const cartItemResult = await client.query(
          'SELECT * FROM carts WHERE user_id = $1 AND dish_id = $2',
          [req.user.id, validated.dish_id]
        );

        const qtyToAdd = validated.quantity || 1;
        let newQuantity: number;

        if (cartItemResult.rows.length > 0) {
          newQuantity = parseInt(cartItemResult.rows[0].quantity) + qtyToAdd;
        } else {
          newQuantity = qtyToAdd;
        }

        // Check stock availability
        if (newQuantity > dish.quantity) {
          await client.query('ROLLBACK');
          error(res, 'Requested quantity exceeds available stock', 400);
          return;
        }

        // Upsert cart item
        await client.query(
          `INSERT INTO carts (user_id, dish_id, quantity, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())
           ON CONFLICT (user_id, dish_id) DO UPDATE
           SET quantity = $3, updated_at = NOW()`,
          [req.user.id, validated.dish_id, newQuantity]
        );

        await client.query('COMMIT');

        // Return updated cart
        const updatedCartResult = await pool.query(
          `SELECT c.*, d.*, r.id as restaurant_id, r.name as restaurant_name
           FROM carts c
           JOIN dishes d ON c.dish_id = d.id
           JOIN restaurants r ON d.restaurant_id = r.id
           WHERE c.user_id = $1
           ORDER BY c.created_at DESC`,
          [req.user.id]
        );

        success(res, updatedCartResult.rows, 'Item added to cart successfully');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        error(res, 'Validation error', 400, err.errors);
        return;
      }
      error(res, err.message || 'Failed to add item to cart', 500);
    }
  }

  /**
   * @swagger
   * /api/user/cart/remove:
   *   post:
   *     summary: Remove item from cart
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - dish_id
   *             properties:
   *               dish_id:
   *                 type: integer
   *               quantity:
   *                 type: integer
   *     responses:
   *       200:
   *         description: Item removed from cart successfully
   *       404:
   *         description: Item not found in cart
   */
  static async removeFromCart(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const validated = removeFromCartSchema.parse(req.body);

      const cartItemResult = await pool.query(
        'SELECT * FROM carts WHERE user_id = $1 AND dish_id = $2',
        [req.user.id, validated.dish_id]
      );

      if (cartItemResult.rows.length === 0) {
        error(res, 'Item not found in cart', 404);
        return;
      }

      const cartItem = cartItemResult.rows[0];
      const currentQty = parseInt(cartItem.quantity);
      const qtyToRemove = validated.quantity || currentQty;

      if (qtyToRemove >= currentQty) {
        // Remove entire item
        await pool.query('DELETE FROM carts WHERE user_id = $1 AND dish_id = $2', [
          req.user.id,
          validated.dish_id,
        ]);
      } else {
        // Decrement quantity
        await pool.query(
          'UPDATE carts SET quantity = quantity - $1, updated_at = NOW() WHERE user_id = $2 AND dish_id = $3',
          [qtyToRemove, req.user.id, validated.dish_id]
        );
      }

      // Return updated cart
      const updatedCartResult = await pool.query(
        `SELECT c.*, d.*, r.id as restaurant_id, r.name as restaurant_name
         FROM carts c
         JOIN dishes d ON c.dish_id = d.id
         JOIN restaurants r ON d.restaurant_id = r.id
         WHERE c.user_id = $1
         ORDER BY c.created_at DESC`,
        [req.user.id]
      );

      success(res, updatedCartResult.rows, 'Item removed from cart successfully');
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        error(res, 'Validation error', 400, err.errors);
        return;
      }
      error(res, err.message || 'Failed to remove item from cart', 500);
    }
  }

  /**
   * @swagger
   * /api/user/cart/flush:
   *   post:
   *     summary: Clear cart
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Cart emptied successfully
   */
  static async flushCart(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      await pool.query('DELETE FROM carts WHERE user_id = $1', [req.user.id]);
      success(res, [], 'Cart emptied successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to empty cart', 500);
    }
  }

  /**
   * @swagger
   * /api/user/orders:
   *   get:
   *     summary: Get user orders
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Orders retrieved successfully
   */
  static async getOrders(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const ordersResult = await pool.query(
        `SELECT o.*, r.name as restaurant_name, r.profile_pic as restaurant_profile_pic
         FROM orders o
         JOIN restaurants r ON o.restaurant_id = r.id
         WHERE o.user_id = $1
         ORDER BY o.created_at DESC`,
        [req.user.id]
      );

      // Get order items for each order
      const orders = await Promise.all(
        ordersResult.rows.map(async (order) => {
          const itemsResult = await pool.query(
            `SELECT oi.*, d.name as dish_name, d.image as dish_image
             FROM order_items oi
             JOIN dishes d ON oi.dish_id = d.id
             WHERE oi.order_id = $1`,
            [order.id]
          );
          return { ...order, items: itemsResult.rows };
        })
      );

      success(res, { orders }, 'Orders retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve orders', 500);
    }
  }

  /**
   * @swagger
   * /api/user/orders/{id}:
   *   get:
   *     summary: Get order details
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Order retrieved successfully
   *       404:
   *         description: Order not found
   */
  static async getOrderDetails(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const orderId = parseInt(req.params.id);

      const orderResult = await pool.query(
        `SELECT o.*, r.name as restaurant_name, r.profile_pic as restaurant_profile_pic, r.address as restaurant_address
         FROM orders o
         JOIN restaurants r ON o.restaurant_id = r.id
         WHERE o.id = $1 AND o.user_id = $2`,
        [orderId, req.user.id]
      );

      if (orderResult.rows.length === 0) {
        error(res, 'Order not found', 404);
        return;
      }

      const order = orderResult.rows[0];

      const itemsResult = await pool.query(
        `SELECT oi.*, d.name as dish_name, d.image as dish_image, d.description as dish_description
         FROM order_items oi
         JOIN dishes d ON oi.dish_id = d.id
         WHERE oi.order_id = $1`,
        [orderId]
      );

      success(res, { order: { ...order, items: itemsResult.rows } }, 'Order retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve order', 500);
    }
  }

  /**
   * @swagger
   * /api/user/orders/{id}/cancel:
   *   post:
   *     summary: Cancel order
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Order cancelled successfully
   *       400:
   *         description: Order cannot be cancelled
   *       404:
   *         description: Order not found
   */
  static async cancelOrder(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const orderId = parseInt(req.params.id);

      const orderResult = await pool.query(
        'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
        [orderId, req.user.id]
      );

      if (orderResult.rows.length === 0) {
        error(res, 'Order not found', 404);
        return;
      }

      const order = orderResult.rows[0];

      // Check if order can be cancelled (only incoming or ready status)
      if (!['incoming', 'ready'].includes(order.status)) {
        error(res, 'Order cannot be cancelled at this stage', 400);
        return;
      }

      // Update order status to cancelled
      await pool.query(
        "UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
        [orderId]
      );

      // TODO: Handle refunds if payment was made
      // TODO: Restore dish quantities

      success(res, null, 'Order cancelled successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to cancel order', 500);
    }
  }

  /**
   * @swagger
   * /api/user/dishes/{id}:
   *   get:
   *     summary: Get dish details
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Dish details retrieved successfully
   *       404:
   *         description: Dish not found
   */
  static async getDishDetails(req: AuthRequest, res: Response): Promise<void> {
    try {
      const dishId = parseInt(req.params.id);

      const dishResult = await pool.query(
        `SELECT d.*, r.id as restaurant_id, r.name as restaurant_name, r.profile_pic as restaurant_profile_pic,
                r.address as restaurant_address, r.lat as restaurant_lat, r.lng as restaurant_lng
         FROM dishes d
         JOIN restaurants r ON d.restaurant_id = r.id
         WHERE d.id = $1`,
        [dishId]
      );

      if (dishResult.rows.length === 0) {
        error(res, 'Dish not found', 404);
        return;
      }

      const dish = dishResult.rows[0];

      // Get categories for this dish
      const categoriesResult = await pool.query(
        `SELECT fc.id, fc.name, fc.image
         FROM food_categories fc
         JOIN food_category_dish fcd ON fc.id = fcd.food_category_id
         WHERE fcd.dish_id = $1`,
        [dishId]
      );

      success(res, { ...dish, categories: categoriesResult.rows }, 'Dish details retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve dish details', 500);
    }
  }

  /**
   * @swagger
   * /api/user/restaurants/featured:
   *   get:
   *     summary: Get featured restaurants
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Featured restaurants retrieved successfully
   */
  static async getFeaturedRestaurants(req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await pool.query(
        `SELECT r.*, COUNT(DISTINCT o.id) as order_count
         FROM restaurants r
         LEFT JOIN orders o ON r.id = o.restaurant_id
         WHERE r.status = 'approved'
         GROUP BY r.id
         ORDER BY order_count DESC, r.created_at DESC
         LIMIT 10`
      );

      // Get categories for each restaurant
      const restaurants = await Promise.all(
        result.rows.map(async (restaurant) => {
          const categoriesResult = await pool.query(
            `SELECT fc.id, fc.name, fc.image
             FROM food_categories fc
             JOIN food_category_restaurant fcr ON fc.id = fcr.food_category_id
             WHERE fcr.restaurant_id = $1`,
            [restaurant.id]
          );
          return { ...restaurant, categories: categoriesResult.rows };
        })
      );

      success(res, { restaurants }, 'Featured restaurants retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve featured restaurants', 500);
    }
  }

  /**
   * @swagger
   * /api/user/restaurants/{id}:
   *   get:
   *     summary: Get restaurant details
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Restaurant details retrieved successfully
   *       404:
   *         description: Restaurant not found
   */
  static async getRestaurantDetails(req: AuthRequest, res: Response): Promise<void> {
    try {
      const restaurantId = parseInt(req.params.id);

      const restaurantResult = await pool.query(
        'SELECT * FROM restaurants WHERE id = $1 AND status = $2',
        [restaurantId, 'approved']
      );

      if (restaurantResult.rows.length === 0) {
        error(res, 'Restaurant not found', 404);
        return;
      }

      const restaurant = restaurantResult.rows[0];

      // Get categories
      const categoriesResult = await pool.query(
        `SELECT fc.id, fc.name, fc.image
         FROM food_categories fc
         JOIN food_category_restaurant fcr ON fc.id = fcr.food_category_id
         WHERE fcr.restaurant_id = $1`,
        [restaurantId]
      );

      // Get dishes
      const dishesResult = await pool.query(
        `SELECT d.*, 
                (SELECT array_agg(fc.name) FROM food_categories fc
                 JOIN food_category_dish fcd ON fc.id = fcd.food_category_id
                 WHERE fcd.dish_id = d.id) as category_names
         FROM dishes d
         WHERE d.restaurant_id = $1 AND d.quantity > 0
         ORDER BY d.created_at DESC`,
        [restaurantId]
      );

      success(
        res,
        {
          ...restaurant,
          categories: categoriesResult.rows,
          dishes: dishesResult.rows,
        },
        'Restaurant details retrieved successfully'
      );
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve restaurant details', 500);
    }
  }

  /**
   * @swagger
   * /api/user/home:
   *   get:
   *     summary: Get home page data
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: lat
   *         schema:
   *           type: number
   *       - in: query
   *         name: lng
   *         schema:
   *           type: number
   *     responses:
   *       200:
   *         description: Home data retrieved successfully
   */
  static async getHome(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      // 1. Top 5 dishes by order count
      const topDishesResult = await pool.query(
        `SELECT d.*, r.name as restaurant_name, r.profile_pic as restaurant_profile_pic,
                COUNT(DISTINCT oi.order_id) as order_count
         FROM dishes d
         JOIN restaurants r ON d.restaurant_id = r.id
         LEFT JOIN order_items oi ON d.id = oi.dish_id
         GROUP BY d.id, r.id
         ORDER BY order_count DESC, d.created_at DESC
         LIMIT 5`
      );

      // 2. Get 3 random dishes from user's order history
      const userOrderHistoryResult = await pool.query(
        `SELECT DISTINCT d.*, r.name as restaurant_name, r.profile_pic as restaurant_profile_pic
         FROM dishes d
         JOIN restaurants r ON d.restaurant_id = r.id
         JOIN order_items oi ON d.id = oi.dish_id
         JOIN orders o ON oi.order_id = o.id
         WHERE o.user_id = $1
         ORDER BY RANDOM()
         LIMIT 3`,
        [req.user.id]
      );

      const userOrderHistoryDishes = userOrderHistoryResult.rows.map((dish) => ({
        ...dish,
        is_from_order_history: true,
      }));

      // 3. Merge top dishes with order history dishes
      const combinedTopDishes = [...topDishesResult.rows, ...userOrderHistoryDishes];

      // 4. All categories
      const categoriesResult = await pool.query('SELECT id, name, image FROM food_categories ORDER BY name');

      // 5. Random 6 dishes
      const randomDishesResult = await pool.query(
        `SELECT d.*, r.name as restaurant_name, r.profile_pic as restaurant_profile_pic
         FROM dishes d
         JOIN restaurants r ON d.restaurant_id = r.id
         WHERE d.quantity > 0
         ORDER BY RANDOM()
         LIMIT 6`
      );

      // 6. Nearby restaurants if lat/lng provided
      let nearbyRestaurants: any[] = [];
      if (req.query.lat && req.query.lng) {
        const lat = parseFloat(req.query.lat as string);
        const lng = parseFloat(req.query.lng as string);

        const nearbyResult = await pool.query(
          `SELECT r.*, 
                  (6371 * acos(
                    cos(radians($1)) *
                    cos(radians(r.lat)) *
                    cos(radians(r.lng) - radians($2)) +
                    sin(radians($1)) *
                    sin(radians(r.lat))
                  )) AS distance
           FROM restaurants r
           WHERE r.status = 'approved'
           HAVING distance <= 20
           ORDER BY distance
           LIMIT 10`,
          [lat, lng]
        );

        // Get categories for nearby restaurants
        nearbyRestaurants = await Promise.all(
          nearbyResult.rows.map(async (restaurant) => {
            const catResult = await pool.query(
              `SELECT fc.id, fc.name, fc.image
               FROM food_categories fc
               JOIN food_category_restaurant fcr ON fc.id = fcr.food_category_id
               WHERE fcr.restaurant_id = $1`,
              [restaurant.id]
            );
            return { ...restaurant, categories: catResult.rows };
          })
        );
      }

      // 7. Unread notifications count
      const unreadCountResult = await pool.query(
        "SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read_at IS NULL",
        [req.user.id]
      );
      const unreadCount = parseInt(unreadCountResult.rows[0]?.count || '0');

      success(
        res,
        {
          top_dishes: combinedTopDishes,
          categories: categoriesResult.rows,
          random_dishes: randomDishesResult.rows,
          nearby_restaurants: nearbyRestaurants,
          unread_notifications: unreadCount,
        },
        'Home data retrieved successfully'
      );
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve home data', 500);
    }
  }

  /**
   * @swagger
   * /api/user/home/search:
   *   get:
   *     summary: Search dishes and restaurants
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *       - in: query
   *         name: lat
   *         schema:
   *           type: number
   *       - in: query
   *         name: lng
   *         schema:
   *           type: number
   *       - in: query
   *         name: paginated
   *         schema:
   *           type: boolean
   *     responses:
   *       200:
   *         description: Search results retrieved successfully
   */
  static async search(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const searchTerm = (req.query.search as string) || '';
      const lat = req.query.lat ? parseFloat(req.query.lat as string) : null;
      const lng = req.query.lng ? parseFloat(req.query.lng as string) : null;
      const paginated = req.query.paginated === 'true';

      // Use user's location if not provided
      const userResult = await pool.query('SELECT lat, lng FROM users WHERE id = $1', [req.user.id]);
      const finalLat = lat || userResult.rows[0]?.lat;
      const finalLng = lng || userResult.rows[0]?.lng;

      if (!finalLat || !finalLng) {
        error(res, 'Latitude and longitude are required', 422);
        return;
      }

      // Search restaurants
      let restaurantQuery = `
        SELECT r.*, 
               (6371 * acos(
                 cos(radians($1)) *
                 cos(radians(r.lat)) *
                 cos(radians(r.lng) - radians($2)) +
                 sin(radians($1)) *
                 sin(radians(r.lat))
               )) AS distance
        FROM restaurants r
        WHERE r.status = 'approved'
      `;

      if (searchTerm) {
        restaurantQuery += ` AND (
          r.name ILIKE $3 OR
          EXISTS (
            SELECT 1 FROM dishes d
            WHERE d.restaurant_id = r.id AND d.name ILIKE $3
          )
        )`;
      }

      restaurantQuery += ' ORDER BY distance';

      const restaurantParams: any[] = [finalLat, finalLng];
      if (searchTerm) {
        restaurantParams.push(`%${searchTerm}%`);
      }

      const restaurantsResult = await pool.query(restaurantQuery, restaurantParams);

      // Search dishes
      let dishQuery = `
        SELECT d.*, r.name as restaurant_name, r.profile_pic as restaurant_profile_pic,
               (6371 * acos(
                 cos(radians($1)) *
                 cos(radians(r.lat)) *
                 cos(radians(r.lng) - radians($2)) +
                 sin(radians($1)) *
                 sin(radians(r.lat))
               )) AS distance
        FROM dishes d
        JOIN restaurants r ON d.restaurant_id = r.id
        WHERE r.status = 'approved' AND d.quantity > 0
      `;

      if (searchTerm) {
        dishQuery += ' AND d.name ILIKE $3';
      }

      dishQuery += ' ORDER BY distance';

      const dishesResult = await pool.query(dishQuery, restaurantParams);

      success(
        res,
        {
          restaurants: restaurantsResult.rows,
          dishes: dishesResult.rows,
        },
        'Search results'
      );
    } catch (err: any) {
      error(res, err.message || 'Search failed', 500);
    }
  }

  /**
   * @swagger
   * /api/user/categories:
   *   get:
   *     summary: Get all categories
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Categories retrieved successfully
   */
  static async getCategories(req: AuthRequest, res: Response): Promise<void> {
    try {
      const searchTerm = (req.query.search as string) || '';

      let query = 'SELECT id, name, image FROM food_categories';
      const params: any[] = [];

      if (searchTerm) {
        query += ' WHERE name ILIKE $1';
        params.push(`%${searchTerm}%`);
      }

      query += ' ORDER BY name';

      const result = await pool.query(query, params);
      success(res, result.rows, 'Categories retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve categories', 500);
    }
  }

  /**
   * @swagger
   * /api/user/categories/{id}/dishes:
   *   get:
   *     summary: Get dishes and restaurants by category
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: lat
   *         schema:
   *           type: number
   *           format: float
   *       - in: query
   *         name: lng
   *         schema:
   *           type: number
   *           format: float
   *       - in: query
   *         name: paginated
   *         schema:
   *           type: boolean
   *       - in: query
   *         name: per_page
   *         schema:
   *           type: integer
   *           default: 10
   *     responses:
   *       200:
   *         description: Category dishes and restaurants retrieved successfully
   *       404:
   *         description: Category not found
   *       422:
   *         description: Latitude and longitude are required
   */
  static async getCategoryDishes(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const categoryId = parseInt(req.params.id);
      const lat = req.query.lat ? parseFloat(req.query.lat as string) : null;
      const lng = req.query.lng ? parseFloat(req.query.lng as string) : null;
      const paginated = req.query.paginated === 'true';
      const perPage = req.query.per_page ? parseInt(req.query.per_page as string) : 10;

      // Check if category exists
      const categoryResult = await pool.query(
        'SELECT id, name FROM food_categories WHERE id = $1',
        [categoryId]
      );

      if (categoryResult.rows.length === 0) {
        error(res, 'Category not found', 404);
        return;
      }

      // Get user's location or use provided coordinates
      let userLat = lat;
      let userLng = lng;

      if (!userLat || !userLng) {
        const userResult = await pool.query(
          'SELECT lat, lng FROM users WHERE id = $1',
          [req.user.id]
        );

        if (userResult.rows.length > 0 && userResult.rows[0].lat && userResult.rows[0].lng) {
          userLat = parseFloat(userResult.rows[0].lat);
          userLng = parseFloat(userResult.rows[0].lng);
        }
      }

      if (!userLat || !userLng) {
        error(res, 'Latitude and longitude are required', 422);
        return;
      }

      // Haversine formula for distance calculation
      const distanceFormula = `(6371 * acos(
        cos(radians($1)) *
        cos(radians(r.lat)) *
        cos(radians(r.lng) - radians($2)) +
        sin(radians($1)) *
        sin(radians(r.lat))
      ))`;

      // Get restaurants in this category
      let restaurantQuery = `
        SELECT DISTINCT r.*, ${distanceFormula} AS distance
        FROM restaurants r
        JOIN dishes d ON r.id = d.restaurant_id
        JOIN food_category_dish fcd ON d.id = fcd.dish_id
        WHERE fcd.food_category_id = $3
          AND r.status = 'approved'
        ORDER BY distance
      `;

      const restaurantParams = [userLat, userLng, categoryId];

      if (paginated) {
        restaurantQuery += ` LIMIT $4 OFFSET $5`;
        const page = parseInt(req.query.page as string) || 1;
        const offset = (page - 1) * perPage;
        restaurantParams.push(perPage, offset);
      }

      const restaurantsResult = await pool.query(restaurantQuery, restaurantParams);

      // Get dishes in this category
      let dishQuery = `
        SELECT d.*, r.name as restaurant_name, r.profile_pic as restaurant_profile_pic,
               r.lat as restaurant_lat, r.lng as restaurant_lng,
               ${distanceFormula} AS distance
        FROM dishes d
        JOIN restaurants r ON d.restaurant_id = r.id
        JOIN food_category_dish fcd ON d.id = fcd.dish_id
        WHERE fcd.food_category_id = $3
          AND r.status = 'approved'
          AND d.quantity > 0
        ORDER BY distance
      `;

      const dishParams = [userLat, userLng, categoryId];

      if (paginated) {
        dishQuery += ` LIMIT $4 OFFSET $5`;
        const page = parseInt(req.query.page as string) || 1;
        const offset = (page - 1) * perPage;
        dishParams.push(perPage, offset);
      }

      const dishesResult = await pool.query(dishQuery, dishParams);

      // Get categories for each dish
      for (const dish of dishesResult.rows) {
        const categoriesResult = await pool.query(
          `SELECT fc.id, fc.name, fc.image
           FROM food_categories fc
           JOIN food_category_dish fcd ON fc.id = fcd.food_category_id
           WHERE fcd.dish_id = $1`,
          [dish.id]
        );
        dish.categories = categoriesResult.rows;
      }

      success(
        res,
        {
          restaurants: restaurantsResult.rows,
          dishes: dishesResult.rows,
        },
        'Nearby results for category'
      );
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve category dishes', 500);
    }
  }
}
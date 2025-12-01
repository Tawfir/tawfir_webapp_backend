import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { success, error } from '../utils/response';
import { pool } from '../config/database';
import { z } from 'zod';

const updateOrderStatusSchema = z.object({
  status: z.enum(['incoming', 'ready', 'completed', 'cancelled']),
});

export class RestaurantOrderController {
  /**
   * @swagger
   * /api/restaurant/orders:
   *   get:
   *     summary: List all orders for the restaurant
   *     tags: [Restaurants]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Orders retrieved successfully
   */
  static async index(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !(req as any).restaurant) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const restaurant = (req as any).restaurant;

      const ordersResult = await pool.query(
        `SELECT o.*, 
         json_build_object('id', u.id, 'name', u.name, 'email', u.email, 'phone', u.phone) as user
         FROM orders o
         JOIN users u ON o.user_id = u.id
         WHERE o.restaurant_id = $1
         ORDER BY 
           CASE o.status
             WHEN 'incoming' THEN 1
             WHEN 'ready' THEN 2
             WHEN 'completed' THEN 3
             WHEN 'cancelled' THEN 4
           END,
           o.created_at DESC`,
        [restaurant.id]
      );

      // Get order items for each order
      for (const order of ordersResult.rows) {
        const itemsResult = await pool.query(
          `SELECT oi.id, oi.order_id, oi.dish_id, oi.quantity, oi.price_at_order_time as price, oi.created_at, oi.updated_at,
           json_build_object('id', d.id, 'name', d.name, 'image', d.image, 'price', d.price, 'co2_saved', d.co2_saved) as dish
           FROM order_items oi
           JOIN dishes d ON oi.dish_id = d.id
           WHERE oi.order_id = $1`,
          [order.id]
        );
        order.items = itemsResult.rows;
      }

      success(res, { orders: ordersResult.rows }, 'Orders retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve orders', 500);
    }
  }

  /**
   * @swagger
   * /api/restaurant/orders/{id}:
   *   get:
   *     summary: Get order details
   *     tags: [Restaurants]
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
  static async show(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !(req as any).restaurant) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const orderId = parseInt(req.params.id);
      const restaurant = (req as any).restaurant;

      const orderResult = await pool.query(
        `SELECT o.*,
         json_build_object('id', u.id, 'name', u.name, 'email', u.email, 'phone', u.phone) as user
         FROM orders o
         JOIN users u ON o.user_id = u.id
         WHERE o.id = $1 AND o.restaurant_id = $2`,
        [orderId, restaurant.id]
      );

      if (orderResult.rows.length === 0) {
        error(res, 'Order not found', 404);
        return;
      }

      const order = orderResult.rows[0];

      // Get order items
      const itemsResult = await pool.query(
        `SELECT oi.id, oi.order_id, oi.dish_id, oi.quantity, oi.price_at_order_time as price, oi.created_at, oi.updated_at,
         json_build_object('id', d.id, 'name', d.name, 'image', d.image, 'price', d.price) as dish
         FROM order_items oi
         JOIN dishes d ON oi.dish_id = d.id
         WHERE oi.order_id = $1`,
        [order.id]
      );

      order.items = itemsResult.rows;

      success(res, { order }, 'Order retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve order', 500);
    }
  }

  /**
   * @swagger
   * /api/restaurant/orders/{id}/status:
   *   put:
   *     summary: Update order status
   *     tags: [Restaurants]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - status
   *             properties:
   *               status:
   *                 type: string
   *                 enum: [incoming, ready, completed, cancelled]
   *     responses:
   *       200:
   *         description: Order status updated successfully
   *       404:
   *         description: Order not found
   */
  static async updateStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !(req as any).restaurant) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const orderId = parseInt(req.params.id);
      const validated = updateOrderStatusSchema.parse(req.body);
      const restaurant = (req as any).restaurant;

      // Check if order belongs to restaurant
      const orderResult = await pool.query(
        'SELECT * FROM orders WHERE id = $1 AND restaurant_id = $2',
        [orderId, restaurant.id]
      );

      if (orderResult.rows.length === 0) {
        error(res, 'Order not found', 404);
        return;
      }

      // Update order status
      await pool.query(
        'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2',
        [validated.status, orderId]
      );

      // Get updated order with items
      const updatedOrderResult = await pool.query(
        `SELECT o.*,
         json_build_object('id', u.id, 'name', u.name, 'email', u.email) as user
         FROM orders o
         JOIN users u ON o.user_id = u.id
         WHERE o.id = $1`,
        [orderId]
      );

      const order = updatedOrderResult.rows[0];

      // Get order items
      const itemsResult = await pool.query(
        `SELECT oi.id, oi.order_id, oi.dish_id, oi.quantity, oi.price_at_order_time as price, oi.created_at, oi.updated_at,
         json_build_object('id', d.id, 'name', d.name, 'image', d.image, 'price', d.price) as dish
         FROM order_items oi
         JOIN dishes d ON oi.dish_id = d.id
         WHERE oi.order_id = $1`,
        [order.id]
      );

      order.items = itemsResult.rows;

      // TODO: Send notification to user about status change

      success(res, { order }, 'Order status updated successfully');
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        error(res, 'Validation error', 400, err.errors);
        return;
      }
      error(res, err.message || 'Order status update failed', 500);
    }
  }

  /**
   * @swagger
   * /api/restaurant/stats/chart:
   *   get:
   *     summary: Get restaurant dashboard chart data (CO2 and orders over time)
   *     tags: [Restaurants]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [co2, orders]
   *         description: Type of chart data to retrieve
   *     responses:
   *       200:
   *         description: Chart data retrieved successfully
   */
  static async getChartData(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !(req as any).restaurant) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const restaurant = (req as any).restaurant;
      const { type } = req.query;
      const chartType = type === 'orders' ? 'orders' : 'co2';
      const days = 30;

      // Generate date range for last 30 days
      const data = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);

        const month = date.toLocaleDateString("en-US", { month: "short" });
        const day = date.getDate();
        const dateLabel = `${month} ${day}`;

        if (chartType === 'co2') {
          // Get CO2 saved for this day from completed orders for this restaurant
          const co2Result = await pool.query(
            `SELECT COALESCE(SUM((d.co2_saved * oi.quantity)), 0) as total
             FROM order_items oi
             JOIN orders o ON oi.order_id = o.id
             JOIN dishes d ON oi.dish_id = d.id
             WHERE o.restaurant_id = $1
               AND o.status = 'completed' 
               AND o.created_at >= $2 
               AND o.created_at < $3
               AND d.co2_saved IS NOT NULL`,
            [restaurant.id, date, nextDate]
          );
          const value = parseFloat(co2Result.rows[0].total) || 0;
          data.push({ date: dateLabel, value: parseFloat(value.toFixed(2)) });
        } else {
          // Get number of completed orders for this day for this restaurant
          const ordersResult = await pool.query(
            `SELECT COUNT(*) as count
             FROM orders
             WHERE restaurant_id = $1
               AND status = 'completed'
               AND created_at >= $2
               AND created_at < $3`,
            [restaurant.id, date, nextDate]
          );
          const value = parseInt(ordersResult.rows[0].count) || 0;
          data.push({ date: dateLabel, value });
        }
      }

      success(res, { data }, 'Chart data retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve chart data', 500);
    }
  }
}


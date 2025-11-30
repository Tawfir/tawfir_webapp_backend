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
          `SELECT oi.*, 
           json_build_object('id', d.id, 'name', d.name, 'image', d.image, 'price', d.price) as dish
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
        `SELECT oi.*,
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
        `SELECT oi.*,
         json_build_object('id', d.id, 'name', d.name, 'image', d.image) as dish
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
}


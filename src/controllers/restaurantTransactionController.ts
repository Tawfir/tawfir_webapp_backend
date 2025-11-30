import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { success, error } from '../utils/response';
import { pool } from '../config/database';

export class RestaurantTransactionController {
  /**
   * @swagger
   * /api/restaurant/transactions/{id}/paid:
   *   patch:
   *     summary: Mark a cash transaction as paid
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
   *         description: Transaction marked as paid
   *       404:
   *         description: Transaction not found
   */
  static async markPaid(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !(req as any).restaurant) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const transactionId = parseInt(req.params.id);
      const restaurant = (req as any).restaurant;

      // Check if transaction exists, is cash, is pending, and belongs to restaurant's order
      const transactionResult = await pool.query(
        `SELECT t.*, o.restaurant_id
         FROM transactions t
         JOIN orders o ON t.order_id = o.id
         WHERE t.id = $1 
           AND t.method = 'cash'
           AND t.status = 'pending'
           AND o.restaurant_id = $2`,
        [transactionId, restaurant.id]
      );

      if (transactionResult.rows.length === 0) {
        error(res, 'Transaction not found or cannot be marked as paid', 404);
        return;
      }

      // Update transaction status
      await pool.query(
        'UPDATE transactions SET status = $1, updated_at = NOW() WHERE id = $2',
        ['success', transactionId]
      );

      // Optionally update order status to completed
      const orderId = transactionResult.rows[0].order_id;
      await pool.query(
        'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2',
        ['completed', orderId]
      );

      // Get updated transaction
      const updatedResult = await pool.query(
        'SELECT * FROM transactions WHERE id = $1',
        [transactionId]
      );

      success(res, updatedResult.rows[0], 'Transaction marked as paid');
    } catch (err: any) {
      error(res, err.message || 'Failed to mark transaction as paid', 500);
    }
  }
}


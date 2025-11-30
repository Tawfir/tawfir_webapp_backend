import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { success, error } from '../utils/response';
import { pool } from '../config/database';

export class RestaurantWithdrawalController {
  /**
   * @swagger
   * /api/restaurant/wallet/withdrawals:
   *   post:
   *     summary: Request withdrawal of full wallet balance
   *     tags: [Restaurants]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       201:
   *         description: Withdrawal request submitted successfully
   *       422:
   *         description: No funds available to withdraw
   */
  static async store(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !(req as any).restaurant) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const restaurant = (req as any).restaurant;

      // Calculate current balance
      const balanceResult = await pool.query(
        `SELECT 
           COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) -
           COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) as balance
         FROM wallet_transactions
         WHERE walletable_type = 'App\\Models\\Restaurant' AND walletable_id = $1`,
        [restaurant.id]
      );

      const balance = parseFloat(balanceResult.rows[0].balance) || 0;

      if (balance <= 0) {
        error(res, 'No funds available to withdraw', 422);
        return;
      }

      // Get restaurant payout method
      const restaurantResult = await pool.query(
        'SELECT payout_method FROM restaurants WHERE id = $1',
        [restaurant.id]
      );

      const payoutMethod = restaurantResult.rows[0]?.payout_method || 'bank_transfer';

      // Create withdrawal request
      const result = await pool.query(
        `INSERT INTO withdrawal_requests (restaurant_id, amount, method, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING *`,
        [restaurant.id, balance, payoutMethod, 'pending']
      );

      success(res, result.rows[0], 'Full balance withdrawal request submitted.', 201);
    } catch (err: any) {
      error(res, err.message || 'Withdrawal request failed', 500);
    }
  }
}


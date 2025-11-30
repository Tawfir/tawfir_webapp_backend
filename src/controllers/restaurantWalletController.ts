import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { success, error } from '../utils/response';
import { pool } from '../config/database';

export class RestaurantWalletController {
  /**
   * @swagger
   * /api/restaurant/wallet:
   *   get:
   *     summary: Get restaurant wallet balance
   *     tags: [Restaurants]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Wallet balance retrieved successfully
   */
  static async balance(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !(req as any).restaurant) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const restaurant = (req as any).restaurant;

      // Calculate balance: sum of all credit transactions minus sum of all debit transactions
      const balanceResult = await pool.query(
        `SELECT 
           COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) -
           COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) as balance
         FROM wallet_transactions
         WHERE walletable_type = 'App\\Models\\Restaurant' AND walletable_id = $1`,
        [restaurant.id]
      );

      const balance = parseFloat(balanceResult.rows[0].balance) || 0;

      success(res, { balance: balance.toFixed(2) }, 'Wallet balance retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve wallet balance', 500);
    }
  }

  /**
   * @swagger
   * /api/restaurant/wallet/transactions:
   *   get:
   *     summary: Get wallet transactions
   *     tags: [Restaurants]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Wallet transactions retrieved successfully
   */
  static async transactions(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !(req as any).restaurant) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const restaurant = (req as any).restaurant;

      const result = await pool.query(
        `SELECT id, type, amount, description, order_id, created_at
         FROM wallet_transactions
         WHERE walletable_type = 'App\\Models\\Restaurant' AND walletable_id = $1
         ORDER BY created_at DESC`,
        [restaurant.id]
      );

      success(res, result.rows, 'Wallet transactions retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve wallet transactions', 500);
    }
  }
}


import { pool } from '../config/database';

export class WalletService {
  /**
   * Credit an entity's wallet (restaurant)
   */
  static async credit(
    entityType: string,
    entityId: number,
    amount: number,
    description: string | null = null,
    orderId: number | null = null
  ): Promise<void> {
    await pool.query(
      `INSERT INTO wallet_transactions (walletable_type, walletable_id, type, amount, description, order_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [entityType, entityId, 'credit', amount, description, orderId]
    );
  }

  /**
   * Debit an entity's wallet (restaurant)
   */
  static async debit(
    entityType: string,
    entityId: number,
    amount: number,
    description: string | null = null,
    orderId: number | null = null
  ): Promise<void> {
    await pool.query(
      `INSERT INTO wallet_transactions (walletable_type, walletable_id, type, amount, description, order_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [entityType, entityId, 'debit', amount, description, orderId]
    );
  }

  /**
   * Get wallet balance for an entity
   */
  static async balance(entityType: string, entityId: number): Promise<number> {
    const result = await pool.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) -
         COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) as balance
       FROM wallet_transactions
       WHERE walletable_type = $1 AND walletable_id = $2`,
      [entityType, entityId]
    );

    return parseFloat(result.rows[0].balance) || 0;
  }
}


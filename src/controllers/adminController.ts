import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { success, error } from '../utils/response';

export class AdminController {
  /**
   * @swagger
   * /api/admin:
   *   get:
   *     summary: Get authenticated admin user
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Admin user retrieved successfully
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - Admin access required
   */
  static async index(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      // Return the authenticated admin user
      success(res, { user: req.user }, 'Admin user retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve admin user', 500);
    }
  }
}


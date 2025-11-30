import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { success, error } from '../utils/response';
import { pool } from '../config/database';

export class NotificationController {
  /**
   * @swagger
   * /api/user/notifications:
   *   get:
   *     summary: Get user notifications
   *     tags: [Notifications]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *       - in: query
   *         name: per_page
   *         schema:
   *           type: integer
   *           default: 10
   *     responses:
   *       200:
   *         description: Notifications retrieved successfully
   */
  static async index(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const perPage = parseInt(req.query.per_page as string) || 10;
      const offset = (page - 1) * perPage;

      // Get notifications
      const notificationsResult = await pool.query(
        `SELECT id, type, data, read_at, created_at, updated_at
         FROM notifications
         WHERE notifiable_type = $1 AND notifiable_id = $2
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4`,
        ['App\\Models\\User', req.user.id, perPage, offset]
      );

      // Get total count for pagination
      const countResult = await pool.query(
        `SELECT COUNT(*) as total
         FROM notifications
         WHERE notifiable_type = $1 AND notifiable_id = $2`,
        ['App\\Models\\User', req.user.id]
      );

      const total = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(total / perPage);

      // Parse JSON data for each notification
      const notifications = notificationsResult.rows.map((notif: any) => ({
        ...notif,
        data: typeof notif.data === 'string' ? JSON.parse(notif.data) : notif.data,
      }));

      // Get unread count
      const unreadCountResult = await pool.query(
        `SELECT COUNT(*) as count
         FROM notifications
         WHERE notifiable_type = $1 AND notifiable_id = $2 AND read_at IS NULL`,
        ['App\\Models\\User', req.user.id]
      );

      const unreadCount = parseInt(unreadCountResult.rows[0].count);

      success(
        res,
        {
          notifications,
          unread_count: unreadCount,
          pagination: {
            current_page: page,
            per_page: perPage,
            total,
            total_pages: totalPages,
          },
        },
        'Notifications retrieved successfully'
      );
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve notifications', 500);
    }
  }

  /**
   * @swagger
   * /api/user/notifications/{id}/read:
   *   patch:
   *     summary: Mark notification as read
   *     tags: [Notifications]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       204:
   *         description: Notification marked as read
   *       404:
   *         description: Notification not found
   */
  static async markAsRead(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const notificationId = req.params.id;

      // Check if notification exists and belongs to user
      const notificationResult = await pool.query(
        `SELECT id FROM notifications
         WHERE id = $1 AND notifiable_type = $2 AND notifiable_id = $3`,
        [notificationId, 'App\\Models\\User', req.user.id]
      );

      if (notificationResult.rows.length === 0) {
        error(res, 'Notification not found', 404);
        return;
      }

      // Mark as read
      await pool.query(
        'UPDATE notifications SET read_at = NOW(), updated_at = NOW() WHERE id = $1',
        [notificationId]
      );

      res.status(204).send();
    } catch (err: any) {
      error(res, err.message || 'Failed to mark notification as read', 500);
    }
  }

  /**
   * @swagger
   * /api/user/notifications/unread-count:
   *   get:
   *     summary: Get unread notifications count
   *     tags: [Notifications]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Unread count retrieved successfully
   */
  static async unreadCount(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const result = await pool.query(
        `SELECT COUNT(*) as count
         FROM notifications
         WHERE notifiable_type = $1 AND notifiable_id = $2 AND read_at IS NULL`,
        ['App\\Models\\User', req.user.id]
      );

      const count = parseInt(result.rows[0].count);

      success(res, { count }, 'Unread count retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve unread count', 500);
    }
  }
}


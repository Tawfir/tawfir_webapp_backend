import { Response, Request } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AuthService } from '../services/authService';
import { success, error } from '../utils/response';
import { pool } from '../config/database';
import { z } from 'zod';

const registerSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  phone: z.string().min(1),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const resetCodeSchema = z.object({
  email: z.string().email(),
});

const checkResetCodeSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  password: z.string().min(6),
  password_confirmation: z.string().min(6),
}).refine((data) => data.password === data.password_confirmation, {
  message: "Passwords don't match",
  path: ['password_confirmation'],
});

const updatePasswordSchema = z.object({
  current_password: z.string().min(1),
  password: z.string().min(6),
  password_confirmation: z.string().min(6),
}).refine((data) => data.password === data.password_confirmation, {
  message: "Passwords don't match",
  path: ['password_confirmation'],
});

const updateProfileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  phone: z.string().min(1).optional(),
});

export class AuthController {
  /**
   * @swagger
   * /api/auth/register:
   *   post:
   *     summary: Register a new user
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *               - email
   *               - phone
   *               - password
   *             properties:
   *               name:
   *                 type: string
   *               email:
   *                 type: string
   *                 format: email
   *               phone:
   *                 type: string
   *               password:
   *                 type: string
   *                 minLength: 6
   *     responses:
   *       200:
   *         description: Registration successful
   *       400:
   *         description: Validation error
   */
  static async register(req: AuthRequest, res: Response): Promise<void> {
    try {
      const validated = registerSchema.parse(req.body);
      const result = await AuthService.register(validated);
      success(res, result, 'Registration successful');
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        error(res, 'Validation error', 400, err.errors);
        return;
      }
      error(res, err.message || 'Registration failed', 400);
    }
  }

  /**
   * @swagger
   * /api/auth/login:
   *   post:
   *     summary: Login user
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - password
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *               password:
   *                 type: string
   *     responses:
   *       200:
   *         description: Login successful
   *       401:
   *         description: Invalid credentials
   */
  static async login(req: AuthRequest, res: Response): Promise<void> {
    try {
      const validated = loginSchema.parse(req.body);
      const result = await AuthService.login(validated.email, validated.password);
      success(res, result, 'Login successful');
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        error(res, 'Validation error', 400, err.errors);
        return;
      }
      error(res, err.message || 'Login failed', 401);
    }
  }

  /**
   * @swagger
   * /api/auth/refresh:
   *   post:
   *     summary: Refresh authentication token
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Token refreshed successfully
   *       401:
   *         description: Unauthorized
   */
  static async refresh(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      // Revoke current token
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const token = authHeader.substring(7);
        await AuthService.revokeToken(token);
      }

      // Create new token
      const newToken = await AuthService.createToken(req.user.id);
      success(res, { token: newToken }, 'Token refreshed successfully');
    } catch (err: any) {
      error(res, err.message || 'Token refresh failed', 500);
    }
  }

  /**
   * @swagger
   * /api/auth/logout:
   *   post:
   *     summary: Logout user
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Logged out successfully
   *       401:
   *         description: Unauthorized
   */
  static async logout(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      await AuthService.revokeAllTokens(req.user.id);
      success(res, null, 'Logged out successfully');
    } catch (err: any) {
      error(res, err.message || 'Logout failed', 500);
    }
  }

  /**
   * @swagger
   * /api/auth/user:
   *   get:
   *     summary: Get current user profile
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: User profile retrieved successfully
   *       401:
   *         description: Unauthorized
   */
  static async user(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }
      success(res, req.user, 'User profile retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve user', 500);
    }
  }

  /**
   * @swagger
   * /api/auth/update-profile:
   *   put:
   *     summary: Update user profile
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               phone:
   *                 type: string
   *     responses:
   *       200:
   *         description: Profile updated successfully
   *       401:
   *         description: Unauthorized
   */
  static async updateProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const validated = updateProfileSchema.parse(req.body);
      const { pool } = await import('../config/database');

      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (validated.name) {
        updates.push(`name = $${paramCount++}`);
        values.push(validated.name);
      }
      if (validated.phone) {
        updates.push(`phone = $${paramCount++}`);
        values.push(validated.phone);
      }

      if (updates.length === 0) {
        error(res, 'No fields to update', 400);
        return;
      }

      values.push(req.user.id);
      const query = `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING id, name, email, phone, type, created_at, updated_at`;
      
      const result = await pool.query(query, values);
      success(res, result.rows[0], 'Profile updated successfully');
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        error(res, 'Validation error', 400, err.errors);
        return;
      }
      error(res, err.message || 'Profile update failed', 500);
    }
  }

  /**
   * @swagger
   * /api/auth/password/update:
   *   post:
   *     summary: Update user password
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - current_password
   *               - password
   *               - password_confirmation
   *             properties:
   *               current_password:
   *                 type: string
   *               password:
   *                 type: string
   *                 minLength: 6
   *               password_confirmation:
   *                 type: string
   *                 minLength: 6
   *     responses:
   *       200:
   *         description: Password updated successfully
   *       401:
   *         description: Unauthorized
   */
  static async updatePassword(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const validated = updatePasswordSchema.parse(req.body);
      await AuthService.updatePassword(
        req.user.id,
        validated.current_password,
        validated.password
      );
      success(res, null, 'Password updated successfully');
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        error(res, 'Validation error', 400, err.errors);
        return;
      }
      error(res, err.message || 'Password update failed', 400);
    }
  }

  /**
   * @swagger
   * /api/auth/request-password-reset-code:
   *   post:
   *     summary: Request password reset code
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *     responses:
   *       200:
   *         description: Reset code sent
   *       404:
   *         description: User not found
   */
  static async requestPasswordResetCode(req: AuthRequest, res: Response): Promise<void> {
    try {
      const validated = resetCodeSchema.parse(req.body);
      
      // Check if user exists
      const { pool } = await import('../config/database');
      const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [validated.email]);
      
      if (userResult.rows.length === 0) {
        error(res, 'User not found', 404);
        return;
      }

      const code = await AuthService.generateResetCode(validated.email);
      
      // TODO: Send email/notification with code
      // For now, we'll just return success (in production, send via email)
      console.log(`Password reset code for ${validated.email}: ${code}`);
      
      success(res, null, 'Reset code sent');
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        error(res, 'Validation error', 400, err.errors);
        return;
      }
      error(res, err.message || 'Failed to send reset code', 500);
    }
  }

  /**
   * @swagger
   * /api/auth/check-reset-code:
   *   post:
   *     summary: Verify password reset code
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - code
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *               code:
   *                 type: string
   *                 length: 6
   *     responses:
   *       200:
   *         description: Code is valid
   *       422:
   *         description: Invalid or expired code
   */
  static async checkResetCode(req: AuthRequest, res: Response): Promise<void> {
    try {
      const validated = checkResetCodeSchema.parse(req.body);
      const isValid = await AuthService.verifyResetCode(validated.email, validated.code);
      
      if (!isValid) {
        error(res, 'Invalid or expired code', 422);
        return;
      }
      
      success(res, null, 'Code is valid');
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        error(res, 'Validation error', 400, err.errors);
        return;
      }
      error(res, err.message || 'Failed to verify code', 500);
    }
  }

  /**
   * @swagger
   * /api/auth/reset-password-with-code:
   *   post:
   *     summary: Reset password with code
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - code
   *               - password
   *               - password_confirmation
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *               code:
   *                 type: string
   *                 length: 6
   *               password:
   *                 type: string
   *                 minLength: 6
   *               password_confirmation:
   *                 type: string
   *                 minLength: 6
   *     responses:
   *       200:
   *         description: Password reset successfully
   *       422:
   *         description: Invalid or expired code
   */
  static async resetPasswordWithCode(req: AuthRequest, res: Response): Promise<void> {
    try {
      const validated = resetPasswordSchema.parse(req.body);
      await AuthService.resetPassword(validated.email, validated.code, validated.password);
      success(res, null, 'Password reset successfully');
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        error(res, 'Validation error', 400, err.errors);
        return;
      }
      error(res, err.message || 'Password reset failed', 422);
    }
  }

  /**
   * @swagger
   * /api/auth/user:
   *   delete:
   *     summary: Delete user account
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Account deleted successfully
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Not allowed to delete this account
   */
  static async deleteAccount(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      // Only allow regular users to delete their account
      if (req.user.type !== 'user') {
        error(res, 'You are not allowed to delete this account.', 403);
        return;
      }

      // Revoke all tokens
      await AuthService.revokeAllTokens(req.user.id);

      // Soft delete user
      const { pool } = await import('../config/database');
      await pool.query(
        'UPDATE users SET deleted_at = NOW() WHERE id = $1',
        [req.user.id]
      );

      success(res, null, 'Your account and its orders have been deleted.');
    } catch (err: any) {
      error(res, err.message || 'Account deletion failed', 500);
    }
  }

  /**
   * @swagger
   * /api/auth/metrics:
   *   get:
   *     summary: Get platform metrics (public endpoint)
   *     tags: [Auth]
   *     responses:
   *       200:
   *         description: Platform metrics retrieved successfully
   */
  static async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      // Calculate metrics from database
      const [restaurantsResult, usersResult, ordersResult, co2Result] = await Promise.all([
        // Total approved restaurants
        pool.query("SELECT COUNT(*) as count FROM restaurants WHERE status = 'approved'"),
        // Total users (not deleted)
        pool.query('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL'),
        // Total orders processed (not cancelled, not deleted)
        pool.query("SELECT COUNT(*) as count FROM orders WHERE status != 'cancelled' AND deleted_at IS NULL"),
        // Total CO2 saved from completed orders
        pool.query(
          `SELECT COALESCE(SUM((d.co2_saved * oi.quantity)), 0) as total
           FROM order_items oi
           JOIN orders o ON oi.order_id = o.id
           JOIN dishes d ON oi.dish_id = d.id
           WHERE o.status = 'completed' AND o.deleted_at IS NULL AND d.co2_saved IS NOT NULL`
        ),
      ]);

      const metrics = {
        total_restaurants: parseInt(restaurantsResult.rows[0]?.count || '0'),
        total_users: parseInt(usersResult.rows[0]?.count || '0'),
        orders_processed: parseInt(ordersResult.rows[0]?.count || '0'),
        co2_saved_kg: parseFloat(co2Result.rows[0]?.total || '0'),
      };

      // Update metrics in platform_metrics table (always id = 1)
      await pool.query(
        `INSERT INTO platform_metrics (id, total_restaurants, total_users, orders_processed, co2_saved_kg, updated_at)
         VALUES (1, $1, $2, $3, $4, NOW())
         ON CONFLICT (id) DO UPDATE
         SET total_restaurants = $1, total_users = $2, orders_processed = $3, co2_saved_kg = $4, updated_at = NOW()`,
        [metrics.total_restaurants, metrics.total_users, metrics.orders_processed, metrics.co2_saved_kg]
      );

      success(res, metrics, 'Platform metrics retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve platform metrics', 500);
    }
  }
}


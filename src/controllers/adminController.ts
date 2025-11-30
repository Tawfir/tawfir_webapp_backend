import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { success, error } from '../utils/response';
import { pool } from '../config/database';

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

  /**
   * @swagger
   * /api/admin/restaurants:
   *   get:
   *     summary: Get all restaurants (admin view)
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Restaurants retrieved successfully
   */
  static async getRestaurants(req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await pool.query(
        `SELECT r.*, 
         u.name as owner_name, u.email as owner_email,
         (SELECT json_agg(json_build_object('id', fc.id, 'name', fc.name))
          FROM food_categories fc
          JOIN food_category_restaurant fcr ON fc.id = fcr.food_category_id
          WHERE fcr.restaurant_id = r.id) as categories
         FROM restaurants r
         JOIN users u ON r.user_id = u.id
         ORDER BY r.created_at DESC`
      );

      success(res, { restaurants: result.rows }, 'Restaurants retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve restaurants', 500);
    }
  }

  /**
   * @swagger
   * /api/admin/orders:
   *   get:
   *     summary: Get all orders (admin view)
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Orders retrieved successfully
   */
  static async getOrders(req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await pool.query(
        `SELECT o.*,
         json_build_object('id', u.id, 'name', u.name, 'email', u.email) as user,
         json_build_object('id', r.id, 'name', r.name) as restaurant
         FROM orders o
         JOIN users u ON o.user_id = u.id
         JOIN restaurants r ON o.restaurant_id = r.id
         ORDER BY o.created_at DESC`
      );

      // Get order items for each order
      for (const order of result.rows) {
        const itemsResult = await pool.query(
          `SELECT oi.*,
           json_build_object('id', d.id, 'name', d.name) as dish
           FROM order_items oi
           JOIN dishes d ON oi.dish_id = d.id
           WHERE oi.order_id = $1`,
          [order.id]
        );
        order.items = itemsResult.rows;
      }

      success(res, { orders: result.rows }, 'Orders retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve orders', 500);
    }
  }

  /**
   * @swagger
   * /api/admin/withdrawals:
   *   get:
   *     summary: Get all withdrawal requests
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Withdrawal requests retrieved successfully
   */
  static async getWithdrawals(req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await pool.query(
        `SELECT wr.*,
         json_build_object('id', r.id, 'name', r.name) as restaurant
         FROM withdrawal_requests wr
         JOIN restaurants r ON wr.restaurant_id = r.id
         ORDER BY wr.created_at DESC`
      );

      success(res, { withdrawals: result.rows }, 'Withdrawal requests retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve withdrawal requests', 500);
    }
  }

  /**
   * @swagger
   * /api/admin/stats:
   *   get:
   *     summary: Get admin dashboard statistics
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Statistics retrieved successfully
   */
  static async getStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Total restaurants
      const restaurantsResult = await pool.query('SELECT COUNT(*) as count FROM restaurants');
      const totalRestaurants = parseInt(restaurantsResult.rows[0].count);

      // Surplus items distributed (from completed orders)
      const itemsResult = await pool.query(
        `SELECT COALESCE(SUM(oi.quantity), 0) as total
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         WHERE o.status = 'completed'`
      );
      const surplusItemsDistributed = parseInt(itemsResult.rows[0].total);

      // Total CO2 saved
      const co2Result = await pool.query(
        `SELECT COALESCE(SUM((d.co2_saved * oi.quantity)), 0) as total
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         JOIN dishes d ON oi.dish_id = d.id
         WHERE o.status = 'completed' AND d.co2_saved IS NOT NULL`
      );
      const totalCO2Saved = parseFloat(co2Result.rows[0].total) || 0;

      // Platform revenue (7.5% service fee from completed orders)
      const revenueResult = await pool.query(
        `SELECT COALESCE(SUM(o.total_price), 0) as total
         FROM orders o
         WHERE o.status = 'completed'`
      );
      const totalRevenue = parseFloat(revenueResult.rows[0].total) || 0;
      const platformRevenue = (totalRevenue * 7.5) / 100;

      success(
        res,
        {
          totalRestaurants,
          surplusItemsDistributed,
          totalCO2Saved,
          platformRevenue,
        },
        'Statistics retrieved successfully'
      );
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve statistics', 500);
    }
  }

  /**
   * @swagger
   * /api/admin/categories:
   *   get:
   *     summary: Get all food categories (admin view)
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *         description: Search query for category name or slug
   *     responses:
   *       200:
   *         description: Categories retrieved successfully
   */
  static async getCategories(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { search } = req.query;
      let query = `
        SELECT fc.id, fc.name, fc.slug, fc.image, fc.cover,
               COUNT(DISTINCT fcd.dish_id) AS "dishesCount",
               COUNT(DISTINCT fcr.restaurant_id) AS "restaurantsCount"
        FROM food_categories fc
        LEFT JOIN food_category_dish fcd ON fc.id = fcd.food_category_id
        LEFT JOIN food_category_restaurant fcr ON fc.id = fcr.food_category_id
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (search) {
        query += ` AND (fc.name ILIKE $${paramIndex} OR fc.slug ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      query += ` GROUP BY fc.id ORDER BY fc.name ASC`;

      const result = await pool.query(query, params);
      success(res, { categories: result.rows }, 'Food categories retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve food categories', 500);
    }
  }

  /**
   * @swagger
   * /api/admin/categories:
   *   post:
   *     summary: Create a new food category
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *             properties:
   *               name:
   *                 type: string
   *               slug:
   *                 type: string
   *               image:
   *                 type: string
   *               cover:
   *                 type: string
   *     responses:
   *       201:
   *         description: Category created successfully
   *       400:
   *         description: Validation error
   */
  static async createCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { name, slug, image, cover } = req.body;

      if (!name || name.trim() === '') {
        error(res, 'Category name is required', 400);
        return;
      }

      // Generate slug from name if not provided
      let categorySlug = slug || name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      // Check if slug already exists
      const existingCategory = await pool.query(
        'SELECT id FROM food_categories WHERE slug = $1',
        [categorySlug]
      );

      if (existingCategory.rows.length > 0) {
        // If slug exists, append a number
        let counter = 1;
        let uniqueSlug = `${categorySlug}-${counter}`;
        while (true) {
          const check = await pool.query(
            'SELECT id FROM food_categories WHERE slug = $1',
            [uniqueSlug]
          );
          if (check.rows.length === 0) {
            categorySlug = uniqueSlug;
            break;
          }
          counter++;
          uniqueSlug = `${categorySlug.split('-').slice(0, -1).join('-')}-${counter}`;
        }
      }

      // Create category
      const result = await pool.query(
        `INSERT INTO food_categories (name, slug, image, cover, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING id, name, slug, image, cover, created_at, updated_at`,
        [name.trim(), categorySlug, image || null, cover || null]
      );

      success(res, { category: result.rows[0] }, 'Category created successfully', 201);
    } catch (err: any) {
      if (err.code === '23505') { // Unique constraint violation
        error(res, 'A category with this slug already exists', 400);
        return;
      }
      error(res, err.message || 'Failed to create category', 500);
    }
  }
}


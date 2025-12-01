import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { success, error } from '../utils/response';
import { pool } from '../config/database';
import { uploadToS3, deleteFromS3, extractS3Key } from '../services/s3Service';

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
   * /api/admin/stats/chart:
   *   get:
   *     summary: Get admin dashboard chart data (CO2 and orders over time)
   *     tags: [Admin]
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
          // Get CO2 saved for this day from completed orders
          const co2Result = await pool.query(
            `SELECT COALESCE(SUM((d.co2_saved * oi.quantity)), 0) as total
             FROM order_items oi
             JOIN orders o ON oi.order_id = o.id
             JOIN dishes d ON oi.dish_id = d.id
             WHERE o.status = 'completed' 
               AND o.created_at >= $1 
               AND o.created_at < $2
               AND d.co2_saved IS NOT NULL`,
            [date, nextDate]
          );
          const value = parseFloat(co2Result.rows[0].total) || 0;
          data.push({ date: dateLabel, value: parseFloat(value.toFixed(2)) });
        } else {
          // Get number of completed orders for this day
          const ordersResult = await pool.query(
            `SELECT COUNT(*) as count
             FROM orders
             WHERE status = 'completed'
               AND created_at >= $1
               AND created_at < $2`,
            [date, nextDate]
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
        SELECT fc.id, fc.name, fc.slug, fc.image,
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
   * /api/admin/categories/{id}:
   *   get:
   *     summary: Get a single food category by ID
   *     tags: [Admin]
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
   *         description: Category retrieved successfully
   *       404:
   *         description: Category not found
   */
  static async getCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const categoryId = parseInt(req.params.id);

      if (isNaN(categoryId)) {
        error(res, 'Invalid category ID', 400);
        return;
      }

      // Get category
      const categoryResult = await pool.query(
        `SELECT fc.id, fc.name, fc.slug, fc.image
        FROM food_categories fc
        WHERE fc.id = $1`,
        [categoryId]
      );

      if (categoryResult.rows.length === 0) {
        error(res, 'Category not found', 404);
        return;
      }

      const category = categoryResult.rows[0];

      // Get dishes in this category
      const dishesResult = await pool.query(
        `SELECT d.id, d.name, d.price, d.image, r.name as restaurant_name
        FROM dishes d
        JOIN food_category_dish fcd ON d.id = fcd.dish_id
        JOIN restaurants r ON d.restaurant_id = r.id
        WHERE fcd.food_category_id = $1
        ORDER BY d.name ASC`,
        [categoryId]
      );

      // Get restaurants with this category
      const restaurantsResult = await pool.query(
        `SELECT DISTINCT r.id, r.name, r.address, r.status
        FROM restaurants r
        JOIN food_category_restaurant fcr ON r.id = fcr.restaurant_id
        WHERE fcr.food_category_id = $1
        ORDER BY r.name ASC`,
        [categoryId]
      );

      category.dishes = dishesResult.rows;
      category.restaurants = restaurantsResult.rows;
      category.dishesCount = dishesResult.rows.length;
      category.restaurantsCount = restaurantsResult.rows.length;

      success(res, { category }, 'Category retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve category', 500);
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
   *     responses:
   *       201:
   *         description: Category created successfully
   *       400:
   *         description: Validation error
   */
  static async createCategory(req: AuthRequest, res: Response): Promise<void> {
    let imageUrl: string | null = null;
    
    try {
      const name = req.body.name;
      const slug = req.body.slug;

      if (!name || name.trim() === '') {
        error(res, 'Category name is required', 400);
        return;
      }

      // Handle file upload if provided
      if (req.file) {
        const uploadResult = await uploadToS3(
          req.file.buffer,
          'food-categories/images',
          req.file.originalname,
          req.file.mimetype
        );
        imageUrl = uploadResult.url;
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
        `INSERT INTO food_categories (name, slug, image, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING id, name, slug, image, created_at, updated_at`,
        [name.trim(), categorySlug, imageUrl]
      );

      success(res, { category: result.rows[0] }, 'Category created successfully', 201);
    } catch (err: any) {
      // Clean up uploaded files if category creation failed
      if (imageUrl) {
        try {
          await deleteFromS3(extractS3Key(imageUrl));
        } catch (deleteErr) {
          console.error('Failed to delete uploaded image:', deleteErr);
        }
      }

      if (err.code === '23505') { // Unique constraint violation
        error(res, 'A category with this slug already exists', 400);
        return;
      }
      error(res, err.message || 'Failed to create category', 500);
    }
  }

  /**
   * @swagger
   * /api/admin/categories/{id}:
   *   put:
   *     summary: Update a food category
   *     tags: [Admin]
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
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               slug:
   *                 type: string
   *               image:
   *                 type: string
   *                 format: binary
   *     responses:
   *       200:
   *         description: Category updated successfully
   *       404:
   *         description: Category not found
   */
  static async updateCategory(req: AuthRequest, res: Response): Promise<void> {
    let imageUrl: string | null = null;
    let oldImageUrl: string | null = null;
    
    try {
      const categoryId = parseInt(req.params.id);
      const name = req.body?.name;

      // Check if category exists
      const categoryResult = await pool.query(
        'SELECT * FROM food_categories WHERE id = $1',
        [categoryId]
      );

      if (categoryResult.rows.length === 0) {
        error(res, 'Category not found', 404);
        return;
      }

      const existingCategory = categoryResult.rows[0];
      oldImageUrl = existingCategory.image;

      // Handle file upload if new image is provided
      if (req.file) {
        try {
          const uploadResult = await uploadToS3(
            req.file.buffer,
            'food-categories/images',
            req.file.originalname,
            req.file.mimetype
          );
          imageUrl = uploadResult.url;
        } catch (uploadError: any) {
          console.error('S3 upload failed:', uploadError);
          throw new Error(`Failed to upload image to S3: ${uploadError.message}`);
        }
      }

      // Build update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (name && name.trim() !== '') {
        updates.push(`name = $${paramCount++}`);
        values.push(name.trim());
        
        // Auto-generate slug from name if name is being updated
        // This ensures slug stays in sync with the name
        const generatedSlug = name.toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
        
        // Check if generated slug already exists (excluding current category)
        const slugCheck = await pool.query(
          'SELECT id FROM food_categories WHERE slug = $1 AND id != $2',
          [generatedSlug, categoryId]
        );

        if (slugCheck.rows.length > 0) {
          // If slug exists, append a number
          let counter = 1;
          let uniqueSlug = `${generatedSlug}-${counter}`;
          while (true) {
            const check = await pool.query(
              'SELECT id FROM food_categories WHERE slug = $1 AND id != $2',
              [uniqueSlug, categoryId]
            );
            if (check.rows.length === 0) {
              updates.push(`slug = $${paramCount++}`);
              values.push(uniqueSlug);
              break;
            }
            counter++;
            uniqueSlug = `${generatedSlug}-${counter}`;
          }
        } else {
          updates.push(`slug = $${paramCount++}`);
          values.push(generatedSlug);
        }
      }

      if (imageUrl) {
        updates.push(`image = $${paramCount++}`);
        values.push(imageUrl);
      }

      if (updates.length > 0) {
        values.push(categoryId);
        const query = `UPDATE food_categories SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`;
        await pool.query(query, values);
      } else {
        // If no updates, just update the timestamp
        await pool.query(
          'UPDATE food_categories SET updated_at = NOW() WHERE id = $1',
          [categoryId]
        );
      }

      // Delete old image from S3 if new image was uploaded
      if (imageUrl && oldImageUrl) {
        try {
          await deleteFromS3(extractS3Key(oldImageUrl));
        } catch (deleteErr) {
          console.error('Failed to delete old image from S3:', deleteErr);
        }
      }

      // Get updated category
      const result = await pool.query(
        'SELECT * FROM food_categories WHERE id = $1',
        [categoryId]
      );

      success(res, { category: result.rows[0] }, 'Category updated successfully');
    } catch (err: any) {
      console.error('Error updating category:', err);
      console.error('Error stack:', err.stack);
      
      // Clean up uploaded files if update failed
      if (imageUrl) {
        try {
          await deleteFromS3(extractS3Key(imageUrl));
        } catch (deleteErr) {
          console.error('Failed to delete uploaded image:', deleteErr);
        }
      }

      if (err.code === '23505') { // Unique constraint violation
        error(res, 'A category with this slug already exists', 400);
        return;
      }
      error(res, err.message || 'Failed to update category', 500);
    }
  }

  /**
   * @swagger
   * /api/admin/categories/{id}/image:
   *   delete:
   *     summary: Delete category image
   *     tags: [Admin]
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
   *         description: Image deleted successfully
   *       404:
   *         description: Category not found or has no image
   */
  static async deleteCategoryImage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const categoryId = parseInt(req.params.id);
      if (isNaN(categoryId)) {
        error(res, 'Invalid category ID', 400);
        return;
      }

      // Check if category exists
      const categoryResult = await pool.query(
        'SELECT * FROM food_categories WHERE id = $1',
        [categoryId]
      );

      if (categoryResult.rows.length === 0) {
        error(res, 'Category not found', 404);
        return;
      }

      const category = categoryResult.rows[0];

      if (!category.image) {
        error(res, 'Category has no image to delete', 404);
        return;
      }

      // Delete from S3
      try {
        await deleteFromS3(extractS3Key(category.image));
      } catch (s3Err) {
        console.error('Failed to delete image from S3:', s3Err);
        // Continue to update database even if S3 deletion fails
      }

      // Update database to set image to null
      await pool.query(
        'UPDATE food_categories SET image = NULL, updated_at = NOW() WHERE id = $1',
        [categoryId]
      );

      success(res, { category_id: categoryId }, 'Image deleted successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to delete image', 500);
    }
  }
}


import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { success, error } from '../utils/response';
import { pool } from '../config/database';
import { z } from 'zod';

const createRestaurantSchema = z.object({
  restaurant_name: z.string().min(1).max(255),
  address: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  public_phone: z.string().optional(),
  private_phone: z.string().optional(),
  working_hours: z.any().optional(), // JSON object
  food_category_ids: z.array(z.number().int().positive()).optional(),
});

const updateRestaurantSchema = z.object({
  restaurant_name: z.string().min(1).max(255).optional(),
  address: z.string().min(1).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  public_phone: z.string().optional(),
  private_phone: z.string().optional(),
  working_hours: z.any().optional(),
  food_category_ids: z.array(z.number().int().positive()).optional(),
});

export class RestaurantController {
  /**
   * @swagger
   * /api/restaurant:
   *   post:
   *     summary: Register/create a restaurant
   *     tags: [Restaurants]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - restaurant_name
   *               - address
   *               - lat
   *               - lng
   *             properties:
   *               restaurant_name:
   *                 type: string
   *               address:
   *                 type: string
   *               lat:
   *                 type: number
   *               lng:
   *                 type: number
   *               public_phone:
   *                 type: string
   *               private_phone:
   *                 type: string
   *               working_hours:
   *                 type: object
   *               food_category_ids:
   *                 type: array
   *                 items:
   *                   type: integer
   *     responses:
   *       201:
   *         description: Restaurant registration successful
   */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const validated = createRestaurantSchema.parse(req.body);

      // Check if user already has a restaurant
      const existingRestaurant = await pool.query(
        'SELECT id FROM restaurants WHERE user_id = $1',
        [req.user.id]
      );

      if (existingRestaurant.rows.length > 0) {
        error(res, 'You already have a restaurant registered', 400);
        return;
      }

      // Update user type to restaurant
      await pool.query(
        'UPDATE users SET type = $1, updated_at = NOW() WHERE id = $2',
        ['restaurant', req.user.id]
      );

      // Add restaurant role
      const roleResult = await pool.query('SELECT id FROM roles WHERE name = $1', ['restaurant']);
      if (roleResult.rows.length > 0) {
        await pool.query(
          'INSERT INTO role_user (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [req.user.id, roleResult.rows[0].id]
        );
      }

      // Create restaurant (images would be handled via file upload middleware)
      const result = await pool.query(
        `INSERT INTO restaurants (user_id, name, address, lat, lng, public_phone, private_phone, 
         working_hours, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         RETURNING *`,
        [
          req.user.id,
          validated.restaurant_name,
          validated.address,
          validated.lat,
          validated.lng,
          validated.public_phone || null,
          validated.private_phone || null,
          validated.working_hours ? JSON.stringify(validated.working_hours) : JSON.stringify({}),
          'pending',
        ]
      );

      const restaurant = result.rows[0];

      // Sync categories if provided
      if (validated.food_category_ids && validated.food_category_ids.length > 0) {
        for (const categoryId of validated.food_category_ids) {
          await pool.query(
            'INSERT INTO food_category_restaurant (food_category_id, restaurant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [categoryId, restaurant.id]
          );
        }
      }

      success(res, { restaurant }, 'Registration successful. Your restaurant is under review.', 201);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        error(res, 'Validation error', 400, err.errors);
        return;
      }
      error(res, err.message || 'Restaurant registration failed', 500);
    }
  }

  /**
   * @swagger
   * /api/restaurant/{id}:
   *   get:
   *     summary: Get restaurant details
   *     tags: [Restaurants]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         schema:
   *           type: integer
   *         required: false
   *         description: Restaurant ID (optional, defaults to user's restaurant)
   *     responses:
   *       200:
   *         description: Restaurant retrieved successfully
   *       404:
   *         description: Restaurant not found
   */
  static async get(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const restaurantId = req.params.id ? parseInt(req.params.id) : null;

      let restaurant;
      if (restaurantId) {
        // Get specific restaurant
        const result = await pool.query(
          `SELECT r.*, 
           (SELECT json_agg(json_build_object('id', fc.id, 'name', fc.name, 'image', fc.image))
            FROM food_categories fc
            JOIN food_category_restaurant fcr ON fc.id = fcr.food_category_id
            WHERE fcr.restaurant_id = r.id) as categories
           FROM restaurants r
           WHERE r.id = $1`,
          [restaurantId]
        );

        if (result.rows.length === 0) {
          error(res, 'Restaurant not found', 404);
          return;
        }

        restaurant = result.rows[0];
      } else {
        // Get user's own restaurant
        const result = await pool.query(
          `SELECT r.*,
           (SELECT json_agg(json_build_object('id', fc.id, 'name', fc.name, 'image', fc.image))
            FROM food_categories fc
            JOIN food_category_restaurant fcr ON fc.id = fcr.food_category_id
            WHERE fcr.restaurant_id = r.id) as categories
           FROM restaurants r
           WHERE r.user_id = $1`,
          [req.user.id]
        );

        if (result.rows.length === 0) {
          error(res, 'You have not created a restaurant yet', 404);
          return;
        }

        restaurant = result.rows[0];
      }

      // Get dishes for the restaurant
      const dishesResult = await pool.query(
        `SELECT d.*,
         (SELECT json_agg(json_build_object('id', fc.id, 'name', fc.name, 'image', fc.image))
          FROM food_categories fc
          JOIN food_category_dish fcd ON fc.id = fcd.food_category_id
          WHERE fcd.dish_id = d.id) as categories
         FROM dishes d
         WHERE d.restaurant_id = $1
         ORDER BY d.created_at DESC`,
        [restaurant.id]
      );

      restaurant.dishes = dishesResult.rows;

      success(res, restaurant, 'Restaurant retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve restaurant', 500);
    }
  }

  /**
   * @swagger
   * /api/restaurant:
   *   put:
   *     summary: Update restaurant details
   *     tags: [Restaurants]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               restaurant_name:
   *                 type: string
   *               address:
   *                 type: string
   *               lat:
   *                 type: number
   *               lng:
   *                 type: number
   *               public_phone:
   *                 type: string
   *               private_phone:
   *                 type: string
   *               working_hours:
   *                 type: object
   *               food_category_ids:
   *                 type: array
   *                 items:
   *                   type: integer
   *     responses:
   *       200:
   *         description: Restaurant updated successfully
   *       404:
   *         description: Restaurant not found
   */
  static async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const validated = updateRestaurantSchema.parse(req.body);

      // Get user's restaurant
      const restaurantResult = await pool.query(
        'SELECT * FROM restaurants WHERE user_id = $1',
        [req.user.id]
      );

      if (restaurantResult.rows.length === 0) {
        error(res, 'No restaurant to update', 404);
        return;
      }

      const restaurant = restaurantResult.rows[0];

      // Build update query dynamically
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (validated.restaurant_name) {
        updates.push(`name = $${paramCount++}`);
        values.push(validated.restaurant_name);
      }
      if (validated.address) {
        updates.push(`address = $${paramCount++}`);
        values.push(validated.address);
      }
      if (validated.lat !== undefined) {
        updates.push(`lat = $${paramCount++}`);
        values.push(validated.lat);
      }
      if (validated.lng !== undefined) {
        updates.push(`lng = $${paramCount++}`);
        values.push(validated.lng);
      }
      if (validated.public_phone !== undefined) {
        updates.push(`public_phone = $${paramCount++}`);
        values.push(validated.public_phone);
      }
      if (validated.private_phone !== undefined) {
        updates.push(`private_phone = $${paramCount++}`);
        values.push(validated.private_phone);
      }
      if (validated.working_hours !== undefined) {
        updates.push(`working_hours = $${paramCount++}`);
        values.push(JSON.stringify(validated.working_hours));
      }

      if (updates.length > 0) {
        values.push(restaurant.id);
        const query = `UPDATE restaurants SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`;
        const updateResult = await pool.query(query, values);
        Object.assign(restaurant, updateResult.rows[0]);
      }

      // Sync categories if provided
      if (validated.food_category_ids) {
        // Remove existing categories
        await pool.query(
          'DELETE FROM food_category_restaurant WHERE restaurant_id = $1',
          [restaurant.id]
        );

        // Add new categories
        for (const categoryId of validated.food_category_ids) {
          await pool.query(
            'INSERT INTO food_category_restaurant (food_category_id, restaurant_id) VALUES ($1, $2)',
            [categoryId, restaurant.id]
          );
        }
      }

      // Get updated restaurant with categories
      const finalResult = await pool.query(
        `SELECT r.*,
         (SELECT json_agg(json_build_object('id', fc.id, 'name', fc.name, 'image', fc.image))
          FROM food_categories fc
          JOIN food_category_restaurant fcr ON fc.id = fcr.food_category_id
          WHERE fcr.restaurant_id = r.id) as categories
         FROM restaurants r
         WHERE r.id = $1`,
        [restaurant.id]
      );

      success(res, finalResult.rows[0], 'Restaurant updated successfully');
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        error(res, 'Validation error', 400, err.errors);
        return;
      }
      error(res, err.message || 'Restaurant update failed', 500);
    }
  }
}


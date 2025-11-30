import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { success, error } from '../utils/response';
import { pool } from '../config/database';
import { z } from 'zod';

const createDishSchema = z.object({
  name: z.string().min(1).max(255),
  price: z.number().min(0),
  discounted_price: z.number().min(0).optional(),
  co2_saved: z.number().int().min(0).optional(),
  description: z.string().max(1000).optional(),
  pickup_time: z.string().optional(), // HH:mm format
  availability_method: z.enum(['pickup']).default('pickup'),
  quantity: z.number().int().min(1),
  food_category_ids: z.array(z.number().int().positive()).min(1),
});

const updateDishSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  price: z.number().min(0).optional(),
  discounted_price: z.number().min(0).optional(),
  co2_saved: z.number().int().min(0).optional(),
  description: z.string().max(1000).optional(),
  pickup_time: z.string().optional(),
  availability_method: z.enum(['pickup']).optional(),
  quantity: z.number().int().min(1).optional(),
  food_category_ids: z.array(z.number().int().positive()).optional(),
});

export class RestaurantDishController {
  /**
   * @swagger
   * /api/restaurant/dishes:
   *   get:
   *     summary: List all dishes for the restaurant
   *     tags: [Restaurants]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Dishes retrieved successfully
   */
  static async index(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !(req as any).restaurant) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const restaurant = (req as any).restaurant;

      const result = await pool.query(
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

      success(res, { dishes: result.rows }, 'Dishes retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve dishes', 500);
    }
  }

  /**
   * @swagger
   * /api/restaurant/dishes:
   *   post:
   *     summary: Create a new dish
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
   *               - name
   *               - price
   *               - quantity
   *               - food_category_ids
   *             properties:
   *               name:
   *                 type: string
   *               price:
   *                 type: number
   *               discounted_price:
   *                 type: number
   *               co2_saved:
   *                 type: integer
   *               description:
   *                 type: string
   *               pickup_time:
   *                 type: string
   *               availability_method:
   *                 type: string
   *                 enum: [pickup]
   *               quantity:
   *                 type: integer
   *               food_category_ids:
   *                 type: array
   *                 items:
   *                   type: integer
   *     responses:
   *       201:
   *         description: Dish created successfully
   */
  static async store(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !(req as any).restaurant) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const validated = createDishSchema.parse(req.body);
      const restaurant = (req as any).restaurant;

      // Create dish (image would be handled via file upload middleware)
      const result = await pool.query(
        `INSERT INTO dishes (restaurant_id, name, price, discounted_price, co2_saved, description, 
         pickup_time, availability_method, quantity, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         RETURNING *`,
        [
          restaurant.id,
          validated.name,
          validated.price,
          validated.discounted_price || null,
          validated.co2_saved || null,
          validated.description || null,
          validated.pickup_time || null,
          validated.availability_method,
          validated.quantity,
        ]
      );

      const dish = result.rows[0];

      // Attach categories
      for (const categoryId of validated.food_category_ids) {
        await pool.query(
          'INSERT INTO food_category_dish (food_category_id, dish_id) VALUES ($1, $2)',
          [categoryId, dish.id]
        );
      }

      // Get dish with categories
      const dishResult = await pool.query(
        `SELECT d.*,
         (SELECT json_agg(json_build_object('id', fc.id, 'name', fc.name, 'image', fc.image))
          FROM food_categories fc
          JOIN food_category_dish fcd ON fc.id = fcd.food_category_id
          WHERE fcd.dish_id = d.id) as categories
         FROM dishes d
         WHERE d.id = $1`,
        [dish.id]
      );

      success(res, { dish: dishResult.rows[0] }, 'Dish created successfully', 201);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        error(res, 'Validation error', 400, err.errors);
        return;
      }
      error(res, err.message || 'Dish creation failed', 500);
    }
  }

  /**
   * @swagger
   * /api/restaurant/dishes/{id}:
   *   put:
   *     summary: Update a dish
   *     tags: [Restaurants]
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
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               price:
   *                 type: number
   *               discounted_price:
   *                 type: number
   *               quantity:
   *                 type: integer
   *               food_category_ids:
   *                 type: array
   *                 items:
   *                   type: integer
   *     responses:
   *       200:
   *         description: Dish updated successfully
   *       404:
   *         description: Dish not found
   */
  static async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !(req as any).restaurant) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const dishId = parseInt(req.params.id);
      const validated = updateDishSchema.parse(req.body);
      const restaurant = (req as any).restaurant;

      // Check if dish belongs to restaurant
      const dishResult = await pool.query(
        'SELECT * FROM dishes WHERE id = $1 AND restaurant_id = $2',
        [dishId, restaurant.id]
      );

      if (dishResult.rows.length === 0) {
        error(res, 'Dish not found', 404);
        return;
      }

      // Build update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (validated.name) {
        updates.push(`name = $${paramCount++}`);
        values.push(validated.name);
      }
      if (validated.price !== undefined) {
        updates.push(`price = $${paramCount++}`);
        values.push(validated.price);
      }
      if (validated.discounted_price !== undefined) {
        updates.push(`discounted_price = $${paramCount++}`);
        values.push(validated.discounted_price);
      }
      if (validated.co2_saved !== undefined) {
        updates.push(`co2_saved = $${paramCount++}`);
        values.push(validated.co2_saved);
      }
      if (validated.description !== undefined) {
        updates.push(`description = $${paramCount++}`);
        values.push(validated.description);
      }
      if (validated.pickup_time !== undefined) {
        updates.push(`pickup_time = $${paramCount++}`);
        values.push(validated.pickup_time);
      }
      if (validated.availability_method) {
        updates.push(`availability_method = $${paramCount++}`);
        values.push(validated.availability_method);
      }
      if (validated.quantity !== undefined) {
        updates.push(`quantity = $${paramCount++}`);
        values.push(validated.quantity);
      }

      if (updates.length > 0) {
        values.push(dishId);
        const query = `UPDATE dishes SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`;
        await pool.query(query, values);
      }

      // Sync categories if provided
      if (validated.food_category_ids && validated.food_category_ids.length > 0) {
        // Remove existing categories
        await pool.query('DELETE FROM food_category_dish WHERE dish_id = $1', [dishId]);

        // Add new categories
        for (const categoryId of validated.food_category_ids) {
          await pool.query(
            'INSERT INTO food_category_dish (food_category_id, dish_id) VALUES ($1, $2)',
            [categoryId, dishId]
          );
        }
      }

      // Get updated dish with categories
      const finalResult = await pool.query(
        `SELECT d.*,
         (SELECT json_agg(json_build_object('id', fc.id, 'name', fc.name, 'image', fc.image))
          FROM food_categories fc
          JOIN food_category_dish fcd ON fc.id = fcd.food_category_id
          WHERE fcd.dish_id = d.id) as categories
         FROM dishes d
         WHERE d.id = $1`,
        [dishId]
      );

      success(res, { dish: finalResult.rows[0] }, 'Dish updated successfully');
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        error(res, 'Validation error', 400, err.errors);
        return;
      }
      error(res, err.message || 'Dish update failed', 500);
    }
  }

  /**
   * @swagger
   * /api/restaurant/dishes/{id}:
   *   delete:
   *     summary: Delete a dish
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
   *         description: Dish deleted successfully
   *       404:
   *         description: Dish not found
   */
  static async destroy(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !(req as any).restaurant) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const dishId = parseInt(req.params.id);
      const restaurant = (req as any).restaurant;

      // Check if dish belongs to restaurant
      const dishResult = await pool.query(
        'SELECT id FROM dishes WHERE id = $1 AND restaurant_id = $2',
        [dishId, restaurant.id]
      );

      if (dishResult.rows.length === 0) {
        error(res, 'Dish not found', 404);
        return;
      }

      // Delete dish (cascade will handle related records)
      await pool.query('DELETE FROM dishes WHERE id = $1', [dishId]);

      success(res, null, 'Dish deleted successfully');
    } catch (err: any) {
      error(res, err.message || 'Dish deletion failed', 500);
    }
  }
}


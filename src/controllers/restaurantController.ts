import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { success, error } from '../utils/response';
import { pool } from '../config/database';
import { z } from 'zod';
import { uploadToS3, deleteFromS3, extractS3Key } from '../services/s3Service';

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
  owner_name: z.string().min(1).optional(),
  owner_email: z.string().email().optional(),
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
           u.name as owner_name, u.email as owner_email,
           (SELECT json_agg(json_build_object('id', fc.id, 'name', fc.name, 'image', fc.image))
            FROM food_categories fc
            JOIN food_category_restaurant fcr ON fc.id = fcr.food_category_id
            WHERE fcr.restaurant_id = r.id) as categories
           FROM restaurants r
           JOIN users u ON r.user_id = u.id
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
    let profilePicUrl: string | null = null;
    let coverImageUrl: string | null = null;
    let oldProfilePicUrl: string | null = null;
    let oldCoverImageUrl: string | null = null;
    
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      // Parse body data (FormData sends everything as strings)
      const bodyData: any = {};
      if (req.body.restaurant_name) bodyData.restaurant_name = req.body.restaurant_name;
      if (req.body.address) bodyData.address = req.body.address;
      if (req.body.lat) bodyData.lat = parseFloat(req.body.lat);
      if (req.body.lng) bodyData.lng = parseFloat(req.body.lng);
      if (req.body.public_phone) bodyData.public_phone = req.body.public_phone;
      if (req.body.private_phone) bodyData.private_phone = req.body.private_phone;
      if (req.body.working_hours) {
        bodyData.working_hours = typeof req.body.working_hours === 'string' 
          ? JSON.parse(req.body.working_hours) 
          : req.body.working_hours;
      }
      if (req.body.food_category_ids) {
        bodyData.food_category_ids = Array.isArray(req.body.food_category_ids)
          ? req.body.food_category_ids.map((id: string) => parseInt(id))
          : JSON.parse(req.body.food_category_ids).map((id: number) => parseInt(String(id)));
      }
      if (req.body.owner_name) bodyData.owner_name = req.body.owner_name;
      if (req.body.owner_email) bodyData.owner_email = req.body.owner_email;

      const validated = updateRestaurantSchema.parse(bodyData);

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
      oldProfilePicUrl = restaurant.profile_pic;
      oldCoverImageUrl = restaurant.cover_image;

      // Handle file uploads if provided
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      
      if (files?.profile_pic && files.profile_pic[0]) {
        const uploadResult = await uploadToS3(
          files.profile_pic[0].buffer,
          'restaurants/profile',
          files.profile_pic[0].originalname,
          files.profile_pic[0].mimetype
        );
        profilePicUrl = uploadResult.url;
      }

      if (files?.cover_image && files.cover_image[0]) {
        const uploadResult = await uploadToS3(
          files.cover_image[0].buffer,
          'restaurants/cover',
          files.cover_image[0].originalname,
          files.cover_image[0].mimetype
        );
        coverImageUrl = uploadResult.url;
      }

      // Handle place_pics uploads
      let placePicsUrls: string[] = [];
      if (files?.place_pics && files.place_pics.length > 0) {
        // Upload each place picture to S3
        for (const file of files.place_pics) {
          const uploadResult = await uploadToS3(
            file.buffer,
            'restaurants/place-pics',
            file.originalname,
            file.mimetype
          );
          placePicsUrls.push(uploadResult.url);
        }
      }

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
      if (profilePicUrl) {
        updates.push(`profile_pic = $${paramCount++}`);
        values.push(profilePicUrl);
      }
      if (coverImageUrl) {
        updates.push(`cover_image = $${paramCount++}`);
        values.push(coverImageUrl);
      }
      if (placePicsUrls.length > 0) {
        // Get existing place_pics from database
        const existingPlacePics = restaurant.place_pics 
          ? (Array.isArray(restaurant.place_pics) ? restaurant.place_pics : [])
          : [];
        // Merge existing and new place pics
        const allPlacePics = [...existingPlacePics, ...placePicsUrls];
        updates.push(`place_pics = $${paramCount++}`);
        values.push(JSON.stringify(allPlacePics));
      }

      if (updates.length > 0) {
        values.push(restaurant.id);
        const query = `UPDATE restaurants SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`;
        const updateResult = await pool.query(query, values);
        Object.assign(restaurant, updateResult.rows[0]);
      }

      // Update owner information if provided
      if (validated.owner_name || validated.owner_email) {
        const userUpdates: string[] = [];
        const userValues: any[] = [];
        let userParamCount = 1;

        if (validated.owner_name) {
          userUpdates.push(`name = $${userParamCount++}`);
          userValues.push(validated.owner_name);
        }
        if (validated.owner_email) {
          // Check if email already exists for another user
          const emailCheck = await pool.query(
            'SELECT id FROM users WHERE email = $1 AND id != $2',
            [validated.owner_email, req.user.id]
          );
          if (emailCheck.rows.length > 0) {
            error(res, 'Email already exists for another user', 400);
            return;
          }
          userUpdates.push(`email = $${userParamCount++}`);
          userValues.push(validated.owner_email);
        }

        if (userUpdates.length > 0) {
          userValues.push(req.user.id);
          const userQuery = `UPDATE users SET ${userUpdates.join(', ')}, updated_at = NOW() WHERE id = $${userParamCount}`;
          await pool.query(userQuery, userValues);
        }
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

  /**
   * @swagger
   * /api/restaurant/profile-pic:
   *   delete:
   *     summary: Delete restaurant profile picture
   *     tags: [Restaurants]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Profile picture deleted successfully
   *       404:
   *         description: Restaurant not found or has no profile picture
   */
  static async deleteProfilePic(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const restaurantResult = await pool.query(
        'SELECT * FROM restaurants WHERE user_id = $1',
        [req.user.id]
      );

      if (restaurantResult.rows.length === 0) {
        error(res, 'Restaurant not found', 404);
        return;
      }

      const restaurant = restaurantResult.rows[0];

      if (!restaurant.profile_pic) {
        error(res, 'Restaurant has no profile picture to delete', 404);
        return;
      }

      // Delete from S3
      try {
        await deleteFromS3(extractS3Key(restaurant.profile_pic));
      } catch (s3Err) {
        console.error('Failed to delete profile picture from S3:', s3Err);
        // Continue to update database even if S3 deletion fails
      }

      // Update database to set profile_pic to null
      await pool.query(
        'UPDATE restaurants SET profile_pic = NULL, updated_at = NOW() WHERE id = $1',
        [restaurant.id]
      );

      success(res, { restaurant_id: restaurant.id }, 'Profile picture deleted successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to delete profile picture', 500);
    }
  }

  /**
   * @swagger
   * /api/restaurant/cover-image:
   *   delete:
   *     summary: Delete restaurant cover image
   *     tags: [Restaurants]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Cover image deleted successfully
   *       404:
   *         description: Restaurant not found or has no cover image
   */
  static async deleteCoverImage(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const restaurantResult = await pool.query(
        'SELECT * FROM restaurants WHERE user_id = $1',
        [req.user.id]
      );

      if (restaurantResult.rows.length === 0) {
        error(res, 'Restaurant not found', 404);
        return;
      }

      const restaurant = restaurantResult.rows[0];

      if (!restaurant.cover_image) {
        error(res, 'Restaurant has no cover image to delete', 404);
        return;
      }

      // Delete from S3
      try {
        await deleteFromS3(extractS3Key(restaurant.cover_image));
      } catch (s3Err) {
        console.error('Failed to delete cover image from S3:', s3Err);
        // Continue to update database even if S3 deletion fails
      }

      // Update database to set cover_image to null
      await pool.query(
        'UPDATE restaurants SET cover_image = NULL, updated_at = NOW() WHERE id = $1',
        [restaurant.id]
      );

      success(res, { restaurant_id: restaurant.id }, 'Cover image deleted successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to delete cover image', 500);
    }
  }

  /**
   * @swagger
   * /api/restaurant/place-pics/{index}:
   *   delete:
   *     summary: Delete a place picture by index
   *     tags: [Restaurants]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: index
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Place picture deleted successfully
   *       404:
   *         description: Restaurant not found or invalid index
   */
  static async deletePlacePic(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const index = parseInt(req.params.index);
      if (isNaN(index) || index < 0) {
        error(res, 'Invalid index', 400);
        return;
      }

      const restaurantResult = await pool.query(
        'SELECT * FROM restaurants WHERE user_id = $1',
        [req.user.id]
      );

      if (restaurantResult.rows.length === 0) {
        error(res, 'Restaurant not found', 404);
        return;
      }

      const restaurant = restaurantResult.rows[0];

      // Parse place_pics from JSONB
      const placePics = Array.isArray(restaurant.place_pics) 
        ? restaurant.place_pics 
        : (restaurant.place_pics ? [restaurant.place_pics] : []);

      if (index >= placePics.length) {
        error(res, 'Invalid index: place picture not found', 404);
        return;
      }

      const imageUrl = placePics[index];

      // Delete from S3
      try {
        await deleteFromS3(extractS3Key(imageUrl));
      } catch (s3Err) {
        console.error('Failed to delete place picture from S3:', s3Err);
        // Continue to update database even if S3 deletion fails
      }

      // Remove from array and update database
      const updatedPlacePics = placePics.filter((_, i) => i !== index);
      await pool.query(
        'UPDATE restaurants SET place_pics = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(updatedPlacePics), restaurant.id]
      );

      success(res, { restaurant_id: restaurant.id, index }, 'Place picture deleted successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to delete place picture', 500);
    }
  }

  /**
   * @swagger
   * /api/restaurant/revenue:
   *   get:
   *     summary: Get revenue management data for the restaurant
   *     tags: [Restaurants]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Revenue data retrieved successfully
   */
  static async getRevenue(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !(req as any).restaurant) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const restaurant = (req as any).restaurant;

      // Get overall revenue summary
      const summaryResult = await pool.query(
        `SELECT 
          COALESCE(SUM(CASE WHEN o.payment_method = 'card' AND o.status = 'completed' THEN o.total_price ELSE 0 END), 0) as card_revenue,
          COALESCE(SUM(CASE WHEN o.payment_method = 'cash' AND o.status = 'completed' THEN o.total_price ELSE 0 END), 0) as cash_revenue,
          COALESCE(SUM(CASE WHEN o.payment_method = 'card' AND o.status = 'completed' THEN o.total_price * 0.925 ELSE 0 END), 0) as card_amount_owed,
          COALESCE(SUM(CASE WHEN o.payment_method = 'cash' AND o.status = 'completed' THEN o.total_price * 0.075 ELSE 0 END), 0) as cash_commission_owed,
          COALESCE(SUM(CASE WHEN o.payment_method = 'card' AND o.status = 'completed' THEN o.total_price * 0.925 ELSE 0 END), 0) - 
          COALESCE(SUM(CASE WHEN o.payment_method = 'cash' AND o.status = 'completed' THEN o.total_price * 0.075 ELSE 0 END), 0) as net_balance,
          COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.total_price ELSE 0 END), 0) as total_revenue
         FROM orders o
         WHERE o.restaurant_id = $1`,
        [restaurant.id]
      );

      // Get monthly breakdown
      const monthlyResult = await pool.query(
        `SELECT 
          DATE_TRUNC('month', o.created_at) as month,
          COALESCE(SUM(CASE WHEN o.payment_method = 'card' AND o.status = 'completed' THEN o.total_price ELSE 0 END), 0) as card_revenue,
          COALESCE(SUM(CASE WHEN o.payment_method = 'cash' AND o.status = 'completed' THEN o.total_price ELSE 0 END), 0) as cash_revenue,
          COALESCE(SUM(CASE WHEN o.payment_method = 'card' AND o.status = 'completed' THEN o.total_price * 0.925 ELSE 0 END), 0) as card_amount_owed,
          COALESCE(SUM(CASE WHEN o.payment_method = 'cash' AND o.status = 'completed' THEN o.total_price * 0.075 ELSE 0 END), 0) as cash_commission_owed,
          COALESCE(SUM(CASE WHEN o.payment_method = 'card' AND o.status = 'completed' THEN o.total_price * 0.925 ELSE 0 END), 0) - 
          COALESCE(SUM(CASE WHEN o.payment_method = 'cash' AND o.status = 'completed' THEN o.total_price * 0.075 ELSE 0 END), 0) as net_balance
         FROM orders o
         WHERE o.restaurant_id = $1
         GROUP BY DATE_TRUNC('month', o.created_at)
         ORDER BY month DESC
         LIMIT 12`,
        [restaurant.id]
      );

      // Get order-level breakdown with net total calculation
      const ordersResult = await pool.query(
        `SELECT 
          o.id,
          o.total_price,
          o.payment_method,
          o.status,
          o.created_at,
          CASE 
            WHEN o.payment_method = 'card' THEN o.total_price * 0.925
            WHEN o.payment_method = 'cash' THEN o.total_price * 0.925
            ELSE 0
          END as net_total
         FROM orders o
         WHERE o.restaurant_id = $1 AND o.status = 'completed'
         ORDER BY o.created_at DESC
         LIMIT 100`,
        [restaurant.id]
      );

      success(res, {
        summary: summaryResult.rows[0],
        monthly: monthlyResult.rows,
        orders: ordersResult.rows
      }, 'Revenue data retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve revenue data', 500);
    }
  }
}


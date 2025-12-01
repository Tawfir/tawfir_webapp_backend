import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { success, error } from '../utils/response';
import { pool } from '../config/database';
import { uploadToS3, deleteFromS3, extractS3Key } from '../services/s3Service';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const updateRestaurantSchema = z.object({
  restaurant_name: z.string().min(1).max(255).optional(),
  address: z.string().min(1).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  public_phone: z.string().optional(),
  private_phone: z.string().optional(),
  working_hours: z.any().optional(),
  food_category_ids: z.array(z.number().int().positive()).optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  is_featured: z.boolean().optional(),
  owner_name: z.string().min(1).optional(),
  owner_email: z.string().email().optional(),
});

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
   * /api/admin/restaurants/{id}:
   *   get:
   *     summary: Get a single restaurant by ID (admin view)
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
   *         description: Restaurant retrieved successfully
   *       404:
   *         description: Restaurant not found
   */
  static async getRestaurant(req: AuthRequest, res: Response): Promise<void> {
    try {
      const restaurantId = parseInt(req.params.id);
      if (isNaN(restaurantId)) {
        error(res, 'Invalid restaurant ID', 400);
        return;
      }

      const result = await pool.query(
        `SELECT r.*, 
         u.name as owner_name, u.email as owner_email, u.phone as owner_phone,
         (SELECT json_agg(json_build_object('id', fc.id, 'name', fc.name, 'image', fc.image))
          FROM food_categories fc
          JOIN food_category_restaurant fcr ON fc.id = fcr.food_category_id
          WHERE fcr.restaurant_id = r.id) as categories
         FROM restaurants r
         JOIN users u ON r.user_id = u.id
         WHERE r.id = $1`,
        [restaurantId]
      );

      if (result.rows.length === 0) {
        error(res, 'Restaurant not found', 404);
        return;
      }

      success(res, { restaurant: result.rows[0] }, 'Restaurant retrieved successfully');
    } catch (err: any) {
      error(res, err.message || 'Failed to retrieve restaurant', 500);
    }
  }

  /**
   * @swagger
   * /api/admin/restaurants:
   *   post:
   *     summary: Create a new restaurant (admin only)
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required:
   *               - restaurant_name
   *               - address
   *               - lat
   *               - lng
   *               - owner_email
   *               - owner_name
   *               - owner_password
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
   *               status:
   *                 type: string
   *                 enum: [pending, approved, rejected]
   *               is_featured:
   *                 type: boolean
   *               owner_email:
   *                 type: string
   *               owner_name:
   *                 type: string
   *               owner_password:
   *                 type: string
   *               profile_pic:
   *                 type: string
   *                 format: binary
   *               cover_image:
   *                 type: string
   *                 format: binary
   *               place_pics:
   *                 type: array
   *                 items:
   *                   type: string
   *                   format: binary
   *     responses:
   *       201:
   *         description: Restaurant created successfully
   */
  static async createRestaurant(req: AuthRequest, res: Response): Promise<void> {
    let profilePicUrl: string | null = null;
    let coverImageUrl: string | null = null;
    
    try {
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
      if (req.body.status) bodyData.status = req.body.status;
      if (req.body.is_featured !== undefined) {
        bodyData.is_featured = req.body.is_featured === 'true' || req.body.is_featured === true;
      }
      if (req.body.owner_email) bodyData.owner_email = req.body.owner_email;
      if (req.body.owner_name) bodyData.owner_name = req.body.owner_name;
      if (req.body.owner_password) bodyData.owner_password = req.body.owner_password;

      // Validate required fields
      if (!bodyData.restaurant_name || !bodyData.address || bodyData.lat === undefined || bodyData.lng === undefined) {
        error(res, 'Missing required fields: restaurant_name, address, lat, lng', 400);
        return;
      }

      if (!bodyData.owner_email || !bodyData.owner_name || !bodyData.owner_password) {
        error(res, 'Missing required fields: owner_email, owner_name, owner_password', 400);
        return;
      }

      // Check if user with this email already exists
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        [bodyData.owner_email]
      );

      if (existingUser.rows.length > 0) {
        error(res, 'User with this email already exists', 400);
        return;
      }

      // Create user account for the restaurant owner
      const hashedPassword = await bcrypt.hash(bodyData.owner_password, 10);
      
      const userResult = await pool.query(
        `INSERT INTO users (name, email, password, phone, type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING *`,
        [bodyData.owner_name, bodyData.owner_email, hashedPassword, bodyData.private_phone || '', 'restaurant']
      );

      const newUser = userResult.rows[0];

      // Add restaurant role
      const roleResult = await pool.query('SELECT id FROM roles WHERE name = $1', ['restaurant']);
      if (roleResult.rows.length > 0) {
        await pool.query(
          'INSERT INTO role_user (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [newUser.id, roleResult.rows[0].id]
        );
      }

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

      // Create restaurant
      const restaurantResult = await pool.query(
        `INSERT INTO restaurants (user_id, name, address, lat, lng, public_phone, private_phone, 
         working_hours, status, is_featured, profile_pic, cover_image, place_pics, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
         RETURNING *`,
        [
          newUser.id,
          bodyData.restaurant_name,
          bodyData.address,
          bodyData.lat,
          bodyData.lng,
          bodyData.public_phone || null,
          bodyData.private_phone || null,
          bodyData.working_hours ? JSON.stringify(bodyData.working_hours) : JSON.stringify({}),
          bodyData.status || 'pending',
          bodyData.is_featured || false,
          profilePicUrl,
          coverImageUrl,
          placePicsUrls.length > 0 ? JSON.stringify(placePicsUrls) : null,
        ]
      );

      const restaurant = restaurantResult.rows[0];

      // Sync categories if provided
      if (bodyData.food_category_ids && bodyData.food_category_ids.length > 0) {
        for (const categoryId of bodyData.food_category_ids) {
          await pool.query(
            'INSERT INTO food_category_restaurant (food_category_id, restaurant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [categoryId, restaurant.id]
          );
        }
      }

      // Get created restaurant with categories
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

      success(res, finalResult.rows[0], 'Restaurant created successfully', 201);
    } catch (err: any) {
      error(res, err.message || 'Restaurant creation failed', 500);
    }
  }

  /**
   * @swagger
   * /api/admin/restaurants/{id}:
   *   put:
   *     summary: Update a restaurant by ID (admin only)
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
   *               status:
   *                 type: string
   *                 enum: [pending, approved, rejected]
   *               is_featured:
   *                 type: boolean
   *               profile_pic:
   *                 type: string
   *                 format: binary
   *               cover_image:
   *                 type: string
   *                 format: binary
   *               place_pics:
   *                 type: array
   *                 items:
   *                   type: string
   *                   format: binary
   *     responses:
   *       200:
   *         description: Restaurant updated successfully
   *       404:
   *         description: Restaurant not found
   */
  static async updateRestaurant(req: AuthRequest, res: Response): Promise<void> {
    let profilePicUrl: string | null = null;
    let coverImageUrl: string | null = null;
    let oldProfilePicUrl: string | null = null;
    let oldCoverImageUrl: string | null = null;
    
    try {
      const restaurantId = parseInt(req.params.id);
      if (isNaN(restaurantId)) {
        error(res, 'Invalid restaurant ID', 400);
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
      if (req.body.status) bodyData.status = req.body.status;
      if (req.body.is_featured !== undefined) {
        bodyData.is_featured = req.body.is_featured === 'true' || req.body.is_featured === true;
      }
      if (req.body.owner_name) bodyData.owner_name = req.body.owner_name;
      if (req.body.owner_email) bodyData.owner_email = req.body.owner_email;

      const validated = updateRestaurantSchema.parse(bodyData);

      // Get restaurant by ID (admin can update any restaurant)
      const restaurantResult = await pool.query(
        'SELECT * FROM restaurants WHERE id = $1',
        [restaurantId]
      );

      if (restaurantResult.rows.length === 0) {
        error(res, 'Restaurant not found', 404);
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
      if (validated.status) {
        updates.push(`status = $${paramCount++}`);
        values.push(validated.status);
      }
      if (validated.is_featured !== undefined) {
        updates.push(`is_featured = $${paramCount++}`);
        values.push(validated.is_featured);
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
        const existingPlacePics = restaurant.place_pics 
          ? (Array.isArray(restaurant.place_pics) ? restaurant.place_pics : [])
          : [];
        const allPlacePics = [...existingPlacePics, ...placePicsUrls];
        updates.push(`place_pics = $${paramCount++}`);
        values.push(JSON.stringify(allPlacePics));
      }

      if (updates.length > 0) {
        values.push(restaurantId);
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
            [validated.owner_email, restaurant.user_id]
          );
          if (emailCheck.rows.length > 0) {
            error(res, 'Email already exists for another user', 400);
            return;
          }
          userUpdates.push(`email = $${userParamCount++}`);
          userValues.push(validated.owner_email);
        }

        if (userUpdates.length > 0) {
          userValues.push(restaurant.user_id);
          const userQuery = `UPDATE users SET ${userUpdates.join(', ')}, updated_at = NOW() WHERE id = $${userParamCount}`;
          await pool.query(userQuery, userValues);
        }
      }

      // Sync categories if provided
      if (validated.food_category_ids) {
        await pool.query(
          'DELETE FROM food_category_restaurant WHERE restaurant_id = $1',
          [restaurantId]
        );

        for (const categoryId of validated.food_category_ids) {
          await pool.query(
            'INSERT INTO food_category_restaurant (food_category_id, restaurant_id) VALUES ($1, $2)',
            [categoryId, restaurantId]
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
        [restaurantId]
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
   * /api/admin/restaurants/{id}:
   *   delete:
   *     summary: Delete a restaurant by ID (admin only)
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
   *         description: Restaurant deleted successfully
   *       404:
   *         description: Restaurant not found
   */
  static async deleteRestaurant(req: AuthRequest, res: Response): Promise<void> {
    try {
      const restaurantId = parseInt(req.params.id);
      if (isNaN(restaurantId)) {
        error(res, 'Invalid restaurant ID', 400);
        return;
      }

      // Get restaurant to delete images from S3
      const restaurantResult = await pool.query(
        'SELECT * FROM restaurants WHERE id = $1',
        [restaurantId]
      );

      if (restaurantResult.rows.length === 0) {
        error(res, 'Restaurant not found', 404);
        return;
      }

      const restaurant = restaurantResult.rows[0];

      // Delete images from S3
      try {
        if (restaurant.profile_pic) {
          await deleteFromS3(extractS3Key(restaurant.profile_pic));
        }
        if (restaurant.cover_image) {
          await deleteFromS3(extractS3Key(restaurant.cover_image));
        }
        if (restaurant.place_pics && Array.isArray(restaurant.place_pics)) {
          for (const picUrl of restaurant.place_pics) {
            if (picUrl) {
              await deleteFromS3(extractS3Key(picUrl));
            }
          }
        }
      } catch (s3Err) {
        console.error('Failed to delete some images from S3:', s3Err);
        // Continue with deletion even if S3 deletion fails
      }

      // Get user_id before deleting restaurant
      const userId = restaurant.user_id;

      // Delete restaurant (cascade will handle related records like dishes, orders, etc.)
      await pool.query('DELETE FROM restaurants WHERE id = $1', [restaurantId]);

      // Delete the associated user (owner) account
      if (userId) {
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      }

      success(res, null, 'Restaurant deleted successfully');
    } catch (err: any) {
      error(res, err.message || 'Restaurant deletion failed', 500);
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
          `SELECT oi.id, oi.order_id, oi.dish_id, oi.quantity, oi.price_at_order_time as price, oi.created_at, oi.updated_at,
           json_build_object('id', d.id, 'name', d.name, 'image', d.image, 'price', d.price) as dish
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

  /**
   * @swagger
   * /api/admin/categories/{id}:
   *   delete:
   *     summary: Delete a food category by ID (admin only)
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
   *         description: Category deleted successfully
   *       404:
   *         description: Category not found
   */
  static async deleteCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const categoryId = parseInt(req.params.id);
      if (isNaN(categoryId)) {
        error(res, 'Invalid category ID', 400);
        return;
      }

      // Get category to delete image from S3
      const categoryResult = await pool.query(
        'SELECT * FROM food_categories WHERE id = $1',
        [categoryId]
      );

      if (categoryResult.rows.length === 0) {
        error(res, 'Category not found', 404);
        return;
      }

      const category = categoryResult.rows[0];

      // Delete image from S3 if exists
      if (category.image) {
        try {
          await deleteFromS3(extractS3Key(category.image));
        } catch (s3Err) {
          console.error('Failed to delete image from S3:', s3Err);
          // Continue with deletion even if S3 deletion fails
        }
      }

      // Delete category (cascade will handle related records like food_category_dish, food_category_restaurant)
      await pool.query('DELETE FROM food_categories WHERE id = $1', [categoryId]);

      success(res, null, 'Category deleted successfully');
    } catch (err: any) {
      error(res, err.message || 'Category deletion failed', 500);
    }
  }
}


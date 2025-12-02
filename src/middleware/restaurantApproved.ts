import { Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from './auth';

export const restaurantApproved = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Get restaurant for the authenticated user
    // Note: restaurants table uses 'name' column, not 'restaurant_name'
    const restaurantResult = await pool.query(
      'SELECT id, status, name FROM restaurants WHERE user_id = $1',
      [req.user.id]
    );

    if (restaurantResult.rows.length === 0) {
      res.status(403).json({ 
        error: 'Restaurant not found. Please register your restaurant first.',
        message: 'Restaurant not found. Please register your restaurant first.',
        code: 'RESTAURANT_NOT_FOUND',
        userId: req.user.id
      });
      return;
    }

    const restaurant = restaurantResult.rows[0];

    // Check if restaurant is approved (status = 'approved')
    if (restaurant.status !== 'approved') {
      res.status(403).json({ 
        error: 'Restaurant not approved',
        message: `Your restaurant "${restaurant.name || 'Restaurant'}" is ${restaurant.status}. Please wait for admin approval.`,
        status: restaurant.status,
        code: 'RESTAURANT_NOT_APPROVED'
      });
      return;
    }

    // Attach restaurant to request for use in controllers
    (req as any).restaurant = restaurant;
    next();
  } catch (error) {
    console.error('Restaurant approval middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


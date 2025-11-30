import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    name: string;
    type: string;
    [key: string]: any;
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized: No token provided' });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as {
      userId: number;
      [key: string]: any;
    };

    // Check if token exists in database (for token revocation)
    const tokenResult = await pool.query(
      'SELECT * FROM personal_access_tokens WHERE token = $1 AND expires_at > NOW()',
      [token]
    );

    if (tokenResult.rows.length === 0) {
      res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
      return;
    }

    // Get user from database
    const userResult = await pool.query(
      'SELECT id, name, email, phone, type, created_at, updated_at FROM users WHERE id = $1 AND deleted_at IS NULL',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      res.status(401).json({ error: 'Unauthorized: User not found' });
      return;
    }

    req.user = userResult.rows[0];
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};


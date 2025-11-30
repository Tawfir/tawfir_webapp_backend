import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { error } from '../utils/response';

/**
 * Middleware to check if the authenticated user is an admin
 */
export const isAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user) {
    error(res, 'Unauthorized', 401);
    return;
  }

  // Check if user type is admin
  if (req.user.type !== 'admin') {
    error(res, 'Forbidden: Admin access required', 403);
    return;
  }

  next();
};


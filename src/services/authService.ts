import { pool } from '../config/database';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  type: string;
  password?: string;
  created_at: Date;
  updated_at: Date;
}

export class AuthService {
  /**
   * Create a new user account
   */
  static async register(data: {
    name: string;
    email: string;
    phone: string;
    password: string;
    type?: string;
  }): Promise<{ user: Omit<User, 'password'>; token: string }> {
    // Check if email already exists
    const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1', [data.email]);
    if (emailCheck.rows.length > 0) {
      throw new Error('Email already exists');
    }

    // Check if phone already exists
    const phoneCheck = await pool.query('SELECT id FROM users WHERE phone = $1', [data.phone]);
    if (phoneCheck.rows.length > 0) {
      throw new Error('Phone number already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Create user
    const result = await pool.query(
      `INSERT INTO users (name, email, phone, password, type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, name, email, phone, type, created_at, updated_at`,
      [data.name, data.email, data.phone, hashedPassword, data.type || 'user']
    );

    const user = result.rows[0];

    // Assign user role
    const roleResult = await pool.query('SELECT id FROM roles WHERE name = $1', ['user']);
    if (roleResult.rows.length > 0) {
      await pool.query(
        'INSERT INTO role_user (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [user.id, roleResult.rows[0].id]
      );
    }

    // Generate token
    const token = await this.createToken(user.id);

    return { user, token };
  }

  /**
   * Authenticate user and return token
   */
  static async login(email: string, password: string): Promise<{ user: Omit<User, 'password'>; token: string }> {
    // Get user with password
    const result = await pool.query(
      'SELECT id, name, email, phone, password, type, created_at, updated_at FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = result.rows[0];

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Remove password from user object
    delete user.password;

    // Generate token
    const token = await this.createToken(user.id);

    return { user, token };
  }

  /**
   * Create a JWT token and store it in database
   */
  static async createToken(userId: number): Promise<string> {
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    
    // Type assertion for expiresIn to satisfy jsonwebtoken types
    const token = jwt.sign(
      { userId },
      secret,
      { expiresIn: expiresIn as any }
    );

    // Calculate expiration date
    const expiresAt = new Date();
    if (expiresIn.includes('d')) {
      expiresAt.setDate(expiresAt.getDate() + parseInt(expiresIn));
    } else if (expiresIn.includes('h')) {
      expiresAt.setHours(expiresAt.getHours() + parseInt(expiresIn));
    }

    // Store token in database
    await pool.query(
      `INSERT INTO personal_access_tokens (tokenable_type, tokenable_id, name, token, abilities, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      ['App\\Models\\User', userId, 'user-token', token, '["*"]', expiresAt]
    );

    return token;
  }

  /**
   * Revoke a token
   */
  static async revokeToken(token: string): Promise<void> {
    await pool.query('DELETE FROM personal_access_tokens WHERE token = $1', [token]);
  }

  /**
   * Revoke all tokens for a user
   */
  static async revokeAllTokens(userId: number): Promise<void> {
    await pool.query('DELETE FROM personal_access_tokens WHERE tokenable_id = $1', [userId]);
  }

  /**
   * Generate password reset code
   */
  static async generateResetCode(email: string): Promise<string> {
    const code = crypto.randomInt(100000, 999999).toString();

    // Store or update reset code
    await pool.query(
      `INSERT INTO password_reset_tokens (email, token, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (email) DO UPDATE SET token = $2, created_at = NOW()`,
      [email, code]
    );

    return code;
  }

  /**
   * Verify password reset code
   */
  static async verifyResetCode(email: string, code: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT * FROM password_reset_tokens 
       WHERE email = $1 AND token = $2 AND created_at > NOW() - INTERVAL '60 minutes'`,
      [email, code]
    );

    return result.rows.length > 0;
  }

  /**
   * Reset password with code
   */
  static async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    // Verify code first
    const isValid = await this.verifyResetCode(email, code);
    if (!isValid) {
      throw new Error('Invalid or expired reset code');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE email = $2',
      [hashedPassword, email]
    );

    // Delete reset code
    await pool.query('DELETE FROM password_reset_tokens WHERE email = $1', [email]);
  }

  /**
   * Update user password
   */
  static async updatePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    // Get current password
    const result = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, result.rows[0].password);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, userId]
    );
  }
}


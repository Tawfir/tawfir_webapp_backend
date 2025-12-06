import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public routes
router.get('/metrics', AuthController.getMetrics);
router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/request-password-reset-code', AuthController.requestPasswordResetCode);
router.post('/check-reset-code', AuthController.checkResetCode);
router.post('/reset-password-with-code', AuthController.resetPasswordWithCode);

// Protected routes
router.post('/refresh', authenticate, AuthController.refresh);
router.post('/logout', authenticate, AuthController.logout);
router.get('/user', authenticate, AuthController.user);
router.put('/update-profile', authenticate, AuthController.updateProfile);
router.post('/password/update', authenticate, AuthController.updatePassword);
router.delete('/user', authenticate, AuthController.deleteAccount);

export default router;


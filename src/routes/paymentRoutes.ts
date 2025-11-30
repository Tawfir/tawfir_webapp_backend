import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { PaymentController, StripeWebhookController } from '../controllers/paymentController';

const router = Router();

// Checkout requires authentication
router.post('/checkout', authenticate, PaymentController.checkout);

export default router;


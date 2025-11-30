import { Router } from 'express';
import { authenticate } from '../middleware/auth';
// Controllers will be imported here
// import { PaymentController } from '../controllers/paymentController';

const router = Router();

// Checkout requires authentication
// router.post('/checkout', authenticate, PaymentController.checkout);

// Webhook is public (no auth)
// router.post('/stripe/webhook', PaymentController.handleStripeWebhook);

export default router;


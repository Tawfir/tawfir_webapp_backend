import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { pool } from './config/database';
import { swaggerSpec } from './config/swagger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for Swagger UI
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
// Raw body parser for Stripe webhook (must be before json parser)
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// Note: We do NOT apply body parsers globally
// Routes with file uploads (restaurantRoutes, adminRoutes) use multer which handles multipart/form-data
// Routes without file uploads get JSON parser applied individually below

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Tawfir API Documentation',
}));

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// API Routes
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import restaurantRoutes from './routes/restaurantRoutes';
import paymentRoutes from './routes/paymentRoutes';
import adminRoutes from './routes/adminRoutes';

// Routes that need JSON body parsing (no file uploads)
app.use('/api/auth', express.json({ limit: '10mb' }), express.urlencoded({ extended: true, limit: '10mb' }), authRoutes);
app.use('/api/user', express.json({ limit: '10mb' }), express.urlencoded({ extended: true, limit: '10mb' }), userRoutes);
app.use('/api/payment', express.json({ limit: '10mb' }), express.urlencoded({ extended: true, limit: '10mb' }), paymentRoutes);

// Routes with file uploads - NO JSON parser (multer handles multipart/form-data and populates req.body)
app.use('/api/restaurant', restaurantRoutes);
app.use('/api/admin', adminRoutes);

// Stripe webhook (public, no auth, needs raw body)
import { StripeWebhookController } from './controllers/paymentController';
app.post('/api/stripe/webhook', StripeWebhookController.handle);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message 
  });
});

// For Vercel serverless, export the app
// For local development, start the server
if (require.main === module) {
  // Running directly (local development)
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
  });
} else {
  // Imported as module (Vercel serverless)
  module.exports = app;
}


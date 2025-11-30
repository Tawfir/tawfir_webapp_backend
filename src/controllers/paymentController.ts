import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { success, error } from '../utils/response';
import { pool } from '../config/database';
import { z } from 'zod';
import { paymentDrivers, StripePaymentDriver } from '../services/paymentDrivers';
import { WalletService } from '../services/walletService';

const checkoutSchema = z.object({
  payment_method: z.enum(['stripe', 'cash']),
});

const SERVICE_FEE_PERCENT = 7.5;

export class PaymentController {
  /**
   * @swagger
   * /api/payment/checkout:
   *   post:
   *     summary: Process checkout and create orders
   *     tags: [Payments]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - payment_method
   *             properties:
   *               payment_method:
   *                 type: string
   *                 enum: [stripe, cash]
   *     responses:
   *       200:
   *         description: Checkout successful, proceed to payment
   *       422:
   *         description: Checkout failed
   */
  static async checkout(req: AuthRequest, res: Response): Promise<void> {
    const client = await pool.connect();
    
    try {
      if (!req.user) {
        error(res, 'Unauthorized', 401);
        return;
      }

      const validated = checkoutSchema.parse(req.body);
      const userId = req.user.id;

      await client.query('BEGIN');

      // 1️⃣ Get cart items
      const cartResult = await pool.query(
        `SELECT c.*, d.*, d.restaurant_id
         FROM carts c
         JOIN dishes d ON c.dish_id = d.id
         WHERE c.user_id = $1
         ORDER BY d.restaurant_id`,
        [userId]
      );

      if (cartResult.rows.length === 0) {
        await client.query('ROLLBACK');
        error(res, 'Cart is empty', 422);
        return;
      }

      // 2️⃣ Group cart items by restaurant
      const itemsByRestaurant: Record<number, any[]> = {};
      for (const item of cartResult.rows) {
        const restaurantId = item.restaurant_id;
        if (!itemsByRestaurant[restaurantId]) {
          itemsByRestaurant[restaurantId] = [];
        }
        itemsByRestaurant[restaurantId].push(item);
      }

      // 3️⃣ Create orders for each restaurant
      const orders: any[] = [];
      const payments: any[] = [];

      for (const [restaurantId, items] of Object.entries(itemsByRestaurant)) {
        const restaurantIdNum = parseInt(restaurantId);
        const firstItem = items[0];
        const pickupTime = firstItem.pickup_time || new Date(Date.now() + 60 * 60 * 1000).toISOString();

        // Create order
        const orderResult = await client.query(
          `INSERT INTO orders (user_id, restaurant_id, total_price, pickup_time, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           RETURNING *`,
          [userId, restaurantIdNum, 0, pickupTime, 'incoming']
        );

        const order = orderResult.rows[0];
        let total = 0;

        // Create order items and calculate total
        for (const item of items) {
          const dish = item;
          const price = dish.discounted_price || dish.price;
          const quantity = item.quantity;

          // Check if enough quantity available
          if (dish.quantity < quantity) {
            await client.query('ROLLBACK');
            error(res, `Not enough quantity for ${dish.name}`, 422);
            return;
          }

          // Create order item
          await client.query(
            `INSERT INTO order_items (order_id, dish_id, quantity, price_at_order_time, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())`,
            [order.id, dish.id, quantity, price]
          );

          // Decrement dish quantity
          await client.query(
            'UPDATE dishes SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2',
            [quantity, dish.id]
          );

          total += price * quantity;
        }

        // Update order total
        await client.query(
          'UPDATE orders SET total_price = $1, updated_at = NOW() WHERE id = $2',
          [total, order.id]
        );

        order.total_price = total;
        orders.push(order);

        // 4️⃣ Create transaction
        const amountCents = Math.round(total * 100);
        const currency = 'usd';

        const transactionResult = await client.query(
          `INSERT INTO transactions (order_id, user_id, amount_cents, currency, type, method, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
           RETURNING *`,
          [order.id, userId, amountCents, currency, 'payment', validated.payment_method, 'pending']
        );

        const transaction = transactionResult.rows[0];

        // 5️⃣ Create payment intent using driver
        const driver = paymentDrivers[validated.payment_method];
        if (!driver) {
          await client.query('ROLLBACK');
          error(res, 'Invalid payment method', 400);
          return;
        }

        const intent = await driver.createIntent(amountCents, currency, {
          order_id: order.id,
          transaction_id: transaction.id,
        });

        // Update transaction with gateway info
        await client.query(
          `UPDATE transactions SET gateway_id = $1, response_raw = $2, updated_at = NOW() WHERE id = $3`,
          [intent.payment_intent_id, JSON.stringify(intent), transaction.id]
        );

        payments.push({
          order_id: order.id,
          transaction_id: transaction.id,
          client_secret: intent.client_secret,
        });

        // 6️⃣ Clear cart for cash payments only
        if (validated.payment_method === 'cash') {
          await client.query('DELETE FROM carts WHERE user_id = $1', [userId]);
        }
      }

      await client.query('COMMIT');

      // Get full order details with relations
      const orderIds = orders.map(o => o.id);
      const fullOrders = [];
      for (const orderId of orderIds) {
        const orderResult = await pool.query(
          `SELECT o.*,
           json_build_object('id', r.id, 'name', r.name, 'profile_pic', r.profile_pic) as restaurant
           FROM orders o
           JOIN restaurants r ON o.restaurant_id = r.id
           WHERE o.id = $1`,
          [orderId]
        );

        const order = orderResult.rows[0];

        // Get order items with dishes
        const itemsResult = await pool.query(
          `SELECT oi.*,
           json_build_object('id', d.id, 'name', d.name, 'image', d.image) as dish
           FROM order_items oi
           JOIN dishes d ON oi.dish_id = d.id
           WHERE oi.order_id = $1`,
          [order.id]
        );

        order.items = itemsResult.rows;
        fullOrders.push(order);
      }

      success(
        res,
        {
          payments,
          payment_method: validated.payment_method,
          orders: fullOrders,
        },
        'Proceed to payment'
      );
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      if (err instanceof z.ZodError) {
        error(res, 'Validation error', 400, err.errors);
        return;
      }
      error(res, `Checkout failed: ${err.message}`, 422);
    } finally {
      client.release();
    }
  }
}

export class StripeWebhookController {
  /**
   * @swagger
   * /api/stripe/webhook:
   *   post:
   *     summary: Handle Stripe webhook events
   *     tags: [Payments]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Webhook processed successfully
   */
  static async handle(req: Request, res: Response): Promise<void> {
    try {
      const Stripe = require('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        error(res, 'Webhook secret not configured', 500);
        return;
      }

      const signature = req.headers['stripe-signature'] as string;
      if (!signature) {
        error(res, 'Missing Stripe signature', 400);
        return;
      }

      // req.body is already raw buffer from express.raw() middleware
      const rawBody = req.body as Buffer;
      
      let event: any;
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      } catch (err: any) {
        error(res, `Webhook signature verification failed: ${err.message}`, 400);
        return;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        switch (event.type) {
          case 'payment_intent.succeeded':
            await handlePaymentSuccess(event.data.object, client);
            break;

          case 'charge.refunded':
            await handleRefund(event.data.object, client);
            break;

          case 'payment_intent.payment_failed':
            await handlePaymentFailed(event.data.object, client);
            break;
        }

        await client.query('COMMIT');
        res.status(200).send();
      } catch (err: any) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Webhook processing error:', err);
        error(res, `Webhook processing failed: ${err.message}`, 500);
      } finally {
        client.release();
      }
    } catch (err: any) {
      error(res, `Webhook handling failed: ${err.message}`, 500);
    }
  }
}

async function handlePaymentSuccess(paymentIntent: any, client: any): Promise<void> {
  // 1️⃣ Update transaction
  const transactionResult = await client.query(
    `UPDATE transactions 
     SET status = $1, response_raw = $2, updated_at = NOW()
     WHERE gateway_id = $3
     RETURNING *`,
    ['success', JSON.stringify(paymentIntent), paymentIntent.id]
  );

  if (transactionResult.rows.length === 0) {
    throw new Error('Transaction not found');
  }

  const transaction = transactionResult.rows[0];

  // 2️⃣ Get order and calculate net amount
  const orderResult = await client.query('SELECT * FROM orders WHERE id = $1', [transaction.order_id]);
  if (orderResult.rows.length === 0) {
    throw new Error('Order not found');
  }

  const order = orderResult.rows[0];
  const total = parseFloat(order.total_price);
  const serviceFee = (total * SERVICE_FEE_PERCENT) / 100;
  const netToRestaurant = total - serviceFee;

  // 3️⃣ Credit restaurant wallet
  await WalletService.credit(
    'App\\Models\\Restaurant',
    order.restaurant_id,
    netToRestaurant,
    `Order #${order.id}`,
    order.id
  );

  // 4️⃣ Clear user's cart for this order's dishes
  const itemsResult = await client.query(
    'SELECT dish_id FROM order_items WHERE order_id = $1',
    [order.id]
  );

  const dishIds = itemsResult.rows.map((row: any) => row.dish_id);
  if (dishIds.length > 0) {
    await client.query(
      'DELETE FROM carts WHERE user_id = $1 AND dish_id = ANY($2)',
      [order.user_id, dishIds]
    );
  }
}

async function handleRefund(charge: any, client: any): Promise<void> {
  const transactionResult = await client.query(
    'SELECT * FROM transactions WHERE gateway_id = $1',
    [charge.payment_intent]
  );

  if (transactionResult.rows.length === 0) {
    return; // Transaction not found, skip
  }

  const transaction = transactionResult.rows[0];
  const orderResult = await client.query('SELECT * FROM orders WHERE id = $1', [transaction.order_id]);

  if (orderResult.rows.length === 0) {
    return;
  }

  const order = orderResult.rows[0];
  const total = parseFloat(order.total_price);
  const serviceFee = (total * SERVICE_FEE_PERCENT) / 100;
  const net = total - serviceFee;

  // Debit restaurant wallet
  await WalletService.debit(
    'App\\Models\\Restaurant',
    order.restaurant_id,
    net,
    `Refund Order #${order.id}`,
    order.id
  );
}

async function handlePaymentFailed(paymentIntent: any, client: any): Promise<void> {
  await client.query(
    `UPDATE transactions 
     SET status = $1, response_raw = $2, updated_at = NOW()
     WHERE gateway_id = $3`,
    ['failed', JSON.stringify(paymentIntent), paymentIntent.id]
  );
}


export interface PaymentIntentResult {
  payment_intent_id: string | null;
  client_secret: string | null;
}

export interface PaymentDriver {
  createIntent(amountCents: number, currency: string, metadata: Record<string, any>): Promise<PaymentIntentResult>;
}

export class StripePaymentDriver implements PaymentDriver {
  async createIntent(amountCents: number, currency: string, metadata: Record<string, any>): Promise<PaymentIntentResult> {
    try {
      const Stripe = require('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
        apiVersion: '2024-12-18.acacia',
      });

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: currency || 'usd',
        metadata,
        payment_method_types: ['card'],
      });

      return {
        payment_intent_id: paymentIntent.id,
        client_secret: paymentIntent.client_secret,
      };
    } catch (error) {
      throw new Error(`Stripe payment intent creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export class CashPaymentDriver implements PaymentDriver {
  async createIntent(amountCents: number, currency: string, metadata: Record<string, any>): Promise<PaymentIntentResult> {
    // For cash payments, no external API call needed
    return {
      payment_intent_id: null,
      client_secret: null,
    };
  }
}

export const paymentDrivers: Record<string, PaymentDriver> = {
  stripe: new StripePaymentDriver(),
  cash: new CashPaymentDriver(),
};

